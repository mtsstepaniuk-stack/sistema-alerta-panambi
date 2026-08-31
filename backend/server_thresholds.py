"""Extensión incremental del backend estable para RF2 + RF18.

Mantiene intacto backend/server.py y agrega umbrales configurables en SQLite.
La simulación de sensores sigue siendo la existente; únicamente cambia la forma
que clasifica cada nivel de agua.
"""

from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server as base

DEFAULT_THRESHOLDS = {
    "amarillo": 5.00,
    "naranja": 6.00,
    "rojo": 7.20,
}


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


def init_db():
    # Primero ejecuta exactamente la inicialización de la versión estable.
    base.init_db()
    ensure_thresholds_table()
    # Desde este punto toda la lógica ya existente usa los valores configurados.
    base.riesgo_desde_nivel = riesgo_desde_nivel_configurable


class AppHandler(base.AppHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/umbrales":
            try:
                return self.send_json({"ok": True, "umbrales": get_thresholds()})
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
    print("RF2/RF18: umbrales configurables habilitados")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
