"""RNF2: error máximo permitido de 5 cm en la medición del nivel.

Extiende RNF1 sin modificar los flujos funcionales existentes.
La precisión se verifica mediante calibración: se compara la última lectura del
sensor con un valor de referencia y se registra el error absoluto.
"""

import re
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_rnf1 as previous

base = previous.base
RNF2_MAX_ERROR_M = 0.05
ALLOWED_ROLES = {
    "Operador Defensa Civil",
    "Operador Municipalidad",
    "Administrador",
    "Personal Técnico",
}


def init_db():
    previous.init_db()
    with base.get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS calibraciones_sensores (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sensor_id INTEGER NOT NULL,
              sensor_codigo TEXT NOT NULL,
              valor_referencia_m REAL NOT NULL,
              valor_medido_m REAL NOT NULL,
              error_m REAL NOT NULL,
              cumple INTEGER NOT NULL,
              usuario TEXT NOT NULL,
              creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(sensor_id) REFERENCES sensores_config(id)
            )
            """
        )

        # Para la demostración académica, la cuenta principal conserva una
        # credencial predecible: su clave se mantiene igual a su usuario.
        conn.execute(
            "UPDATE usuarios SET password = usuario WHERE usuario = ?",
            ("admin",),
        )


def _precision_status():
    with base.get_conn() as conn:
        rows = base.rows_to_dicts(
            conn.execute(
                """
                SELECT s.id, s.codigo, s.zona, s.activo,
                       m.nivel_m AS nivel_actual,
                       c.valor_referencia_m, c.valor_medido_m,
                       c.error_m, c.cumple, c.usuario,
                       c.creada_en AS calibrada_en
                FROM sensores_config s
                LEFT JOIN mediciones m ON m.id = (
                    SELECT m2.id
                    FROM mediciones m2
                    WHERE m2.sensor = s.codigo
                    ORDER BY m2.registrado_en DESC, m2.id DESC
                    LIMIT 1
                )
                LEFT JOIN calibraciones_sensores c ON c.id = (
                    SELECT c2.id
                    FROM calibraciones_sensores c2
                    WHERE c2.sensor_id = s.id
                    ORDER BY c2.id DESC
                    LIMIT 1
                )
                ORDER BY s.codigo
                """
            ).fetchall()
        )

        latest = conn.execute(
            """
            SELECT sensor_codigo, valor_referencia_m, valor_medido_m,
                   error_m, cumple, usuario, creada_en
            FROM calibraciones_sensores
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()

    active = [row for row in rows if bool(row.get("activo"))]
    calibrated = [row for row in active if row.get("calibrada_en")]
    compliant = [row for row in calibrated if bool(row.get("cumple"))]
    failed = [row for row in calibrated if not bool(row.get("cumple"))]

    return {
        "limite_error_m": RNF2_MAX_ERROR_M,
        "limite_error_cm": int(RNF2_MAX_ERROR_M * 100),
        "sensores_activos": len(active),
        "sensores_calibrados": len(calibrated),
        "sensores_cumplen": len(compliant),
        "sensores_requieren_calibracion": len(failed),
        "ultima_calibracion": dict(latest) if latest else None,
        "sensores": rows,
    }


