"""Extensión incremental para RF8 sobre la versión estable actual.

Mantiene server_thresholds.py intacto y completa la alerta manual con:
- fuente de la alerta;
- zona y nivel de riesgo;
- mensaje;
- canales simulados seleccionados;
- destinatarios seleccionados, respetando la política RF4.
"""

from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_thresholds as previous

base = previous.base

ALLOWED_CHANNELS = {"WhatsApp", "SMS", "Llamada", "Altoparlante"}


def ensure_rf8_columns():
    with base.get_conn() as conn:
        base.ensure_column(conn, "alertas", "fuente", "TEXT DEFAULT ''")
        base.ensure_column(conn, "alertas", "canales", "TEXT DEFAULT ''")


def init_db():
    previous.init_db()
    ensure_rf8_columns()


def _normalize_channels(value):
    if isinstance(value, str):
        raw = [part.strip() for part in value.split(",")]
    elif isinstance(value, list):
        raw = [str(part).strip() for part in value]
    else:
        raw = []

    result = []
    for channel in raw:
        clean = channel.replace("📱", "").replace("💬", "").replace("📞", "").replace("📢", "").strip()
        if clean in ALLOWED_CHANNELS and clean not in result:
            result.append(clean)
    return result


class AppHandler(previous.AppHandler):
    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/alertas/manuales":
            return super().do_POST()

        try:
            data = self.read_json()
            riesgo = data.get("riesgo")
            zona = str(data.get("zona", "")).strip()
            mensaje = str(data.get("mensaje", "")).strip()
            operador = str(data.get("operador", "Operador")).strip() or "Operador"
            fuente = str(data.get("fuente", "")).strip()
            canales = _normalize_channels(data.get("canales"))
            destinatarios_ids = data.get("destinatarios_ids") or []

            if not riesgo or not zona or not mensaje or not fuente:
                return self.send_json(
                    {"ok": False, "error": "Fuente, riesgo, zona y mensaje son obligatorios."},
                    400,
                )
            if not canales:
                return self.send_json(
                    {"ok": False, "error": "Debe seleccionar al menos un canal de envío."},
                    400,
                )

            clean_risk = base.normalize_risk(riesgo)
            requested_ids = []
            for value in destinatarios_ids:
                try:
                    contact_id = int(value)
                except (TypeError, ValueError):
                    continue
                if contact_id not in requested_ids:
                    requested_ids.append(contact_id)

            if not requested_ids:
                return self.send_json(
                    {"ok": False, "error": "Debe seleccionar al menos un destinatario."},
                    400,
                )

            with base.get_conn() as conn:
                eligible = previous.destinatarios_por_riesgo(conn, zona, clean_risk)
                eligible_ids = {int(contact["id"]) for contact in eligible}
                selected_ids = [contact_id for contact_id in requested_ids if contact_id in eligible_ids]

                if not selected_ids:
                    return self.send_json(
                        {"ok": False, "error": "Los destinatarios seleccionados no corresponden a la zona y nivel de riesgo elegidos."},
                        400,
                    )

                placeholders = ",".join("?" for _ in selected_ids)
                notificados = conn.execute(
                    f"SELECT COUNT(*) FROM contactos WHERE estado = 'Activo' AND id IN ({placeholders})",
                    selected_ids,
                ).fetchone()[0]

                if notificados <= 0:
                    return self.send_json(
                        {"ok": False, "error": "No hay destinatarios activos seleccionados."},
                        400,
                    )

                channels_text = ", ".join(canales)
                cur = conn.execute(
                    """
                    INSERT INTO alertas
                      (origen, riesgo, zona, mensaje, estado, operador, notificados, sensor, fuente, canales)
                    VALUES
                      ('Manual', ?, ?, ?, 'Emitida', ?, ?, 'Manual', ?, ?)
                    """,
                    (clean_risk, zona, mensaje, operador, notificados, fuente, channels_text),
                )

                base.insert_history(
                    conn,
                    "Alerta manual",
                    f"Alerta manual emitida — {zona}",
                    (
                        f"Fuente: {fuente} · Operador: {operador} · "
                        f"Canales: {channels_text} · {notificados} contactos notificados"
                    ),
                    badge="EMITIDA",
                    zona=zona,
                    riesgo=clean_risk,
                )

            return self.send_json(
                {
                    "ok": True,
                    "id": cur.lastrowid,
                    "notificados": notificados,
                    "fuente": fuente,
                    "canales": canales,
                    "riesgo": clean_risk,
                    "zona": zona,
                },
                201,
            )
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)
        finally:
            previous._notification_context.risk = None


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("RF1: lecturas simuladas cada 15 minutos")
    print("RF2/RF18: umbrales configurables habilitados")
    print("RF4: destinatarios diferenciados por zona y riesgo")
    print("RF7: estimación dinámica de llegada habilitada")
    print("RF8: alerta manual completa con fuente, canales y destinatarios")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
