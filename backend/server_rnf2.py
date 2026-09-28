"""Capa de compatibilidad posterior a RNF1.

La precisión física y la calibración pertenecen al subsistema externo de sensores.
El SAT sólo consume mediciones ya procesadas y conserva aquí las protecciones de
cuentas administrativas incorporadas en esta etapa del proyecto.
"""

import re
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_rnf1 as previous

base = previous.base
ALLOWED_ROLES = {
    "Operador Defensa Civil",
    "Operador Municipalidad",
    "Administrador",
    "Personal Técnico",
}


def init_db():
    previous.init_db()
    with base.get_conn() as conn:
        # La cuenta principal de demostración conserva su credencial académica.
        conn.execute(
            "UPDATE usuarios SET password = usuario WHERE usuario = ?",
            ("admin",),
        )


class AppHandler(previous.AppHandler):
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
    print("Sensores externos: precisión física fuera del alcance del SAT")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
