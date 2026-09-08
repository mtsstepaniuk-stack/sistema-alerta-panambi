"""Capa de consistencia para la entrega de testing funcional del SAT Panambí.

Mantiene server_release.py como base y corrige comportamientos visibles desde la web:
- mediciones simuladas cada 5 minutos, aunque el mapa refresque con mayor frecuencia;
- historial paginado con estadísticas que respetan los filtros;
- historial con alerta_id para finalizar exactamente la alerta seleccionada;
- búsqueda de contactos por teléfono con o sin formato;
- prevención de contactos duplicados al crear o editar.
"""

import re
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_release as previous

base = previous.base

HISTORY_PAGE_SIZE = 30
HISTORY_MAX_PAGE_SIZE = 100
SENSOR_READING_INTERVAL_SECONDS = 5 * 60

ACTION_SQL = """(
    tipo IN ('Contacto', 'Usuario', 'Configuración', 'Acción')
    OR badge IN ('VALIDADA', 'RECHAZADA', 'ALTA', 'BAJA', 'AJUSTE', 'EDICIÓN')
)"""


# ---------------------------------------------------------------------------
# Frecuencia de mediciones
# ---------------------------------------------------------------------------
_original_simulate_sensor_readings = base.simulate_sensor_readings


def simulate_sensor_readings_every_five_minutes(conn):
    """Sólo genera una nueva tanda de mediciones cuando pasaron 5 minutos.

    El mapa puede refrescar cada pocos segundos para mostrar alertas y cambios de
    interfaz, pero ese refresco ya no fabrica una medición nueva en cada consulta.
    """
    last = conn.execute(
        "SELECT MAX(registrado_en) FROM mediciones"
    ).fetchone()[0]

    if last:
        elapsed = conn.execute(
            """
            SELECT CAST((julianday('now') - julianday(?)) * 86400 AS INTEGER)
            """,
            (last,),
        ).fetchone()[0]
        if elapsed is not None and int(elapsed) < SENSOR_READING_INTERVAL_SECONDS:
            return

    return _original_simulate_sensor_readings(conn)


# Los handlers heredados de server.py resuelven esta función desde el módulo
# base en tiempo de ejecución, por lo que el reemplazo aplica a Dashboard,
# Alertas y cualquier otra consulta que invoque la simulación.
base.simulate_sensor_readings = simulate_sensor_readings_every_five_minutes


# ---------------------------------------------------------------------------
# Utilidades de Historial
# ---------------------------------------------------------------------------
def _event_category(event):
    tipo = str(event.get("tipo") or "")
    badge = str(event.get("badge") or "")
    if tipo == "Medición":
        return "Medición"
    if tipo in {"Alerta automática", "Alerta manual"}:
        if badge in {"VALIDADA", "RECHAZADA"}:
            return "Acción"
        return "Alerta"
    if tipo == "Incidencia":
        if badge in {"VALIDADA", "RECHAZADA"}:
            return "Acción"
        return "Incidencia"
    if tipo in {"Contacto", "Usuario", "Configuración", "Acción"}:
        return "Acción"
    if badge in {"VALIDADA", "RECHAZADA", "ALTA", "BAJA", "AJUSTE", "EDICIÓN"}:
        return "Acción"
    return tipo or "Otro"


def _history_filter_parts(query):
    zona = query.get("zona", "Todas")
    riesgo = query.get("riesgo", "Todos")
    tipo = query.get("tipo", "Todos")
    desde = query.get("desde")
    hasta = query.get("hasta")

    clauses = []
    params = []

    if zona and zona != "Todas":
        clauses.append("zona = ?")
        params.append(zona)
    if riesgo and riesgo != "Todos":
        clauses.append("riesgo = ?")
        params.append(riesgo)
    if tipo == "Acción":
        clauses.append(ACTION_SQL)
    elif tipo and tipo != "Todos":
        clauses.append("tipo = ?")
        params.append(tipo)
    if desde:
        clauses.append("fecha >= ?")
        params.append(desde)
    if hasta:
        clauses.append("fecha <= ?")
        params.append(hasta)

    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    return where, params


