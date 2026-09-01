"""RNF1: las alertas deben generarse dentro de los 5 minutos desde la detección.

Esta capa extiende el backend funcional estable sin modificar los RF existentes.
Registra para cada alerta automática:
- momento de detección de la condición de riesgo;
- momento de generación de la alerta;
- latencia en segundos;
- cumplimiento del límite RNF1 (<= 300 s).
"""

from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_final as previous

base = previous.base
RNF1_MAX_SECONDS = 5 * 60
_underlying_simulate = None


def _parse_dt(value):
    if not value:
        return None
    try:
        return base.datetime.fromisoformat(str(value).replace(" ", "T"))
    except ValueError:
        return None


def _ensure_rnf1_columns():
    with base.get_conn() as conn:
        base.ensure_column(conn, "alertas", "detectada_en", "TEXT")
        base.ensure_column(conn, "alertas", "latencia_generacion_s", "REAL DEFAULT 0")
        base.ensure_column(conn, "alertas", "rnf1_cumple", "INTEGER DEFAULT 1")


def _annotate_alert(conn, alert):
    alert = dict(alert)
    detected = alert.get("detectada_en")

    if not detected and alert.get("sensor"):
        measurement = conn.execute(
            """
            SELECT registrado_en
            FROM mediciones
            WHERE sensor = ? AND registrado_en <= ?
            ORDER BY registrado_en DESC, id DESC
            LIMIT 1
            """,
            (alert["sensor"], alert["creada_en"]),
        ).fetchone()
        if measurement:
            detected = measurement["registrado_en"]

    detected = detected or alert.get("creada_en")
    detected_dt = _parse_dt(detected)
    created_dt = _parse_dt(alert.get("creada_en"))
    latency = 0.0
    if detected_dt and created_dt:
        latency = max(0.0, (created_dt - detected_dt).total_seconds())

    complies = 1 if latency <= RNF1_MAX_SECONDS else 0
    conn.execute(
        """
        UPDATE alertas
        SET detectada_en = ?, latencia_generacion_s = ?, rnf1_cumple = ?
        WHERE id = ?
        """,
        (detected, round(latency, 3), complies, alert["id"]),
    )


def _annotate_missing(conn):
    rows = conn.execute(
        """
        SELECT id, sensor, creada_en, detectada_en
        FROM alertas
        WHERE origen = 'Automática'
          AND (detectada_en IS NULL OR latencia_generacion_s IS NULL)
        ORDER BY id
        """
    ).fetchall()
    for row in rows:
        _annotate_alert(conn, row)


def simulate_sensor_readings_rnf1(conn):
    """Mantiene la simulación estable y mide nuevas alertas sin alterar su lógica."""
    before_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM alertas").fetchone()[0]
    if _underlying_simulate:
        _underlying_simulate(conn)

    rows = conn.execute(
        """
        SELECT id, sensor, creada_en, detectada_en
        FROM alertas
        WHERE origen = 'Automática' AND id > ?
        ORDER BY id
        """,
        (before_id,),
    ).fetchall()
    for row in rows:
        _annotate_alert(conn, row)


def init_db():
    previous.init_db()
    _ensure_rnf1_columns()

    global _underlying_simulate
    if _underlying_simulate is None:
        _underlying_simulate = base.simulate_sensor_readings
        base.simulate_sensor_readings = simulate_sensor_readings_rnf1

    with base.get_conn() as conn:
        _annotate_missing(conn)


def _rnf1_status():
    with base.get_conn() as conn:
        # Ejecuta el flujo normal para que cualquier lectura/alerta nueva quede medida.
        base.simulate_sensor_readings(conn)
        _annotate_missing(conn)

        summary = dict(
            conn.execute(
                """
                SELECT COUNT(*) AS total,
                       SUM(CASE WHEN rnf1_cumple = 1 THEN 1 ELSE 0 END) AS cumplen,
                       MAX(COALESCE(latencia_generacion_s, 0)) AS latencia_max_s
                FROM alertas
                WHERE origen = 'Automática'
                """
            ).fetchone()
        )
        recent = base.rows_to_dicts(
            conn.execute(
                """
                SELECT id, sensor, zona, riesgo, detectada_en, creada_en,
                       latencia_generacion_s, rnf1_cumple
                FROM alertas
                WHERE origen = 'Automática'
                ORDER BY id DESC
                LIMIT 20
                """
            ).fetchall()
        )

    total = int(summary.get("total") or 0)
    cumplen = int(summary.get("cumplen") or 0)
    maximum = float(summary.get("latencia_max_s") or 0.0)
    return {
        "limite_segundos": RNF1_MAX_SECONDS,
        "total_alertas_automaticas": total,
        "cumplen": cumplen,
        "incumplen": max(0, total - cumplen),
        "latencia_max_s": round(maximum, 3),
        "cumple_global": total == 0 or cumplen == total,
        "alertas": recent,
    }


class AppHandler(previous.AppHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/rnf1-status":
            if not self._require_session(admin=False):
                return
            try:
                return self.send_json({"ok": True, "rnf1": _rnf1_status()})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)
        return super().do_GET()


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("RNF1: control de generación de alertas <= 5 minutos habilitado")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
