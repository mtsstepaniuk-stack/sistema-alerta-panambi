"""Extensión incremental para RF8 sobre la versión estable actual.

Mantiene server_thresholds.py intacto y completa la alerta manual con:
- fuente de la alerta;
- zona y nivel de riesgo;
- mensaje;
- canales simulados seleccionados;
- destinatarios seleccionados, respetando la política RF4;
- filtrado por los canales disponibles de cada contacto.
"""

from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_thresholds as previous

base = previous.base

ALLOWED_CHANNELS = {"WhatsApp", "SMS", "Llamada", "Altoparlante"}
DIRECT_CONTACT_CHANNELS = {"WhatsApp", "SMS", "Llamada"}
CHANNEL_ICON = {
    "WhatsApp": "📱",
    "SMS": "💬",
    "Llamada": "📞",
    "Altoparlante": "📢",
}


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
        clean = (
            channel.replace("📱", "")
            .replace("💬", "")
            .replace("📞", "")
            .replace("📢", "")
            .strip()
        )
        if clean in ALLOWED_CHANNELS and clean not in result:
            result.append(clean)
    return result


def _contact_primary_channel(value):
    return (
        str(value or "")
        .replace("📱", "")
        .replace("💬", "")
        .replace("📞", "")
        .replace("📢", "")
        .strip()
    )


def _contact_available_channels(contact):
    """Devuelve los canales configurados/disponibles para el contacto del prototipo.

    La base histórica guarda un canal principal por contacto. Para que el flujo RF8
    pueda representar contactos con más de un medio disponible, se amplía de forma
    determinística sin cambiar los datos originales:
    - un móvil registrado con SMS también admite WhatsApp;
    - algunos móviles cuyo canal principal es WhatsApp incluyen además llamada;
    - los demás conservan su canal principal.

    Así se obtienen combinaciones como 💬📱 o 📱📞, manteniendo consistencia entre
    lo que se muestra y los filtros de envío.
    """
    primary = _contact_primary_channel(contact.get("canal"))
    phone = str(contact.get("telefono") or "")
    contact_id = int(contact.get("id") or 0)

    channels = []
    if primary in DIRECT_CONTACT_CHANNELS:
        channels.append(primary)

    is_mobile = "+54 9" in phone

    if primary == "SMS" and is_mobile and "WhatsApp" not in channels:
        channels.append("WhatsApp")

    if primary == "WhatsApp" and is_mobile and contact_id % 5 == 0 and "Llamada" not in channels:
        channels.append("Llamada")

    return channels


def _channel_icons(channels):
    ordered = ["SMS", "WhatsApp", "Llamada"]
    return "".join(CHANNEL_ICON[channel] for channel in ordered if channel in channels)


def _filter_contacts_by_channels(contacts, channels):
    direct = {channel for channel in channels if channel in DIRECT_CONTACT_CHANNELS}
    if not direct:
        # Altoparlante es un canal de difusión zonal, no una capacidad individual
        # almacenada en la ficha de cada contacto. Si es el único canal, no se
        # descartan destinatarios por su teléfono.
        return list(contacts)

    return [
        contact for contact in contacts
        if direct.intersection(_contact_available_channels(contact))
    ]


def _contact_for_recipient_table(contact):
    available = _contact_available_channels(contact)
    result = dict(contact)
    result["canal_principal"] = contact.get("canal")
    result["canales_disponibles"] = available
    # La tabla del Paso 2 ya tiene una columna Canal. Para mantenerla compacta,
    # allí se muestran únicamente los iconos de todos los medios disponibles.
    result["canal"] = _channel_icons(available) or "—"
    return result


class AppHandler(previous.AppHandler):
    def serve_file(self):
        """Expone assets visuales sin abrir otros archivos internos del repo."""
        parsed = urlparse(self.path)
        clean_path = parsed.path.strip("/") or "index.html"
        parts = base.Path(clean_path).parts

        if parts and parts[0] == "assets":
            assets_root = (base.ROOT_DIR / "assets").resolve()
            file_path = (base.ROOT_DIR / clean_path).resolve()

            if (
                not str(file_path).startswith(str(assets_root))
                or any(part.startswith(".") for part in parts)
                or not file_path.exists()
                or not file_path.is_file()
            ):
                self.send_error(404)
                return

            content_type, _ = base.mimetypes.guess_type(str(file_path))
            payload = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type or "application/octet-stream")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "public, max-age=3600")
            self.end_headers()
            self.wfile.write(payload)
            return

        return super().serve_file()

    def do_GET(self):
        path = urlparse(self.path).path
        if path != "/api/contactos/destinatarios":
            return super().do_GET()

        try:
            query = self.parse_query()
            zona = query.get("zona", "Ribera Norte")
            riesgo = query.get("riesgo")
            canales = _normalize_channels(query.get("canales", ""))

            if not riesgo:
                return super().do_GET()

            with base.get_conn() as conn:
                contactos = previous.destinatarios_por_riesgo(conn, zona, riesgo)
                contactos = _filter_contacts_by_channels(contactos, canales)
                contactos = [_contact_for_recipient_table(contact) for contact in contactos]

            resumen = {
                "Vecino ribereño": sum(1 for c in contactos if c["tipo"] == "Vecino ribereño"),
                "Institución": sum(1 for c in contactos if c["tipo"] == "Institución"),
                "Autoridad": sum(1 for c in contactos if c["tipo"] == "Autoridad"),
            }

            return self.send_json(
                {
                    "ok": True,
                    "contactos": contactos,
                    "resumen": resumen,
                    "criterio": previous.notification_policy_text(riesgo),
                    "riesgo": base.normalize_risk(riesgo),
                    "canales": canales,
                }
            )
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)

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
                eligible = _filter_contacts_by_channels(eligible, canales)
                eligible_ids = {int(contact["id"]) for contact in eligible}
                selected_ids = [contact_id for contact_id in requested_ids if contact_id in eligible_ids]

                if not selected_ids:
                    return self.send_json(
                        {
                            "ok": False,
                            "error": "Los destinatarios seleccionados no corresponden a la zona, nivel de riesgo y canales elegidos.",
                        },
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
