"""Extensión incremental para RF10 sobre la versión estable RF8.

Completa el historial operativo del sistema con:
- mediciones periódicas;
- alertas automáticas y manuales;
- incidencias vecinales;
- acciones realizadas (validaciones, rechazos y gestión/configuración);
- registro de modificaciones de contactos.
"""

from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_rf8 as previous

base = previous.base

ACTION_TYPES = {"Contacto", "Usuario", "Configuración", "Acción"}
ACTION_BADGES = {"VALIDADA", "RECHAZADA", "ALTA", "BAJA", "AJUSTE", "EDICIÓN"}


def init_db():
    previous.init_db()


def _history_action_clause():
    placeholders_types = ",".join("?" for _ in ACTION_TYPES)
    placeholders_badges = ",".join("?" for _ in ACTION_BADGES)
    clause = f"(tipo IN ({placeholders_types}) OR badge IN ({placeholders_badges}))"
    params = list(ACTION_TYPES) + list(ACTION_BADGES)
    return clause, params


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
    if tipo in ACTION_TYPES or badge in ACTION_BADGES:
        return "Acción"
    return tipo or "Otro"


class AppHandler(previous.AppHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path != "/api/historial":
            return super().do_GET()

        try:
            query = self.parse_query()
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
                action_clause, action_params = _history_action_clause()
                clauses.append(action_clause)
                params.extend(action_params)
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

            with base.get_conn() as conn:
                eventos = base.rows_to_dicts(
                    conn.execute(
                        f"""
                        SELECT id, tipo, descripcion AS desc, detalle AS detail,
                               nivel, badge, zona, riesgo, fecha, creado_en
                        FROM historial
                        {where}
                        ORDER BY creado_en DESC, id DESC
                        LIMIT 100
                        """,
                        params,
                    ).fetchall()
                )

                action_clause, action_params = _history_action_clause()
                stats_row = conn.execute(
                    f"""
                    SELECT
                      SUM(CASE WHEN tipo = 'Medición' THEN 1 ELSE 0 END) AS mediciones,
                      SUM(CASE WHEN tipo = 'Alerta automática' THEN 1 ELSE 0 END) AS automaticas,
                      SUM(CASE WHEN tipo = 'Alerta manual' THEN 1 ELSE 0 END) AS manuales,
                      SUM(CASE WHEN tipo = 'Incidencia' THEN 1 ELSE 0 END) AS incidencias,
                      SUM(CASE WHEN {action_clause} THEN 1 ELSE 0 END) AS acciones
                    FROM historial
                    """,
                    action_params,
                ).fetchone()
                stats = dict(stats_row) if stats_row else {}

            for event in eventos:
                event["categoria"] = _event_category(event)

            return self.send_json({"ok": True, "eventos": eventos, "stats": stats})
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)

    def do_PUT(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/contactos/"):
            return super().do_PUT()

        try:
            contact_id = int(path.split("/")[-1])
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
                        "SELECT id, nombre, tipo, zona, telefono, canal, estado FROM contactos WHERE id = ?",
                        (contact_id,),
                    ).fetchone()
                )

                changes = []
                comparisons = [
                    ("nombre", current.get("nombre"), nombre),
                    ("tipo", current.get("tipo"), tipo),
                    ("zona", current.get("zona"), zona),
                    ("teléfono", current.get("telefono"), telefono),
                    ("canal", current.get("canal"), canal),
                    ("estado", current.get("estado"), estado),
                ]
                for label, old, new in comparisons:
                    if str(old or "") != str(new or ""):
                        changes.append(f"{label}: {old or '—'} → {new or '—'}")

                detail = " · ".join(changes) if changes else "Sin cambios en los datos del contacto"
                base.insert_history(
                    conn,
                    "Contacto",
                    f"Contacto actualizado — {nombre}",
                    detail,
                    badge="EDICIÓN",
                    zona=zona,
                    riesgo="Verde",
                )

            return self.send_json({"ok": True, "contacto": contacto})
        except ValueError:
            return self.send_json({"ok": False, "error": "Identificador de contacto inválido."}, 400)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("RF1: lecturas simuladas cada 15 minutos")
    print("RF2/RF18: umbrales configurables habilitados")
    print("RF4: destinatarios diferenciados por zona y riesgo")
    print("RF7: estimación dinámica de llegada habilitada")
    print("RF8: alerta manual completa habilitada")
    print("RF10: historial de mediciones, alertas, incidencias y acciones habilitado")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
