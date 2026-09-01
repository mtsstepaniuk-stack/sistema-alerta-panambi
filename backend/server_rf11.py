"""Extensión incremental para RF11 sobre la versión RF10.

RF11 completa la autenticación y el control de roles también en backend:
- el login crea una sesión con token temporal;
- las APIs operativas requieren una sesión válida;
- administración de usuarios y configuración de umbrales requieren Administrador;
- el reporte vecinal continúa siendo público;
- el backend usa el usuario autenticado como operador de las acciones.

La migración de contraseñas a hash seguro corresponde al requisito no funcional de
seguridad y se mantiene separada de este cambio funcional.
"""

import secrets
import time
from http.server import ThreadingHTTPServer
from threading import Lock
from urllib.parse import urlparse

import server_rf10 as previous

base = previous.base

SESSION_TTL_SECONDS = 12 * 60 * 60
_sessions = {}
_sessions_lock = Lock()


def init_db():
    previous.init_db()


def _is_admin(user):
    return bool(user) and (user.get("usuario") == "admin" or user.get("rol") == "Administrador")


def _new_session(user):
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _sessions_lock:
        # Limpieza oportunista de sesiones vencidas.
        expired = [key for key, value in _sessions.items() if value["expires_at"] <= now]
        for key in expired:
            _sessions.pop(key, None)
        _sessions[token] = {
            "user_id": int(user["id"]),
            "expires_at": now + SESSION_TTL_SECONDS,
        }
    return token


def _session_user(token):
    if not token:
        return None

    now = time.time()
    with _sessions_lock:
        session = _sessions.get(token)
        if not session:
            return None
        if session["expires_at"] <= now:
            _sessions.pop(token, None)
            return None
        user_id = session["user_id"]

    # Se consulta la base en cada request para respetar inmediatamente una baja
    # o un cambio de rol efectuado por el administrador.
    with base.get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, usuario, nombre, rol
            FROM usuarios
            WHERE id = ? AND activo = 1
            """,
            (user_id,),
        ).fetchone()
    return dict(row) if row else None


class AppHandler(previous.AppHandler):
    auth_user = None

    def _bearer_token(self):
        header = str(self.headers.get("Authorization") or "").strip()
        if not header.lower().startswith("bearer "):
            return ""
        return header.split(" ", 1)[1].strip()

    def _require_session(self, admin=False):
        user = _session_user(self._bearer_token())
        if not user:
            self.send_json(
                {"ok": False, "error": "Sesión inválida o vencida. Inicie sesión nuevamente."},
                401,
            )
            return False

        if admin and not _is_admin(user):
            self.send_json(
                {"ok": False, "error": "Esta acción requiere rol Administrador."},
                403,
            )
            return False

        self.auth_user = user
        return True

    def _login(self):
        try:
            data = self.read_json()
            usuario = str(data.get("usuario") or "").strip()
            password = str(data.get("password") or "")
            if not usuario or not password:
                return self.send_json(
                    {"ok": False, "error": "Debe ingresar usuario y contraseña."},
                    400,
                )

            with base.get_conn() as conn:
                row = conn.execute(
                    """
                    SELECT id, usuario, nombre, rol
                    FROM usuarios
                    WHERE usuario = ? AND password = ? AND activo = 1
                    """,
                    (usuario, password),
                ).fetchone()

            if not row:
                return self.send_json(
                    {"ok": False, "error": "Usuario o contraseña incorrectos."},
                    401,
                )

            user = dict(row)
            token = _new_session(user)
            return self.send_json(
                {
                    "ok": True,
                    "user": user,
                    "token": token,
                    "expires_in": SESSION_TTL_SECONDS,
                }
            )
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)

    def read_json(self):
        data = super().read_json()
        path = urlparse(self.path).path

        # El nombre del operador se toma de la sesión y no de un valor modificable
        # enviado desde el navegador.
        if self.auth_user and path in {
            "/api/alertas/manuales",
            "/api/alertas/accion",
            "/api/umbrales",
        }:
            data["operador"] = self.auth_user.get("nombre") or self.auth_user.get("usuario") or "Operador"
        return data

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/health":
            return super().do_GET()

        if path.startswith("/api/"):
            admin_required = path in {"/api/usuarios", "/api/umbrales"}
            if not self._require_session(admin=admin_required):
                return

        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/auth/login":
            return self._login()

        # RF13: el vecino puede reportar una incidencia sin ser operador del sistema.
        if path == "/api/incidencias":
            return super().do_POST()

        if path.startswith("/api/"):
            admin_required = path == "/api/usuarios"
            if not self._require_session(admin=admin_required):
                return

        return super().do_POST()

    def do_PUT(self):
        path = urlparse(self.path).path

        if path.startswith("/api/"):
            admin_required = path == "/api/umbrales"
            if not self._require_session(admin=admin_required):
                return

        return super().do_PUT()

    def do_DELETE(self):
        path = urlparse(self.path).path

        if path.startswith("/api/"):
            admin_required = path.startswith("/api/usuarios/")
            if not self._require_session(admin=admin_required):
                return

        return super().do_DELETE()


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("RF11: autenticación con sesión y control de roles en backend habilitados")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
