"""Extensión incremental del backend estable para RF1 + RF2 + RF7 + RF18.

Mantiene intacto backend/server.py y agrega cambios acotados:
- RF1: las nuevas lecturas simuladas se registran como máximo cada 15 minutos.
- RF2/RF18: los umbrales de riesgo se guardan y configuran desde SQLite.
- RF7: el tiempo estimado deja de ser fijo y se calcula con mediciones recientes.
"""

from http.server import ThreadingHTTPServer
from statistics import median
from urllib.parse import urlparse

import server as base

DEFAULT_THRESHOLDS = {
    "amarillo": 5.00,
    "naranja": 6.00,
    "rojo": 7.20,
}

SENSOR_READING_INTERVAL_SECONDS = 15 * 60
_stable_simulate_sensor_readings = base.simulate_sensor_readings


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
            # Si hubiera una fecha antigua con formato inesperado, la función estable
            # conserva su propio mecanismo de recuperación.
            pass

    return _stable_simulate_sensor_readings(conn)


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
                # Descarta saltos absurdos para que un dato anómalo no domine la estimación.
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
    # Si el valor supera dos días deja de ser una estimación útil para este tablero.
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
    # Primero ejecuta exactamente la inicialización de la versión estable.
    base.init_db()
    ensure_thresholds_table()

    # Corrige únicamente el texto histórico sembrado por versiones previas.
    with base.get_conn() as conn:
        conn.execute(
            """
            UPDATE historial
            SET detalle = REPLACE(detalle, 'Frecuencia 5 min', 'Frecuencia 15 min')
            WHERE detalle LIKE '%Frecuencia 5 min%'
            """
        )

    # Desde este punto toda la lógica ya existente usa los valores configurados
    # y respeta el intervalo de 15 minutos para nuevas lecturas simuladas.
    base.riesgo_desde_nivel = riesgo_desde_nivel_configurable
    base.simulate_sensor_readings = simulate_sensor_readings_15m


class AppHandler(base.AppHandler):
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
        return super().do_GET()

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
    print("RF7: estimación dinámica de llegada habilitada")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
