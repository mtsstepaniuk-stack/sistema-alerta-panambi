"""Entrada final para la versión entregada a testing.

Mantiene la frecuencia de mediciones cada 5 minutos y agrega la capa de seguridad
para reportes vecinales:
- registro obligatorio de vecinos con DNI y correo únicos;
- contraseñas de vecinos almacenadas con PBKDF2;
- Cloudflare Turnstile validado en backend;
- reportes sólo para vecinos autenticados;
- límite de frecuencia por vecino;
- el SAT recibe la medición del subsistema externo y no calibra precisión física.
"""

import hashlib
import hmac
import os
import re
import secrets
import time
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_testing as previous
import server_rf11 as auth_layer

base = previous.base
SENSOR_READING_INTERVAL_SECONDS = 5 * 60
_underlying_simulator = None

TURNSTILE_SITE_KEY = str(os.environ.get("TURNSTILE_SITE_KEY") or "0x4AAAAAAFHy-GMbFmE81XFg").strip()
TURNSTILE_SECRET_KEY = str(os.environ.get("TURNSTILE_SECRET_KEY") or "").strip()
REPORT_LIMIT = 3
REPORT_WINDOW_MINUTES = 30
REPORT_COOLDOWN_MINUTES = 2
REGISTRATION_LIMIT_PER_IP = 5
REGISTRATION_WINDOW_SECONDS = 60 * 60
_registration_attempts = {}


def _password_hash(password):
    salt = secrets.token_bytes(16)
    iterations = 210000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256$%d$%s$%s" % (
        iterations,
        salt.hex(),
        digest.hex(),
    )


