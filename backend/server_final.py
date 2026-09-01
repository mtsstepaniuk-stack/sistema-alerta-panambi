"""Backend final de requerimientos funcionales del SAT Panambí.

Extiende RF11 sin reemplazar lo que ya funciona y completa:
- RF12: auditoría detallada de acciones sobre alertas.
- RF13: reporte vecinal (ya existente, se conserva público).
- RF14: validar, rechazar o mantener pendiente; rechazo exige motivo.
- RF15: imagen opcional en reporte vecinal (ya existente).
- RF16: reporte vecinal asociado a alerta pendiente (ya existente).
- RF17: administración de usuarios y roles, incluido Personal Técnico.
- RF19: administración de sensores/puntos de monitoreo.
- RF20: consulta y prueba de funcionamiento/conectividad de sensores.
"""

import re
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_rf11 as previous
import server_thresholds as thresholds_backend

base = previous.base

ALLOWED_ROLES = {
    "Operador Defensa Civil",
    "Operador Municipalidad",
    "Administrador",
    "Personal Técnico",
}

DEFAULT_SENSOR_ROWS = [dict(item) for item in base.SENSORES]


def init_db():
    previous.init_db()
    with base.get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS auditoria_alertas (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              alerta_id INTEGER NOT NULL,
              accion TEXT NOT NULL,
              usuario_id INTEGER,
              usuario TEXT NOT NULL,
              rol TEXT NOT NULL,
              estado_anterior TEXT NOT NULL,
              estado_nuevo TEXT NOT NULL,
              observacion TEXT DEFAULT '',
              creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sensores_config (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              codigo TEXT NOT NULL UNIQUE,
              zona TEXT NOT NULL,
              lat REAL NOT NULL,
              lng REAL NOT NULL,
              nivel_base REAL NOT NULL DEFAULT 3.0,
              descripcion TEXT DEFAULT '',
              activo INTEGER NOT NULL DEFAULT 1,
              ultimo_test_en TEXT,
              ultimo_test_resultado TEXT DEFAULT '',
              creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        for item in DEFAULT_SENSOR_ROWS:
            conn.execute(
                """
                INSERT OR IGNORE INTO sensores_config
                  (codigo, zona, lat, lng, nivel_base, descripcion, activo)
                VALUES (?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    item["sensor"],
                    item["zona"],
                    float(item["lat"]),
                    float(item["lng"]),
                    float(item["base"]),
                    f"Punto de monitoreo {item['zona']}",
                ),
            )

    _sync_active_sensors()


def _sync_active_sensors():
    """Hace que el resto del sistema use la configuración administrable."""
    with base.get_conn() as conn:
        rows = conn.execute(
            """
            SELECT codigo, zona, lat, lng, nivel_base
            FROM sensores_config
            WHERE activo = 1
            ORDER BY codigo
            """
        ).fetchall()

    base.SENSORES[:] = [
        {
            "sensor": row["codigo"],
            "zona": row["zona"],
            "base": float(row["nivel_base"]),
            "lat": float(row["lat"]),
            "lng": float(row["lng"]),
        }
        for row in rows
    ]


def _role_can_manage_sensors(user):
    return bool(user) and user.get("rol") == "Administrador"


def _role_can_view_sensors(user):
    return bool(user) and user.get("rol") in {"Administrador", "Personal Técnico"}


def _sensor_runtime_status(row):
    data = dict(row)
    active = bool(data.get("activo"))
    last_reading = data.get("ultima_lectura")

    age_minutes = None
    if last_reading:
        try:
            dt = base.datetime.fromisoformat(str(last_reading).replace(" ", "T"))
            age_minutes = max(0, (base.datetime.utcnow() - dt).total_seconds() / 60.0)
        except ValueError:
            age_minutes = None

    if not active:
        conectividad = "Desactivado"
        funcionamiento = "Fuera de servicio"
    elif age_minutes is None:
        conectividad = "Sin datos"
        funcionamiento = "Atención"
    elif age_minutes <= 30:
        conectividad = "Conectado"
        funcionamiento = "Operativo"
    elif age_minutes <= 60:
        conectividad = "Intermitente"
        funcionamiento = "Atención"
    else:
        conectividad = "Sin conexión"
        funcionamiento = "Atención"

    data.update(
        {
            "activo": active,
            "edad_lectura_min": round(age_minutes, 1) if age_minutes is not None else None,
            "conectividad": conectividad,
            "funcionamiento": funcionamiento,
        }
    )
    return data


def _sensor_rows(conn):
    rows = conn.execute(
        """
        SELECT s.id, s.codigo, s.zona, s.lat, s.lng, s.nivel_base,
               s.descripcion, s.activo, s.ultimo_test_en, s.ultimo_test_resultado,
               m.nivel_m AS nivel_actual, m.tendencia_m AS tendencia,
               m.registrado_en AS ultima_lectura
        FROM sensores_config s
        LEFT JOIN mediciones m ON m.id = (
            SELECT m2.id
            FROM mediciones m2
            WHERE m2.sensor = s.codigo
            ORDER BY m2.registrado_en DESC, m2.id DESC
            LIMIT 1
        )
        ORDER BY s.codigo
        """
    ).fetchall()
    return [_sensor_runtime_status(row) for row in rows]


def _record_alert_audit(conn, alert_id, action, user, previous_state, new_state, observation=""):
    user = user or {}
    conn.execute(
        """
        INSERT INTO auditoria_alertas
          (alerta_id, accion, usuario_id, usuario, rol,
           estado_anterior, estado_nuevo, observacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            int(alert_id),
            str(action),
            user.get("id"),
            user.get("nombre") or user.get("usuario") or "Sistema",
            user.get("rol") or "Sistema",
            str(previous_state or "—"),
            str(new_state or "—"),
            str(observation or ""),
        ),
    )


def _pending_alert_query():
    return """
        SELECT a.*,
               i.codigo AS inc_codigo, i.tipo AS inc_tipo, i.descripcion AS inc_descripcion,
               i.ubicacion AS inc_ubicacion, i.zona AS inc_zona,
               i.vecino_nombre AS inc_vecino_nombre, i.dni AS inc_dni,
               i.imagen_nombre AS inc_imagen_nombre, i.imagen_path AS inc_imagen_path,
               i.estado AS inc_estado, i.creada_en AS inc_creada_en
        FROM alertas a
        LEFT JOIN incidencias i ON i.id = a.incidencia_id
    """


class AppHandler(previous.AppHandler):
    def _require_sensor_access(self, admin=False):
        if not self._require_session(admin=False):
            return False
        allowed = _role_can_manage_sensors(self.auth_user) if admin else _role_can_view_sensors(self.auth_user)
        if not allowed:
            self.send_json(
                {"ok": False, "error": "Esta sección requiere rol Administrador o Personal Técnico."},
                403,
            )
            return False
        return True

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/auditoria-alertas":
            if not self._require_session(admin=False):
                return
            try:
                query = self.parse_query()
                alert_id = query.get("alerta_id")
                clauses = []
                params = []
                if alert_id:
                    clauses.append("alerta_id = ?")
                    params.append(int(alert_id))
                where = "WHERE " + " AND ".join(clauses) if clauses else ""
                with base.get_conn() as conn:
                    rows = base.rows_to_dicts(
                        conn.execute(
                            f"""
                            SELECT id, alerta_id, accion, usuario_id, usuario, rol,
                                   estado_anterior, estado_nuevo, observacion, creada_en
                            FROM auditoria_alertas
                            {where}
                            ORDER BY creada_en DESC, id DESC
                            LIMIT 100
                            """,
                            params,
                        ).fetchall()
                    )
                return self.send_json({"ok": True, "auditoria": rows})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        if path in {"/api/sensores", "/api/sensores/estado"}:
            if not self._require_sensor_access(admin=False):
                return
            try:
                with base.get_conn() as conn:
                    sensores = _sensor_rows(conn)
                stats = {
                    "total": len(sensores),
                    "activos": sum(1 for s in sensores if s["activo"]),
                    "conectados": sum(1 for s in sensores if s["conectividad"] == "Conectado"),
                    "atencion": sum(1 for s in sensores if s["funcionamiento"] == "Atención"),
                }
                return self.send_json({"ok": True, "sensores": sensores, "stats": stats})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/alertas/accion":
            if not self._require_session(admin=False):
                return
            try:
                data = self.read_json()
                action = str(data.get("accion") or "").strip()
                observation = str(data.get("observacion") or "").strip()
                alert_id = data.get("alertaId")

                if action not in {"Validada", "Rechazada", "Pendiente"}:
                    return self.send_json({"ok": False, "error": "Acción inválida."}, 400)
                if action == "Rechazada" and not observation:
                    return self.send_json(
                        {"ok": False, "error": "Debe indicar el motivo del rechazo."},
                        400,
                    )
                if action == "Pendiente" and not observation:
                    return self.send_json(
                        {"ok": False, "error": "Indique una observación para mantener la alerta pendiente."},
                        400,
                    )

                with base.get_conn() as conn:
                    if alert_id:
                        row = conn.execute(
                            _pending_alert_query() + " WHERE a.id = ? AND a.estado = 'Pendiente'",
                            (int(alert_id),),
                        ).fetchone()
                    else:
                        row = conn.execute(
                            _pending_alert_query()
                            + " WHERE a.estado = 'Pendiente' ORDER BY a.creada_en ASC, a.id ASC LIMIT 1"
                        ).fetchone()

                    if not row:
                        pending_count = conn.execute(
                            "SELECT COUNT(*) FROM alertas WHERE estado = 'Pendiente'"
                        ).fetchone()[0]
                        return self.send_json(
                            {
                                "ok": True,
                                "pendingAlerts": pending_count,
                                "message": "La alerta ya no está pendiente.",
                            }
                        )

                    pending = dict(row)
                    previous_state = pending.get("estado") or "Pendiente"
                    operator = self.auth_user.get("nombre") or self.auth_user.get("usuario") or "Operador"

                    if action == "Pendiente":
                        new_state = "Pendiente"
                        notified = 0
                        conn.execute(
                            """
                            UPDATE alertas
                            SET operador = ?, observacion = ?, actualizada_en = CURRENT_TIMESTAMP
                            WHERE id = ?
                            """,
                            (operator, observation, pending["id"]),
                        )
                        if pending.get("incidencia_id"):
                            conn.execute(
                                "UPDATE incidencias SET estado = 'En revisión' WHERE id = ?",
                                (pending["incidencia_id"],),
                            )
                        badge = "PENDIENTE"
                        history_desc = f"Alerta mantenida pendiente — {pending['zona']}"
                    else:
                        new_state = action
                        notified = 0
                        if action == "Validada":
                            notified = len(
                                thresholds_backend.destinatarios_por_riesgo(
                                    conn,
                                    pending["zona"],
                                    pending["riesgo"],
                                )
                            )
                        conn.execute(
                            """
                            UPDATE alertas
                            SET estado = ?, operador = ?, notificados = ?, observacion = ?,
                                actualizada_en = CURRENT_TIMESTAMP
                            WHERE id = ?
                            """,
                            (new_state, operator, notified, observation, pending["id"]),
                        )
                        if pending.get("incidencia_id"):
                            conn.execute(
                                "UPDATE incidencias SET estado = ? WHERE id = ?",
                                ("Validada" if action == "Validada" else "Rechazada", pending["incidencia_id"]),
                            )
                        badge = "VALIDADA" if action == "Validada" else "RECHAZADA"
                        history_desc = f"{action}: {pending['mensaje']} — {pending['zona']}"

                    detail = f"{action} por {operator}"
                    if notified:
                        detail += f" · {notified} contactos notificados"
                    if observation:
                        detail += f" · Obs.: {observation}"

                    view = base.alert_view(pending)
                    base.insert_history(
                        conn,
                        "Acción",
                        history_desc,
                        detail,
                        nivel=view["nivelDisplay"],
                        badge=badge,
                        zona=pending["zona"],
                        riesgo=pending["riesgo"],
                    )
                    _record_alert_audit(
                        conn,
                        pending["id"],
                        action,
                        self.auth_user,
                        previous_state,
                        new_state,
                        observation,
                    )

                    pending_count = conn.execute(
                        "SELECT COUNT(*) FROM alertas WHERE estado = 'Pendiente'"
                    ).fetchone()[0]
                    next_row = conn.execute(
                        _pending_alert_query()
                        + " WHERE a.estado = 'Pendiente' ORDER BY a.creada_en ASC, a.id ASC LIMIT 1"
                    ).fetchone()

                return self.send_json(
                    {
                        "ok": True,
                        "pendingAlerts": pending_count,
                        "nextAlert": base.alert_view(next_row) if next_row else None,
                        "estado": new_state,
                    }
                )
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)
            finally:
                thresholds_backend._notification_context.risk = None

        if path == "/api/usuarios":
            if not self._require_session(admin=True):
                return
            try:
                data = self.read_json()
                nombre = str(data.get("nombre") or "").strip()
                usuario = str(data.get("usuario") or "").strip().lower()
                password = str(data.get("password") or "")
                role = str(data.get("rol") or "").strip()
                if not nombre or not usuario or not password or not role:
                    return self.send_json(
                        {"ok": False, "error": "Nombre, usuario, contraseña y rol son obligatorios."},
                        400,
                    )
                if role not in ALLOWED_ROLES:
                    return self.send_json({"ok": False, "error": "Rol inválido."}, 400)
                if len(password) < 4:
                    return self.send_json(
                        {"ok": False, "error": "La contraseña debe tener al menos 4 caracteres."},
                        400,
                    )
                with base.get_conn() as conn:
                    try:
                        cur = conn.execute(
                            "INSERT INTO usuarios (usuario, password, nombre, rol) VALUES (?, ?, ?, ?)",
                            (usuario, password, nombre, role),
                        )
                    except base.sqlite3.IntegrityError:
                        return self.send_json(
                            {"ok": False, "error": "Ya existe un usuario con ese nombre de usuario."},
                            409,
                        )
                    user = dict(
                        conn.execute(
                            "SELECT id, usuario, nombre, rol, activo, creado_en FROM usuarios WHERE id = ?",
                            (cur.lastrowid,),
                        ).fetchone()
                    )
                    base.insert_history(
                        conn,
                        "Usuario",
                        f"Usuario agregado — {nombre}",
                        f"{usuario} · {role}",
                        badge="ALTA",
                        zona="Sistema",
                        riesgo="Verde",
                    )
                return self.send_json({"ok": True, "usuario": user}, 201)
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        if path == "/api/sensores":
            if not self._require_sensor_access(admin=True):
                return
            try:
                data = self.read_json()
                code = str(data.get("codigo") or "").strip().upper()
                zone = str(data.get("zona") or "").strip()
                description = str(data.get("descripcion") or "").strip()
                lat = float(data.get("lat"))
                lng = float(data.get("lng"))
                base_level = float(data.get("nivel_base", 3.0))

                if not code or not zone:
                    return self.send_json({"ok": False, "error": "Código y zona son obligatorios."}, 400)
                if not re.fullmatch(r"[A-Z0-9_-]{2,20}", code):
                    return self.send_json(
                        {"ok": False, "error": "El código del sensor debe tener entre 2 y 20 caracteres alfanuméricos."},
                        400,
                    )
                if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                    return self.send_json({"ok": False, "error": "Coordenadas inválidas."}, 400)
                if not (0.1 <= base_level <= 20):
                    return self.send_json({"ok": False, "error": "Nivel base inválido."}, 400)

                with base.get_conn() as conn:
                    try:
                        cur = conn.execute(
                            """
                            INSERT INTO sensores_config
                              (codigo, zona, lat, lng, nivel_base, descripcion, activo)
                            VALUES (?, ?, ?, ?, ?, ?, 1)
                            """,
                            (code, zone, lat, lng, base_level, description),
                        )
                    except base.sqlite3.IntegrityError:
                        return self.send_json({"ok": False, "error": "Ya existe un sensor con ese código."}, 409)

                    conn.execute(
                        """
                        INSERT INTO mediciones
                          (sensor, zona, nivel_m, tendencia_m, temperatura_c, humedad_pct)
                        VALUES (?, ?, ?, 0, 24.0, 85)
                        """,
                        (code, zone, round(base_level, 2)),
                    )
                    base.insert_history(
                        conn,
                        "Configuración",
                        f"Sensor agregado — {code}",
                        f"Zona: {zone} · {lat:.5f}, {lng:.5f}",
                        badge="ALTA",
                        zona=zone,
                        riesgo="Verde",
                    )
                    sensor_id = cur.lastrowid

                _sync_active_sensors()
                return self.send_json({"ok": True, "id": sensor_id}, 201)
            except (TypeError, ValueError):
                return self.send_json({"ok": False, "error": "Complete coordenadas y nivel base con valores válidos."}, 400)
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        match_test = re.fullmatch(r"/api/sensores/(\d+)/test", path)
        if match_test:
            if not self._require_sensor_access(admin=False):
                return
            try:
                sensor_id = int(match_test.group(1))
                with base.get_conn() as conn:
                    row = conn.execute(
                        """
                        SELECT s.id, s.codigo, s.zona, s.lat, s.lng, s.nivel_base,
                               s.descripcion, s.activo, s.ultimo_test_en, s.ultimo_test_resultado,
                               m.nivel_m AS nivel_actual, m.tendencia_m AS tendencia,
                               m.registrado_en AS ultima_lectura
                        FROM sensores_config s
                        LEFT JOIN mediciones m ON m.id = (
                            SELECT m2.id FROM mediciones m2
                            WHERE m2.sensor = s.codigo
                            ORDER BY m2.registrado_en DESC, m2.id DESC LIMIT 1
                        )
                        WHERE s.id = ?
                        """,
                        (sensor_id,),
                    ).fetchone()
                    if not row:
                        return self.send_json({"ok": False, "error": "Sensor no encontrado."}, 404)
                    status = _sensor_runtime_status(row)
                    result = (
                        "OK - comunicación confirmada"
                        if status["activo"] and status["conectividad"] in {"Conectado", "Intermitente"}
                        else "SIN RESPUESTA - revisar conectividad"
                    )
                    conn.execute(
                        """
                        UPDATE sensores_config
                        SET ultimo_test_en = CURRENT_TIMESTAMP,
                            ultimo_test_resultado = ?, actualizado_en = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (result, sensor_id),
                    )
                    base.insert_history(
                        conn,
                        "Acción",
                        f"Prueba técnica de sensor — {status['codigo']}",
                        f"{result} · Técnico: {self.auth_user.get('nombre') or self.auth_user.get('usuario')}",
                        badge="PRUEBA",
                        zona=status["zona"],
                        riesgo="Verde",
                    )
                return self.send_json({"ok": True, "resultado": result})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        # Para la emisión manual se conserva la implementación RF8 y se agrega
        # luego una entrada de auditoría sobre la alerta creada.
        if path == "/api/alertas/manuales":
            with base.get_conn() as conn:
                before_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM alertas").fetchone()[0]
            result = super().do_POST()
            if self.auth_user:
                try:
                    with base.get_conn() as conn:
                        row = conn.execute(
                            "SELECT id, estado FROM alertas WHERE id > ? AND origen = 'Manual' ORDER BY id DESC LIMIT 1",
                            (before_id,),
                        ).fetchone()
                        if row:
                            _record_alert_audit(
                                conn,
                                row["id"],
                                "Emitida manualmente",
                                self.auth_user,
                                "Nueva",
                                row["estado"],
                                "Emisión manual desde el sistema",
                            )
                except Exception:
                    pass
            return result

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
                    current_row = conn.execute(
                        "SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = ? AND activo = 1",
                        (user_id,),
                    ).fetchone()
                    if not current_row:
                        return self.send_json({"ok": False, "error": "Usuario no encontrado."}, 404)
                    current = dict(current_row)
                    role = str(data.get("rol", current["rol"])).strip()
                    name = str(data.get("nombre", current["nombre"])).strip()
                    if role not in ALLOWED_ROLES:
                        return self.send_json({"ok": False, "error": "Rol inválido."}, 400)
                    if not name:
                        return self.send_json({"ok": False, "error": "El nombre no puede quedar vacío."}, 400)
                    if current["usuario"] == "admin" and role != "Administrador":
                        return self.send_json({"ok": False, "error": "El usuario admin debe conservar el rol Administrador."}, 400)
                    if current["rol"] == "Administrador" and role != "Administrador":
                        admins = conn.execute(
                            "SELECT COUNT(*) FROM usuarios WHERE rol = 'Administrador' AND activo = 1"
                        ).fetchone()[0]
                        if admins <= 1:
                            return self.send_json({"ok": False, "error": "Debe quedar al menos un administrador activo."}, 400)

                    conn.execute(
                        "UPDATE usuarios SET nombre = ?, rol = ? WHERE id = ?",
                        (name, role, user_id),
                    )
                    base.insert_history(
                        conn,
                        "Usuario",
                        f"Rol de usuario actualizado — {name}",
                        f"{current['rol']} → {role}",
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

        match_sensor = re.fullmatch(r"/api/sensores/(\d+)", path)
        if match_sensor:
            if not self._require_sensor_access(admin=True):
                return
            try:
                sensor_id = int(match_sensor.group(1))
                data = self.read_json()
                with base.get_conn() as conn:
                    current_row = conn.execute(
                        "SELECT * FROM sensores_config WHERE id = ?",
                        (sensor_id,),
                    ).fetchone()
                    if not current_row:
                        return self.send_json({"ok": False, "error": "Sensor no encontrado."}, 404)
                    current = dict(current_row)
                    zone = str(data.get("zona", current["zona"])).strip()
                    description = str(data.get("descripcion", current["descripcion"] or "")).strip()
                    lat = float(data.get("lat", current["lat"]))
                    lng = float(data.get("lng", current["lng"]))
                    base_level = float(data.get("nivel_base", current["nivel_base"]))
                    active = 1 if bool(data.get("activo", current["activo"])) else 0
                    if not zone:
                        return self.send_json({"ok": False, "error": "La zona es obligatoria."}, 400)
                    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                        return self.send_json({"ok": False, "error": "Coordenadas inválidas."}, 400)
                    if not (0.1 <= base_level <= 20):
                        return self.send_json({"ok": False, "error": "Nivel base inválido."}, 400)

                    conn.execute(
                        """
                        UPDATE sensores_config
                        SET zona = ?, lat = ?, lng = ?, nivel_base = ?, descripcion = ?,
                            activo = ?, actualizado_en = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (zone, lat, lng, base_level, description, active, sensor_id),
                    )
                    base.insert_history(
                        conn,
                        "Configuración",
                        f"Sensor actualizado — {current['codigo']}",
                        f"Zona: {zone} · Estado: {'Activo' if active else 'Inactivo'}",
                        badge="EDICIÓN",
                        zona=zone,
                        riesgo="Verde",
                    )
                _sync_active_sensors()
                return self.send_json({"ok": True})
            except (TypeError, ValueError):
                return self.send_json({"ok": False, "error": "Datos numéricos inválidos."}, 400)
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        return super().do_PUT()

    def do_DELETE(self):
        path = urlparse(self.path).path
        match_sensor = re.fullmatch(r"/api/sensores/(\d+)", path)
        if match_sensor:
            if not self._require_sensor_access(admin=True):
                return
            try:
                sensor_id = int(match_sensor.group(1))
                with base.get_conn() as conn:
                    row = conn.execute(
                        "SELECT * FROM sensores_config WHERE id = ?",
                        (sensor_id,),
                    ).fetchone()
                    if not row:
                        return self.send_json({"ok": False, "error": "Sensor no encontrado."}, 404)
                    sensor = dict(row)
                    conn.execute(
                        "UPDATE sensores_config SET activo = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?",
                        (sensor_id,),
                    )
                    base.insert_history(
                        conn,
                        "Configuración",
                        f"Sensor dado de baja — {sensor['codigo']}",
                        f"Punto de monitoreo {sensor['zona']} desactivado",
                        badge="BAJA",
                        zona=sensor["zona"],
                        riesgo="Verde",
                    )
                _sync_active_sensors()
                return self.send_json({"ok": True})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        return super().do_DELETE()


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("RF12-RF20 restantes: funcionalidades finales habilitadas")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