class AppHandler(previous.AppHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/rnf2-status":
            if not self._require_sensor_access(admin=False):
                return
            try:
                return self.send_json({"ok": True, "rnf2": _precision_status()})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path

        # La cuenta principal de demostración no permite modificar su clave.
        if path == "/api/auth/password":
            if not self._require_session(admin=False):
                return
            if str(self.auth_user.get("usuario") or "").lower() == "admin":
                return self.send_json(
                    {"ok": False, "error": "El cambio de contraseña está restringido para la cuenta admin."},
                    403,
                )
            return super().do_POST()

        match = re.fullmatch(r"/api/sensores/(\d+)/calibrar", path)
        if match:
            if not self._require_sensor_access(admin=False):
                return
            try:
                sensor_id = int(match.group(1))
                data = self.read_json()
                reference = float(data.get("valor_referencia_m"))
                if not (0 <= reference <= 30):
                    return self.send_json({"ok": False, "error": "El nivel de referencia es inválido."}, 400)

                with base.get_conn() as conn:
                    sensor = conn.execute(
                        "SELECT id, codigo, zona, activo FROM sensores_config WHERE id = ?",
                        (sensor_id,),
                    ).fetchone()
                    if not sensor:
                        return self.send_json({"ok": False, "error": "Sensor no encontrado."}, 404)
                    if not bool(sensor["activo"]):
                        return self.send_json({"ok": False, "error": "El sensor está desactivado."}, 400)

                    measurement = conn.execute(
                        """
                        SELECT nivel_m, registrado_en
                        FROM mediciones
                        WHERE sensor = ?
                        ORDER BY registrado_en DESC, id DESC
                        LIMIT 1
                        """,
                        (sensor["codigo"],),
                    ).fetchone()
                    if not measurement:
                        return self.send_json({"ok": False, "error": "El sensor todavía no tiene mediciones."}, 400)

                    measured = float(measurement["nivel_m"])
                    error_m = abs(measured - reference)
                    complies = error_m <= RNF2_MAX_ERROR_M + 1e-9
                    operator = self.auth_user.get("nombre") or self.auth_user.get("usuario") or "Operador"

                    conn.execute(
                        """
                        INSERT INTO calibraciones_sensores
                          (sensor_id, sensor_codigo, valor_referencia_m,
                           valor_medido_m, error_m, cumple, usuario)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            sensor_id,
                            sensor["codigo"],
                            round(reference, 3),
                            round(measured, 3),
                            round(error_m, 4),
                            1 if complies else 0,
                            operator,
                        ),
                    )

                    error_cm = error_m * 100
                    result = "Cumple" if complies else "Requiere calibración"
                    base.insert_history(
                        conn,
                        "Acción",
                        f"Verificación de precisión — {sensor['codigo']}",
                        f"Referencia: {reference:.2f} m · Medido: {measured:.2f} m · Error: {error_cm:.1f} cm · {result}",
                        badge="PRUEBA",
                        zona=sensor["zona"],
                        riesgo="Verde" if complies else "Naranja",
                    )

                return self.send_json(
                    {
                        "ok": True,
                        "sensor": sensor["codigo"],
                        "valor_referencia_m": round(reference, 3),
                        "valor_medido_m": round(measured, 3),
                        "error_m": round(error_m, 4),
                        "error_cm": round(error_m * 100, 1),
                        "limite_cm": 5,
                        "cumple": complies,
                        "resultado": result,
                    }
                )
            except (TypeError, ValueError):
                return self.send_json({"ok": False, "error": "Ingrese un nivel de referencia válido."}, 400)
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        return super().do_POST()

    def do_PUT(self):
        path = urlparse(self.path).path
        match_user = re.fullmatch(r"/api/usuarios/(\d+)", path)

        if match_user:
            if not self._require_session(admin=True):
                return

            try:
                user_id = int(match_user.group(1))
                data = self.read_json()

                with base.get_conn() as conn:
                    row = conn.execute(
                        "SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = ? AND activo = 1",
                        (user_id,),
                    ).fetchone()
                    if not row:
                        return self.send_json({"ok": False, "error": "Usuario no encontrado."}, 404)

                    current = dict(row)
                    name = str(data.get("nombre", current["nombre"]) or "").strip()
                    username = str(data.get("usuario", current["usuario"]) or "").strip().lower()
                    role = str(data.get("rol", current["rol"]) or "").strip()
                    password = str(data.get("password") or "")
                    main_admin = str(current["usuario"]).lower() == "admin"

                    if not name or not username:
                        return self.send_json(
                            {"ok": False, "error": "Nombre y usuario son obligatorios."},
                            400,
                        )
                    if role not in ALLOWED_ROLES:
                        return self.send_json({"ok": False, "error": "Rol inválido."}, 400)
                    if password and len(password) < 4:
                        return self.send_json(
                            {"ok": False, "error": "La nueva contraseña debe tener al menos 4 caracteres."},
                            400,
                        )

                    # La cuenta principal se mantiene siempre como admin/admin.
                    if main_admin:
                        if username != "admin" or role != "Administrador" or password:
                            return self.send_json(
                                {"ok": False, "error": "La cuenta admin mantiene usuario, contraseña y rol protegidos."},
                                403,
                            )
                        username = "admin"
                        role = "Administrador"

                    duplicate = conn.execute(
                        "SELECT 1 FROM usuarios WHERE LOWER(usuario) = LOWER(?) AND id <> ? AND activo = 1 LIMIT 1",
                        (username, user_id),
                    ).fetchone()
                    if duplicate:
                        return self.send_json(
                            {"ok": False, "error": "Ya existe un usuario con ese nombre de usuario."},
                            409,
                        )

                    if current["rol"] == "Administrador" and role != "Administrador":
                        admins = conn.execute(
                            "SELECT COUNT(*) FROM usuarios WHERE rol = 'Administrador' AND activo = 1"
                        ).fetchone()[0]
                        if admins <= 1:
                            return self.send_json(
                                {"ok": False, "error": "Debe quedar al menos un administrador activo."},
                                400,
                            )

                    changes = []
                    if current["nombre"] != name:
                        changes.append(f"nombre: {current['nombre']} → {name}")
                    if current["usuario"] != username:
                        changes.append(f"usuario: {current['usuario']} → {username}")
                    if current["rol"] != role:
                        changes.append(f"rol: {current['rol']} → {role}")
                    if password:
                        changes.append("contraseña restablecida por Administrador")

                    if password:
                        conn.execute(
                            "UPDATE usuarios SET nombre = ?, usuario = ?, rol = ?, password = ? WHERE id = ?",
                            (name, username, role, password, user_id),
                        )
                    else:
                        conn.execute(
                            "UPDATE usuarios SET nombre = ?, usuario = ?, rol = ? WHERE id = ?",
                            (name, username, role, user_id),
                        )

                    base.insert_history(
                        conn,
                        "Usuario",
                        f"Usuario actualizado — {name}",
                        " · ".join(changes) if changes else "Sin cambios en los datos de la cuenta",
                        badge="EDICIÓN",
                        zona="Sistema",
                        riesgo="Verde",
                    )

                    updated = dict(
                        conn.execute(
                            "SELECT id, usuario, nombre, rol, activo, creado_en FROM usuarios WHERE id = ?",
                            (user_id,),
                        ).fetchone()
                    )

                return self.send_json({"ok": True, "usuario": updated})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        return super().do_PUT()


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("RNF1: control de generación de alertas <= 5 minutos habilitado")
    print("RNF2: control de precisión <= 5 cm habilitado")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