def _password_matches(password, stored):
    stored = str(stored or "")
    if not stored.startswith("pbkdf2_sha256$"):
        return hmac.compare_digest(stored, str(password or ""))
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$", 3)
        candidate = hashlib.pbkdf2_hmac(
            "sha256",
            str(password or "").encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except Exception:
        return False


def _client_ip(handler):
    forwarded = str(handler.headers.get("X-Forwarded-For") or "").split(",", 1)[0].strip()
    return forwarded or str(handler.client_address[0] if handler.client_address else "")


def _turnstile_configured():
    return bool(TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY)


def _verify_turnstile(token, remote_ip=""):
    if not _turnstile_configured():
        return False, "La protección CAPTCHA todavía no fue configurada en el servidor."
    token = str(token or "").strip()
    if not token:
        return False, "Complete la verificación CAPTCHA."

    body = urllib.parse.urlencode({
        "secret": TURNSTILE_SECRET_KEY,
        "response": token,
        "remoteip": remote_ip,
    }).encode("utf-8")
    try:
        request = urllib.request.Request(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data=body,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            result = __import__("json").loads(response.read().decode("utf-8"))
        return (True, "") if bool(result.get("success")) else (False, "No se pudo validar el CAPTCHA. Intente nuevamente.")
    except Exception:
        return False, "No se pudo validar el CAPTCHA en este momento."


def _registration_allowed(ip):
    now = time.time()
    attempts = [t for t in _registration_attempts.get(ip, []) if now - t < REGISTRATION_WINDOW_SECONDS]
    if len(attempts) >= REGISTRATION_LIMIT_PER_IP:
        _registration_attempts[ip] = attempts
        return False
    attempts.append(now)
    _registration_attempts[ip] = attempts
    return True


def simulate_sensor_readings_every_five_minutes(conn):
    """Simula la llegada de datos ya procesados desde el subsistema externo.

    El SAT no corrige ni calibra la precisión física del sensor. Sólo recibe el
    nivel informado y aplica los umbrales de riesgo propios del sistema.
    """
    last = conn.execute("SELECT MAX(registrado_en) FROM mediciones").fetchone()[0]
    if last:
        elapsed = conn.execute(
            "SELECT CAST((julianday('now') - julianday(?)) * 86400 AS INTEGER)",
            (last,),
        ).fetchone()[0]
        if elapsed is not None and int(elapsed) < SENSOR_READING_INTERVAL_SECONDS:
            return

    if _underlying_simulator:
        return _underlying_simulator(conn)


def init_db():
    previous.init_db()

    with base.get_conn() as conn:
        base.ensure_column(conn, "usuarios", "dni", "TEXT")
        base.ensure_column(conn, "usuarios", "email", "TEXT")
        base.ensure_column(conn, "usuarios", "zona", "TEXT")
        base.ensure_column(conn, "usuarios", "telefono", "TEXT")
        base.ensure_column(conn, "incidencias", "vecino_usuario_id", "INTEGER")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_dni ON usuarios(dni) WHERE dni IS NOT NULL AND dni <> ''")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios(LOWER(email)) WHERE email IS NOT NULL AND email <> ''")

        # Cuenta vecinal de demostración para pruebas rápidas del proyecto.
        demo_password = _password_hash("vecino")
        demo = conn.execute(
            "SELECT id FROM usuarios WHERE LOWER(usuario) = 'vecino' LIMIT 1"
        ).fetchone()
        if demo:
            conn.execute(
                """
                UPDATE usuarios
                SET password = ?, nombre = 'Vecino de Prueba', rol = 'Vecino',
                    dni = '99999999', email = 'vecino@sat.local',
                    zona = 'Ribera Norte', telefono = '', activo = 1
                WHERE id = ?
                """,
                (demo_password, int(demo["id"])),
            )
        else:
            conn.execute(
                """
                INSERT INTO usuarios
                  (usuario, password, nombre, rol, dni, email, zona, telefono, activo)
                VALUES
                  ('vecino', ?, 'Vecino de Prueba', 'Vecino',
                   '99999999', 'vecino@sat.local', 'Ribera Norte', '', 1)
                """,
                (demo_password,),
            )

    global _underlying_simulator
    if _underlying_simulator is None:
        _underlying_simulator = base.simulate_sensor_readings
        base.simulate_sensor_readings = simulate_sensor_readings_every_five_minutes


class AppHandler(previous.AppHandler):
    _cached_json = None

    def read_json(self):
        if self._cached_json is not None:
            return self._cached_json
        self._cached_json = super().read_json()
        return self._cached_json

    def _login_secure(self):
        data = self.read_json()
        usuario = str(data.get("usuario") or "").strip().lower()
        password = str(data.get("password") or "")
        if not usuario or not password:
            return self.send_json({"ok": False, "error": "Debe ingresar usuario y contraseña."}, 400)
        if len(usuario) > 120 or len(password) > 128:
            return self.send_json({"ok": False, "error": "Credenciales inválidas."}, 400)

        with base.get_conn() as conn:
            row = conn.execute(
                """
                SELECT id, usuario, password, nombre, rol, dni, email, zona, telefono
                FROM usuarios
                WHERE LOWER(usuario) = ? AND activo = 1
                """,
                (usuario,),
            ).fetchone()

        if not row or not _password_matches(password, row["password"]):
            return self.send_json({"ok": False, "error": "Usuario o contraseña incorrectos."}, 401)

        user = dict(row)
        user.pop("password", None)
        token = auth_layer._new_session(user)
        return self.send_json({
            "ok": True,
            "user": user,
            "token": token,
            "expires_in": auth_layer.SESSION_TTL_SECONDS,
        })

    def _register_neighbor(self):
        data = self.read_json()
        ip = _client_ip(self)
        if not _registration_allowed(ip):
            return self.send_json({"ok": False, "error": "Se alcanzó el límite temporal de registros desde esta conexión. Intente más tarde."}, 429)

        valid_captcha, captcha_error = _verify_turnstile(data.get("turnstileToken"), ip)
        if not valid_captcha:
            return self.send_json({"ok": False, "error": captcha_error}, 400)

        nombre = re.sub(r"\s+", " ", str(data.get("nombre") or "").strip())
        dni_raw = str(data.get("dni") or "").strip()
        dni = re.sub(r"\D", "", dni_raw)
        email = str(data.get("email") or "").strip().lower()
        password = str(data.get("password") or "")
        zona = str(data.get("zona") or "").strip()
        telefono = re.sub(r"\D", "", str(data.get("telefono") or "").strip())

        if not nombre or not dni or not email or not password or not zona:
            return self.send_json({"ok": False, "error": "Nombre, DNI, correo, contraseña y zona son obligatorios."}, 400)
        if len(nombre) < 3 or len(nombre) > 80 or not re.fullmatch(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+", nombre):
            return self.send_json({"ok": False, "error": "Ingrese un nombre válido de hasta 80 caracteres."}, 400)
        if not re.fullmatch(r"\d{7,8}", dni_raw):
            return self.send_json({"ok": False, "error": "El DNI debe contener únicamente 7 u 8 números."}, 400)
        if len(email) > 120 or not re.fullmatch(r"[^@\s]{1,64}@[^@\s]+\.[^@\s]+", email):
            return self.send_json({"ok": False, "error": "Ingrese un correo electrónico válido de hasta 120 caracteres."}, 400)
        if telefono:
            if not re.fullmatch(r"\d{8,13}", telefono):
                return self.send_json({"ok": False, "error": "Ingrese un teléfono válido de entre 8 y 13 números, incluyendo el código de país."}, 400)
            telefono = "+" + telefono
        if len(password) < 8 or len(password) > 72:
            return self.send_json({"ok": False, "error": "La contraseña debe tener entre 8 y 72 caracteres."}, 400)
        allowed_zones = {"Ribera Norte", "Bajo Uruguay", "Costa Sur", "Zona Alta", "Puente", "Arroyo", "Otra zona"}
        if zona not in allowed_zones:
            return self.send_json({"ok": False, "error": "Seleccione una zona válida."}, 400)

        with base.get_conn() as conn:
            if conn.execute("SELECT 1 FROM usuarios WHERE dni = ? LIMIT 1", (dni,)).fetchone():
                return self.send_json({"ok": False, "error": "Ya existe una cuenta asociada a ese DNI."}, 409)
            if conn.execute("SELECT 1 FROM usuarios WHERE LOWER(email) = ? OR LOWER(usuario) = ? LIMIT 1", (email, email)).fetchone():
                return self.send_json({"ok": False, "error": "Ya existe una cuenta asociada a ese correo."}, 409)

            cur = conn.execute(
                """
                INSERT INTO usuarios (usuario, password, nombre, rol, dni, email, zona, telefono)
                VALUES (?, ?, ?, 'Vecino', ?, ?, ?, ?)
                """,
                (email, _password_hash(password), nombre, dni, email, zona, telefono),
            )
            user_id = int(cur.lastrowid)
            base.insert_history(
                conn,
                "Usuario",
                "Registro de vecino",
                "Cuenta vecinal verificada por CAPTCHA · DNI único en SAT",
                badge="ALTA",
                zona=zona,
                riesgo="Verde",
            )

        return self.send_json({
            "ok": True,
            "message": "Registro completado. Ya puede iniciar sesión con su correo.",
            "userId": user_id,
        }, 201)

    def _authorize_neighbor_report(self, data):
        if not self._require_session(admin=False):
            return False

        user = self.auth_user or {}
        if str(user.get("rol") or "") != "Vecino":
            self.send_json({"ok": False, "error": "Los reportes vecinales sólo pueden enviarse desde una cuenta de vecino."}, 403)
            return False

        ip = _client_ip(self)
        valid_captcha, captcha_error = _verify_turnstile(data.get("turnstileToken"), ip)
        if not valid_captcha:
            self.send_json({"ok": False, "error": captcha_error}, 400)
            return False

        user_id = int(user["id"])
        with base.get_conn() as conn:
            recent = conn.execute(
                """
                SELECT COUNT(*) FROM incidencias
                WHERE vecino_usuario_id = ?
                  AND creada_en >= datetime('now', ?)
                """,
                (user_id, f"-{REPORT_WINDOW_MINUTES} minutes"),
            ).fetchone()[0]
            if int(recent or 0) >= REPORT_LIMIT:
                self.send_json({
                    "ok": False,
                    "error": f"Alcanzó el límite de {REPORT_LIMIT} reportes cada {REPORT_WINDOW_MINUTES} minutos. Si existe peligro inmediato, contacte a Defensa Civil.",
                }, 429)
                return False

            last = conn.execute(
                """
                SELECT creada_en FROM incidencias
                WHERE vecino_usuario_id = ?
                ORDER BY creada_en DESC, id DESC LIMIT 1
                """,
                (user_id,),
            ).fetchone()
            if last:
                elapsed = conn.execute(
                    "SELECT CAST((julianday('now') - julianday(?)) * 1440 AS INTEGER)",
                    (last["creada_en"],),
                ).fetchone()[0]
                if elapsed is not None and int(elapsed) < REPORT_COOLDOWN_MINUTES:
                    self.send_json({
                        "ok": False,
                        "error": f"Debe esperar {REPORT_COOLDOWN_MINUTES} minutos entre reportes.",
                    }, 429)
                    return False

        data["nombre"] = user.get("nombre") or ""
        data["dni"] = user.get("dni") or ""
        if not data["dni"]:
            self.send_json({"ok": False, "error": "La cuenta vecinal no tiene un DNI asociado."}, 403)
            return False
        return True

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/public-config":
            return self.send_json({
                "ok": True,
                "turnstileSiteKey": TURNSTILE_SITE_KEY,
                "turnstileConfigured": _turnstile_configured(),
                "reportLimit": REPORT_LIMIT,
                "reportWindowMinutes": REPORT_WINDOW_MINUTES,
            })
        return super().do_GET()

    def do_POST(self):
        self._cached_json = None
        path = urlparse(self.path).path

        if path == "/api/auth/login":
            return self._login_secure()

        if path == "/api/vecinos/registro":
            return self._register_neighbor()

        if path == "/api/incidencias":
            data = self.read_json()
            if not self._authorize_neighbor_report(data):
                return

            with base.get_conn() as conn:
                before_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM incidencias").fetchone()[0]

            result = super().do_POST()

            try:
                with base.get_conn() as conn:
                    conn.execute(
                        """
                        UPDATE incidencias
                        SET vecino_usuario_id = ?
                        WHERE id = (
                          SELECT id FROM incidencias
                          WHERE id > ?
                          ORDER BY id DESC LIMIT 1
                        )
                        """,
                        (int(self.auth_user["id"]), int(before_id)),
                    )
            except Exception as exc:
                print(f"[Seguridad vecinal] No se pudo vincular el reporte con el vecino: {exc}")
            return result

        return super().do_POST()


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("Seguridad vecinal: registro, CAPTCHA y límites de reportes habilitados")
    print("Sensores externos: SAT consume mediciones procesadas cada 5 minutos")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
