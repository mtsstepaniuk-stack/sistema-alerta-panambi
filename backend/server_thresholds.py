"""Extensión incremental del backend estable para RF1 + RF2 + RF4 + RF7 + RF18.

Mantiene intacto backend/server.py y agrega cambios acotados:
- RF1: las nuevas lecturas simuladas se registran como máximo cada 15 minutos.
- RF2/RF18: los umbrales de riesgo se guardan y configuran desde SQLite.
- RF4: los destinatarios se seleccionan según zona y nivel de riesgo.
- RF7: el tiempo estimado deja de ser fijo y se calcula con mediciones recientes.
"""

from http.server import ThreadingHTTPServer
from statistics import median
from threading import local
from urllib.parse import urlparse

import server as base

DEFAULT_THRESHOLDS = {
    "amarillo": 5.00,
    "naranja": 6.00,
    "rojo": 7.20,
}

SENSOR_READING_INTERVAL_SECONDS = 15 * 60
_stable_simulate_sensor_readings = base.simulate_sensor_readings
_stable_destinatarios_para_zona = base.destinatarios_para_zona
_notification_context = local()


def ensure_thresholds_table():
    with base.get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS configuracion_umbrales (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              amarillo_m REAL NOT NULL,
              naranja_m REAL NOT NULL,
              rojo_m REAL NOT NULL,
              actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO configuracion_umbrales
              (id, amarillo_m, naranja_m, rojo_m)
            VALUES (1, ?, ?, ?)
            """,
            (
                DEFAULT_THRESHOLDS["amarillo"],
                DEFAULT_THRESHOLDS["naranja"],
                DEFAULT_THRESHOLDS["rojo"],
            ),
        )


def get_thresholds():
    with base.get_conn() as conn:
        row = conn.execute(
            """
            SELECT amarillo_m, naranja_m, rojo_m, actualizado_en
            FROM configuracion_umbrales
            WHERE id = 1
            """
        ).fetchone()
    if not row:
        return {**DEFAULT_THRESHOLDS, "actualizado_en": None}
    return {
        "amarillo": float(row["amarillo_m"]),
        "naranja": float(row["naranja_m"]),
        "rojo": float(row["rojo_m"]),
        "actualizado_en": row["actualizado_en"],
    }


def riesgo_desde_nivel_configurable(nivel):
    values = get_thresholds()
    level = float(nivel)
    if level >= values["rojo"]:
        return "Rojo", values["rojo"]
    if level >= values["naranja"]:
        return "Naranja", values["naranja"]
    if level >= values["amarillo"]:
        return "Amarillo", values["amarillo"]
    return "Verde", values["amarillo"]


def simulate_sensor_readings_15m(conn):
    """Conserva la simulación existente, pero limita nuevas tandas a 15 minutos."""
    last = conn.execute("SELECT MAX(registrado_en) AS last_time FROM mediciones").fetchone()[0]
    if last:
        try:
            elapsed = (
                base.datetime.now()
                - base.datetime.fromisoformat(str(last).replace(" ", "T"))
            ).total_seconds()
            if elapsed < SENSOR_READING_INTERVAL_SECONDS:
                return
        except ValueError:
            pass

    return _stable_simulate_sensor_readings(conn)


def _contact_name(contact):
    return str(contact.get("nombre") or "").strip().lower()


def _is_defensa_civil(contact):
    name = _contact_name(contact)
    return "defensa civil" in name or "protección ciudadana" in name


def _is_municipalidad(contact):
    name = _contact_name(contact)
    return (
        "intendente" in name
        or "municipal" in name
        or "acción social" in name
        or "accion social" in name
    )


def _is_policia(contact):
    return "polic" in _contact_name(contact)


def _is_hospital(contact):
    return "hospital" in _contact_name(contact)


def _is_prefectura(contact):
    return "prefectura" in _contact_name(contact)


def _is_bomberos(contact):
    return "bombero" in _contact_name(contact)


def _unique_contacts(contacts):
    seen = set()
    result = []
    for contact in contacts:
        key = contact.get("id")
        if key in seen:
            continue
        seen.add(key)
        result.append(contact)
    return result


def destinatarios_por_riesgo(conn, zona, riesgo=None):
    """Selecciona contactos activos en función de zona y severidad.

    Política operativa del prototipo:
    - Amarillo / reporte vecinal validado: vecinos de la zona + Defensa Civil.
    - Naranja: lo anterior + Municipalidad + Policía + Hospital.
    - Rojo: lo anterior + Prefectura + Bomberos y demás instituciones/autoridades
      activas aplicables a la zona.

    Si no se informa riesgo se conserva el comportamiento estable anterior para
    no alterar otros flujos que todavía no trabajan con severidad explícita.
    """
    if riesgo is None:
        riesgo = getattr(_notification_context, "risk", None)
    if not riesgo:
        return _stable_destinatarios_para_zona(conn, zona)

    normalized = base.normalize_risk(riesgo)
    candidates = _stable_destinatarios_para_zona(conn, zona)
    neighbors = [c for c in candidates if c.get("tipo") == "Vecino ribereño"]
    institutions = [c for c in candidates if c.get("tipo") in ("Institución", "Autoridad")]

    selected = []
    if normalized in ("Amarillo", "Vecinal"):
        selected.extend(neighbors)
        selected.extend(c for c in institutions if _is_defensa_civil(c))
    elif normalized == "Naranja":
        selected.extend(neighbors)
        selected.extend(
            c for c in institutions
            if _is_defensa_civil(c) or _is_municipalidad(c) or _is_policia(c) or _is_hospital(c)
        )
    elif normalized == "Rojo":
        selected.extend(neighbors)
        selected.extend(
            c for c in institutions
            if (
                _is_defensa_civil(c)
                or _is_municipalidad(c)
                or _is_policia(c)
                or _is_hospital(c)
                or _is_prefectura(c)
                or _is_bomberos(c)
            )
        )
        # En nivel rojo se incluye cualquier institución/autoridad activa restante
        # que ya sea aplicable a la zona según la lógica estable del sistema.
        selected.extend(institutions)
    else:
        # Verde no constituye una alerta hidrológica; se mantiene únicamente
        # coordinación institucional si se usa de forma manual.
        selected.extend(c for c in institutions if _is_defensa_civil(c))

    return _unique_contacts(selected)


def notification_policy_text(riesgo):
    normalized = base.normalize_risk(riesgo)
    if normalized in ("Amarillo", "Vecinal"):
        return "Vecinos de la zona y Defensa Civil"
    if normalized == "Naranja":
        return "Vecinos de la zona, Defensa Civil, Municipalidad, Policía y Hospital"
    if normalized == "Rojo":
        return "Vecinos de la zona y organismos de respuesta de Panambí"
    return "Defensa Civil"


def _parse_db_datetime(value):
    if not value:
        return None
    try:
        return base.datetime.fromisoformat(str(value).replace(" ", "T"))
    except ValueError:
        return None


def _sensor_recent_rate(rows):
    """Calcula el ritmo m/h desde historial; si no alcanza, usa la tendencia simulada."""
    if not rows:
        return None, "sin datos"

    if len(rows) >= 2:
        newest = rows[0]
        oldest = rows[-1]
        newest_dt = _parse_db_datetime(newest["registrado_en"])
        oldest_dt = _parse_db_datetime(oldest["registrado_en"])
        if newest_dt and oldest_dt:
            hours = (newest_dt - oldest_dt).total_seconds() / 3600.0
            if hours > 0:
                rate = (float(newest["nivel_m"]) - float(oldest["nivel_m"])) / hours
                if -2.0 <= rate <= 2.0:
                    return rate, "historial reciente"

    try:
        return float(rows[0]["tendencia_m"] or 0.0), "tendencia de la última lectura"
    except (TypeError, ValueError):
        return 0.0, "sin tendencia"


def estimate_arrival_time():
    """Estimación operativa del prototipo basada en tendencia e historial.

    Usa S-01 como sensor de referencia aguas arriba y combina los ritmos recientes
    de los sensores disponibles. El resultado expresa cuánto falta, al ritmo actual,
    para que el sensor de referencia alcance el siguiente umbral configurado.
    No pretende reemplazar un modelo hidrodinámico real.
    """
    thresholds = get_thresholds()
    sensor_data = []

    with base.get_conn() as conn:
        for sensor in base.SENSORES:
            rows = conn.execute(
                """
                SELECT nivel_m, tendencia_m, registrado_en
                FROM mediciones
                WHERE sensor = ?
                ORDER BY registrado_en DESC, id DESC
                LIMIT 8
                """,
                (sensor["sensor"],),
            ).fetchall()
            if not rows:
                continue

            rate, source = _sensor_recent_rate(rows)
            sensor_data.append(
                {
                    "sensor": sensor["sensor"],
                    "zona": sensor["zona"],
                    "nivel": float(rows[0]["nivel_m"]),
                    "ritmo": float(rate or 0.0),
                    "fuente": source,
                }
            )

    if not sensor_data:
        return {
            "horas": None,
            "minutos": None,
            "estado": "Sin datos suficientes",
            "zona": "—",
            "sensor": "—",
            "ritmo_m_h": 0.0,
            "umbral_objetivo_m": None,
            "metodo": "sin datos",
        }

    reference = next((item for item in sensor_data if item["sensor"] == "S-01"), sensor_data[0])
    level = reference["nivel"]
    risk, _ = riesgo_desde_nivel_configurable(level)

    if level >= thresholds["rojo"]:
        return {
            "horas": 0.0,
            "minutos": 0,
            "estado": "Umbral rojo alcanzado",
            "zona": reference["zona"],
            "sensor": reference["sensor"],
            "nivel_actual_m": round(level, 2),
            "ritmo_m_h": round(reference["ritmo"], 3),
            "riesgo_actual": risk,
            "umbral_objetivo_m": thresholds["rojo"],
            "metodo": "nivel actual",
        }

    if level < thresholds["amarillo"]:
        target = thresholds["amarillo"]
        target_name = "Amarillo"
    elif level < thresholds["naranja"]:
        target = thresholds["naranja"]
        target_name = "Naranja"
    else:
        target = thresholds["rojo"]
        target_name = "Rojo"

    positive_rates = [item["ritmo"] for item in sensor_data if item["ritmo"] > 0.005]
    combined_rate = median(positive_rates) if positive_rates else reference["ritmo"]

    if combined_rate <= 0.005:
        return {
            "horas": None,
            "minutos": None,
            "estado": "Nivel estable o descendiendo",
            "zona": reference["zona"],
            "sensor": reference["sensor"],
            "nivel_actual_m": round(level, 2),
            "ritmo_m_h": round(combined_rate, 3),
            "riesgo_actual": risk,
            "umbral_objetivo_m": target,
            "umbral_objetivo": target_name,
            "metodo": "historial y tendencias de sensores",
        }

    eta_hours = max(0.0, (target - level) / combined_rate)
    if eta_hours > 48:
        return {
            "horas": None,
            "minutos": None,
            "estado": "Sin estimación confiable",
            "zona": reference["zona"],
            "sensor": reference["sensor"],
            "nivel_actual_m": round(level, 2),
            "ritmo_m_h": round(combined_rate, 3),
            "riesgo_actual": risk,
            "umbral_objetivo_m": target,
            "umbral_objetivo": target_name,
            "metodo": "historial y tendencias de sensores",
        }

    return {
        "horas": round(eta_hours, 2),
        "minutos": int(round(eta_hours * 60)),
        "estado": f"Estimado hasta umbral {target_name}",
        "zona": reference["zona"],
        "sensor": reference["sensor"],
        "nivel_actual_m": round(level, 2),
        "ritmo_m_h": round(combined_rate, 3),
        "riesgo_actual": risk,
        "umbral_objetivo_m": target,
        "umbral_objetivo": target_name,
        "metodo": "historial y tendencias de múltiples sensores",
    }


def init_db():
    base.init_db()
    ensure_thresholds_table()

    with base.get_conn() as conn:
        conn.execute(
            """
            UPDATE historial
            SET detalle = REPLACE(detalle, 'Frecuencia 5 min', 'Frecuencia 15 min')
            WHERE detalle LIKE '%Frecuencia 5 min%'
            """
        )

    base.riesgo_desde_nivel = riesgo_desde_nivel_configurable
    base.simulate_sensor_readings = simulate_sensor_readings_15m
    base.destinatarios_para_zona = destinatarios_por_riesgo


class AppHandler(base.AppHandler):
    def read_json(self):
        data = super().read_json()
        path = urlparse(self.path).path

        if path == "/api/alertas/manuales":
            _notification_context.risk = base.normalize_risk(data.get("riesgo"))
        elif path == "/api/alertas/accion" and data.get("accion") == "Validada":
            alert_id = data.get("alertaId")
            try:
                with base.get_conn() as conn:
                    if alert_id:
                        row = conn.execute(
                            "SELECT riesgo FROM alertas WHERE id = ? AND estado = 'Pendiente'",
                            (alert_id,),
                        ).fetchone()
                    else:
                        row = conn.execute(
                            "SELECT riesgo FROM alertas WHERE estado = 'Pendiente' ORDER BY creada_en ASC, id ASC LIMIT 1"
                        ).fetchone()
                _notification_context.risk = base.normalize_risk(row["riesgo"]) if row else None
            except Exception:
                _notification_context.risk = None

        return data

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/umbrales":
            try:
                return self.send_json({"ok": True, "umbrales": get_thresholds()})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)
        if path == "/api/estimacion-llegada":
            try:
                return self.send_json({"ok": True, "estimacion": estimate_arrival_time()})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)
        if path == "/api/contactos/destinatarios":
            try:
                query = self.parse_query()
                zona = query.get("zona", "Ribera Norte")
                riesgo = query.get("riesgo")
                if not riesgo:
                    return super().do_GET()
                with base.get_conn() as conn:
                    contactos = destinatarios_por_riesgo(conn, zona, riesgo)
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
                        "criterio": notification_policy_text(riesgo),
                        "riesgo": base.normalize_risk(riesgo),
                    }
                )
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)
        return super().do_GET()

    def do_POST(self):
        try:
            return super().do_POST()
        finally:
            _notification_context.risk = None

    def do_PUT(self):
        path = urlparse(self.path).path
        if path == "/api/umbrales":
            try:
                data = self.read_json()
                amarillo = float(data.get("amarillo"))
                naranja = float(data.get("naranja"))
                rojo = float(data.get("rojo"))

                if not (0.10 <= amarillo < naranja < rojo <= 20.0):
                    return self.send_json(
                        {
                            "ok": False,
                            "error": "Los umbrales deben cumplir: Amarillo < Naranja < Rojo y estar entre 0,10 m y 20 m.",
                        },
                        400,
                    )

                operador = str(data.get("operador", "Administrador")).strip() or "Administrador"
                with base.get_conn() as conn:
                    conn.execute(
                        """
                        UPDATE configuracion_umbrales
                        SET amarillo_m = ?, naranja_m = ?, rojo_m = ?, actualizado_en = CURRENT_TIMESTAMP
                        WHERE id = 1
                        """,
                        (round(amarillo, 2), round(naranja, 2), round(rojo, 2)),
                    )
                    base.insert_history(
                        conn,
                        "Configuración",
                        "Umbrales de riesgo actualizados",
                        f"Operador: {operador} · Amarillo {amarillo:.2f} m · Naranja {naranja:.2f} m · Rojo {rojo:.2f} m",
                        badge="AJUSTE",
                        zona="Sistema",
                        riesgo="Verde",
                    )

                return self.send_json({"ok": True, "umbrales": get_thresholds()})
            except (TypeError, ValueError):
                return self.send_json({"ok": False, "error": "Ingrese valores numéricos válidos para los tres umbrales."}, 400)
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)
        return super().do_PUT()


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("RF1: lecturas simuladas cada 15 minutos")
    print("RF2/RF18: umbrales configurables habilitados")
    print("RF4: destinatarios diferenciados por zona y riesgo")
    print("RF7: estimación dinámica de llegada habilitada")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