def _history_response(query):
    where, params = _history_filter_parts(query)

    try:
        limit = int(query.get("limit", HISTORY_PAGE_SIZE))
    except (TypeError, ValueError):
        limit = HISTORY_PAGE_SIZE
    limit = max(1, min(HISTORY_MAX_PAGE_SIZE, limit))

    try:
        offset = int(query.get("offset", 0))
    except (TypeError, ValueError):
        offset = 0
    offset = max(0, offset)

    with base.get_conn() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM historial {where}",
            params,
        ).fetchone()[0]

        eventos = base.rows_to_dicts(
            conn.execute(
                f"""
                SELECT id, tipo, descripcion AS desc, detalle AS detail,
                       nivel, badge, zona, riesgo, fecha, creado_en, alerta_id
                FROM historial
                {where}
                ORDER BY creado_en DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                [*params, limit, offset],
            ).fetchall()
        )

        stats_row = conn.execute(
            f"""
            SELECT
              COALESCE(SUM(CASE WHEN tipo = 'Medición' THEN 1 ELSE 0 END), 0) AS mediciones,
              COALESCE(SUM(CASE WHEN tipo = 'Alerta automática' THEN 1 ELSE 0 END), 0) AS automaticas,
              COALESCE(SUM(CASE WHEN tipo = 'Alerta manual' THEN 1 ELSE 0 END), 0) AS manuales,
              COALESCE(SUM(CASE WHEN tipo = 'Incidencia' THEN 1 ELSE 0 END), 0) AS incidencias,
              COALESCE(SUM(CASE WHEN {ACTION_SQL} THEN 1 ELSE 0 END), 0) AS acciones
            FROM historial
            {where}
            """,
            params,
        ).fetchone()
        stats = dict(stats_row) if stats_row else {}

    for event in eventos:
        event["categoria"] = _event_category(event)

    return {
        "ok": True,
        "eventos": eventos,
        "stats": stats,
        "offset": offset,
        "limit": limit,
        "total": int(total or 0),
        "hasMore": offset + len(eventos) < int(total or 0),
    }


# ---------------------------------------------------------------------------
# Utilidades de Contactos
# ---------------------------------------------------------------------------
def _phone_digits(value):
    return re.sub(r"\D", "", str(value or ""))


def _normalized_phone_sql(column="telefono"):
    # Quita los separadores que usa la interfaz para permitir buscar
    # 5493764893301 aunque esté guardado como +54 9 376 489-3301.
    return (
        f"REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE({column}, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '.', '')"
    )


def _find_duplicate_contact(conn, telefono, nombre, tipo, zona, exclude_id=None):
    digits = _phone_digits(telefono)
    rows = conn.execute(
        "SELECT id, nombre, tipo, zona, telefono FROM contactos"
    ).fetchall()

    wanted_name = str(nombre or "").strip().casefold()
    wanted_type = str(tipo or "").strip().casefold()
    wanted_zone = str(zona or "").strip().casefold()

    for row in rows:
        if exclude_id is not None and int(row["id"]) == int(exclude_id):
            continue

        existing_digits = _phone_digits(row["telefono"])
        if digits and existing_digits and digits == existing_digits:
            return dict(row)

        # Para contactos sin número, evita duplicar exactamente la misma ficha.
        if not digits and not existing_digits:
            if (
                str(row["nombre"] or "").strip().casefold() == wanted_name
                and str(row["tipo"] or "").strip().casefold() == wanted_type
                and str(row["zona"] or "").strip().casefold() == wanted_zone
            ):
                return dict(row)

    return None


def _contacts_response(query):
    search = str(query.get("search", "") or "").strip()
    tipo = query.get("tipo", "Todos los tipos")
    zona = query.get("zona", "Todas las zonas")

    clauses = []
    params = []

    if search:
        search_digits = _phone_digits(search)
        if search_digits:
            clauses.append(
                f"(LOWER(nombre) LIKE ? OR {_normalized_phone_sql()} LIKE ?)"
            )
            params.extend([f"%{search.lower()}%", f"%{search_digits}%"])
        else:
            clauses.append("(LOWER(nombre) LIKE ? OR telefono LIKE ?)")
            params.extend([f"%{search.lower()}%", f"%{search}%"])

    if tipo and tipo != "Todos los tipos":
        clauses.append("tipo = ?")
        params.append(tipo)
    if zona and zona != "Todas las zonas":
        clauses.append("zona = ?")
        params.append(zona)

    where = "WHERE " + " AND ".join(clauses) if clauses else ""

    with base.get_conn() as conn:
        contactos = base.rows_to_dicts(
            conn.execute(
                f"""
                SELECT id, nombre, tipo, zona, telefono, canal, estado
                FROM contactos
                {where}
                ORDER BY nombre ASC
                """,
                params,
            ).fetchall()
        )
        stats_row = conn.execute(
            """
            SELECT
              COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN estado = 'Activo' THEN 1 ELSE 0 END), 0) AS activos,
              COALESCE(SUM(CASE WHEN tipo = 'Institución' THEN 1 ELSE 0 END), 0) AS instituciones,
              COALESCE(SUM(CASE WHEN estado = 'Incompleto' THEN 1 ELSE 0 END), 0) AS incompletos
            FROM contactos
            """
        ).fetchone()

    return {
        "ok": True,
        "contactos": contactos,
        "stats": dict(stats_row) if stats_row else {},
    }


def init_db():
    previous.init_db()


class AppHandler(previous.AppHandler):
    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/historial":
            if not self._require_session(admin=False):
                return
            try:
                return self.send_json(_history_response(self.parse_query()))
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        if path == "/api/contactos":
            if not self._require_session(admin=False):
                return
            try:
                return self.send_json(_contacts_response(self.parse_query()))
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/contactos":
            if not self._require_session(admin=False):
                return
            try:
                data = self.read_json()
                nombre = str(data.get("nombre") or "").strip()
                tipo = str(data.get("tipo") or "").strip()
                zona = str(data.get("zona") or "").strip()
                telefono = base.normalize_phone(data.get("telefono"))
                estado = base.contact_status(telefono)
                canal = "Sin número" if estado == "Incompleto" else str(data.get("canal") or "📱 WhatsApp").strip()

                if not nombre or not tipo or not zona:
                    return self.send_json(
                        {"ok": False, "error": "Nombre, tipo y zona son obligatorios."},
                        400,
                    )

                with base.get_conn() as conn:
                    duplicate = _find_duplicate_contact(conn, telefono, nombre, tipo, zona)
                    if duplicate:
                        if _phone_digits(telefono):
                            message = "Ya existe un contacto registrado con ese número de teléfono."
                        else:
                            message = "Ya existe un contacto sin teléfono con el mismo nombre, tipo y zona."
                        return self.send_json({"ok": False, "error": message}, 409)

                    cur = conn.execute(
                        """
                        INSERT INTO contactos (nombre, tipo, zona, telefono, canal, estado)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (nombre, tipo, zona, telefono, canal, estado),
                    )
                    contacto = dict(
                        conn.execute(
                            """
                            SELECT id, nombre, tipo, zona, telefono, canal, estado
                            FROM contactos WHERE id = ?
                            """,
                            (cur.lastrowid,),
                        ).fetchone()
                    )
                    base.insert_history(
                        conn,
                        "Contacto",
                        f"Contacto agregado — {nombre}",
                        f"{tipo} · {telefono}",
                        badge="ALTA",
                        zona=zona,
                        riesgo="Verde",
                    )

                return self.send_json({"ok": True, "contacto": contacto}, 201)
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        return super().do_POST()

    def do_PUT(self):
        path = urlparse(self.path).path
        match = re.fullmatch(r"/api/contactos/(\d+)", path)

        if match:
            if not self._require_session(admin=False):
                return
            try:
                contact_id = int(match.group(1))
                data = self.read_json()

                with base.get_conn() as conn:
                    current_row = conn.execute(
                        "SELECT * FROM contactos WHERE id = ?",
                        (contact_id,),
                    ).fetchone()
                    if not current_row:
                        return self.send_json({"ok": False, "error": "Contacto no encontrado."}, 404)

                    current = dict(current_row)
                    nombre = str(data.get("nombre", current["nombre"])).strip()
                    tipo = str(data.get("tipo", current["tipo"])).strip()
                    zona = str(data.get("zona", current["zona"])).strip()
                    telefono = base.normalize_phone(data.get("telefono", current["telefono"]))
                    estado = base.contact_status(telefono)
                    canal = "Sin número" if estado == "Incompleto" else str(data.get("canal", current["canal"])).strip()

                    if not nombre or not tipo or not zona:
                        return self.send_json(
                            {"ok": False, "error": "Nombre, tipo y zona son obligatorios."},
                            400,
                        )

                    duplicate = _find_duplicate_contact(
                        conn, telefono, nombre, tipo, zona, exclude_id=contact_id
                    )
                    if duplicate:
                        if _phone_digits(telefono):
                            message = "Ya existe otro contacto registrado con ese número de teléfono."
                        else:
                            message = "Ya existe otro contacto sin teléfono con el mismo nombre, tipo y zona."
                        return self.send_json({"ok": False, "error": message}, 409)

                    conn.execute(
                        """
                        UPDATE contactos
                        SET nombre = ?, tipo = ?, zona = ?, telefono = ?, canal = ?,
                            estado = ?, actualizado_en = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (nombre, tipo, zona, telefono, canal, estado, contact_id),
                    )

                    contacto = dict(
                        conn.execute(
                            """
                            SELECT id, nombre, tipo, zona, telefono, canal, estado
                            FROM contactos WHERE id = ?
                            """,
                            (contact_id,),
                        ).fetchone()
                    )

                    changes = []
                    for label, old, new in [
                        ("nombre", current.get("nombre"), nombre),
                        ("tipo", current.get("tipo"), tipo),
                        ("zona", current.get("zona"), zona),
                        ("teléfono", current.get("telefono"), telefono),
                        ("canal", current.get("canal"), canal),
                        ("estado", current.get("estado"), estado),
                    ]:
                        if str(old or "") != str(new or ""):
                            changes.append(f"{label}: {old or '—'} → {new or '—'}")

                    base.insert_history(
                        conn,
                        "Contacto",
                        f"Contacto actualizado — {nombre}",
                        " · ".join(changes) if changes else "Sin cambios en los datos del contacto",
                        badge="EDICIÓN",
                        zona=zona,
                        riesgo="Verde",
                    )

                return self.send_json({"ok": True, "contacto": contacto})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        return super().do_PUT()


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("Modo testing: consistencias funcionales finales habilitadas")
    print("Sensores simulados: una nueva medición cada 5 minutos")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
