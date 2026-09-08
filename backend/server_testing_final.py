"""Entrada final para la versión entregada a testing.

Aplica la frecuencia de 5 minutos después de que RNF1 haya instalado su propio
wrapper de simulación, de modo que ambas capas funcionen en el orden correcto.
"""

from http.server import ThreadingHTTPServer

import server_testing as previous

base = previous.base
SENSOR_READING_INTERVAL_SECONDS = 5 * 60
_underlying_simulator = None


def simulate_sensor_readings_every_five_minutes(conn):
    last = conn.execute("SELECT MAX(registrado_en) FROM mediciones").fetchone()[0]
    if last:
        elapsed = conn.execute(
            "SELECT CAST((julianday('now') - julianday(?)) * 86400 AS INTEGER)",
            (last,),
        ).fetchone()[0]
        if elapsed is not None and int(elapsed) < SENSOR_READING_INTERVAL_SECONDS:
            return

    if _underlying_simulator:
        return _underlying_simulator(conn)


def init_db():
    previous.init_db()

    global _underlying_simulator
    if _underlying_simulator is None:
        _underlying_simulator = base.simulate_sensor_readings
        base.simulate_sensor_readings = simulate_sensor_readings_every_five_minutes


class AppHandler(previous.AppHandler):
    pass


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("Versión de testing funcional habilitada")
    print("Sensores simulados: una nueva medición cada 5 minutos")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
