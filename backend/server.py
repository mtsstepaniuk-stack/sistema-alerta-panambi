import base64
import json
import math
import mimetypes
import os
import random
import re
import sqlite3
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT_DIR = Path(__file__).resolve().parent.parent

# Por defecto los datos se guardan dentro del proyecto. En un hosting se pueden
# redirigir a un disco persistente mediante variables de entorno sin tocar código.
DEFAULT_DB_DIR = ROOT_DIR / "backend" / "database"
DB_DIR = Path(os.environ.get("SAT_DATA_DIR", str(DEFAULT_DB_DIR))).expanduser().resolve()
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "sat_inundaciones.sqlite"

PORT = int(os.environ.get("PORT", "3000"))

DEFAULT_UPLOAD_DIR = ROOT_DIR / "uploads" / "incidencias"
UPLOAD_DIR = Path(os.environ.get("SAT_UPLOAD_DIR", str(DEFAULT_UPLOAD_DIR))).expanduser().resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Coordenadas aproximadas para mostrar el sistema sobre un mapa real de Panambí.
SENSORES = [
    {"sensor": "S-01", "zona": "Ribera Norte", "base": 7.05, "lat": -27.7210, "lng": -54.9158},
    {"sensor": "S-02", "zona": "Bajo Uruguay", "base": 6.15, "lat": -27.7265, "lng": -54.9137},
    {"sensor": "S-03", "zona": "Costa Sur", "base": 4.85, "lat": -27.7348, "lng": -54.9104},
    {"sensor": "S-04", "zona": "Zona Alta", "base": 3.10, "lat": -27.7240, "lng": -54.8997},
    {"sensor": "S-05", "zona": "Puente", "base": 5.55, "lat": -27.7187, "lng": -54.9073},
    {"sensor": "S-06", "zona": "Arroyo", "base": 5.85, "lat": -27.7301, "lng": -54.9040},
]

ZONAS_MAPA = [
    {"nombre": "Ribera Norte", "riesgo_base": "Rojo", "coords": [[-27.7179, -54.9195], [-27.7188, -54.9126], [-27.7240, -54.9131], [-27.7246, -54.9201]]},
    {"nombre": "Bajo Uruguay", "riesgo_base": "Naranja", "coords": [[-27.7240, -54.9166], [-27.7248, -54.9105], [-27.7302, -54.9108], [-27.7304, -54.9169]]},
    {"nombre": "Costa Sur", "riesgo_base": "Naranja", "coords": [[-27.7315, -54.9148], [-27.7314, -54.9079], [-27.7375, -54.9082], [-27.7377, -54.9150]]},
    {"nombre": "Zona Alta", "riesgo_base": "Verde", "coords": [[-27.7193, -54.9048], [-27.7194, -54.8958], [-27.7260, -54.8958], [-27.7258, -54.9052]]},
    {"nombre": "Puente", "riesgo_base": "Amarillo", "coords": [[-27.7166, -54.9103], [-27.7165, -54.9050], [-27.7211, -54.9050], [-27.7212, -54.9104]]},
    {"nombre": "Arroyo", "riesgo_base": "Naranja", "coords": [[-27.7270, -54.9070], [-27.7272, -54.9010], [-27.7335, -54.9009], [-27.7336, -54.9071]]},
]


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def rows_to_dicts(rows):
    return [dict(row) for row in rows]


def ensure_column(conn, table, column, definition):
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def normalize_phone(phone):
    value = str(phone or "").strip()
    return value or "—"


def contact_status(phone):
    return "Incompleto" if phone == "—" else "Activo"


def normalize_risk(value=""):
    value = str(value or "")
    if "Roja" in value or "ROJA" in value or "Rojo" in value:
        return "Rojo"
    if "Naranja" in value:
        return "Naranja"
    if "Amarilla" in value or "Amarillo" in value:
        return "Amarillo"
    if "Verde" in value:
        return "Verde"
    if "Vecinal" in value or "Reporte" in value:
        return "Vecinal"
    return value.strip() or "Sin clasificar"


def riesgo_desde_nivel(nivel):
    if nivel >= 7.20:
        return "Rojo", 7.20
    if nivel >= 6.00:
        return "Naranja", 6.00
    if nivel >= 5.00:
        return "Amarillo", 5.00
    return "Verde", 5.00


def risk_badge(riesgo):
    risk = normalize_risk(riesgo)
    return {
        "Rojo": "ROJO",
        "Naranja": "NARANJA",
        "Amarillo": "AMARILLA",
        "Verde": "NORMAL",
        "Vecinal": "VECINAL",
    }.get(risk, risk.upper())


def safe_filename(name):
    clean = re.sub(r"[^a-zA-Z0-9._-]+", "_", str(name or "incidente.jpg")).strip("._")
    return clean[:80] or "incidente.jpg"


def save_incident_image(payload):
    """Guarda una imagen opcional enviada como data URL/base64 desde el formulario vecinal."""
    if not isinstance(payload, dict) or not payload.get("data"):
        return "", ""

    filename = safe_filename(payload.get("name") or "incidente.jpg")
    raw_data = str(payload.get("data") or "")
    if "," in raw_data:
        raw_data = raw_data.split(",", 1)[1]

    try:
        binary = base64.b64decode(raw_data, validate=True)
    except Exception:
        raise ValueError("La imagen adjunta no tiene un formato válido.")

    if len(binary) > 3 * 1024 * 1024:
        raise ValueError("La imagen no puede superar los 3 MB.")

    ext = Path(filename).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    stored_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}{ext}"
    stored_path = UPLOAD_DIR / stored_name
    stored_path.write_bytes(binary)
    return filename, f"uploads/incidencias/{stored_name}"


def seed_contacts(conn):
    """Carga contactos realistas sin duplicar los que ya existan."""
    seed = []
    ribera_names = [
        "María González", "Carlos Benítez", "Ana Rodríguez", "Juan Núñez", "Rosa Martínez",
        "Miguel Pereira", "Lucía Fernández", "Hugo Acosta", "Elena Silva", "Ramón Duarte",
        "Claudia López", "Pedro Gómez", "Marta Villalba", "Sergio Vera", "Noelia Franco",
        "Jorge Maidana", "Teresa Amarilla", "Oscar Sosa", "Norma Cabrera", "Diego Cardozo",
    ]
    for i, name in enumerate(ribera_names, start=1):
        canal = "📱 WhatsApp" if i % 3 != 0 else "💬 SMS"
        seed.append((name, "Vecino ribereño", "Ribera Norte", f"+54 9 376 412-{8800+i:04d}", canal, "Activo"))

    other_neighbors = [
        ("Juan Pérez", "Bajo Uruguay"), ("Sofía Barrios", "Bajo Uruguay"), ("Luis Ríos", "Bajo Uruguay"),
        ("Cristina Cáceres", "Bajo Uruguay"), ("Raúl Benítez", "Bajo Uruguay"), ("Patricia Núñez", "Bajo Uruguay"),
        ("Esteban Aquino", "Costa Sur"), ("Gabriela Ferreyra", "Costa Sur"), ("Roberto Medina", "Costa Sur"),
        ("Silvia Cabral", "Costa Sur"), ("Nicolás Pereira", "Zona Alta"), ("Valeria Gauto", "Zona Alta"),
        ("Roxana Duarte", "Puente"), ("Ariel Franco", "Arroyo"),
    ]
    for i, (name, zona) in enumerate(other_neighbors, start=1):
        seed.append((name, "Vecino ribereño", zona, f"+54 9 376 489-{3300+i:04d}", "📱 WhatsApp", "Activo"))

    seed.extend([
        ("Cuerpo de Bomberos Voluntarios", "Institución", "Todo Panambí", "+54 376 422-0011", "📞 Llamada", "Activo"),
        ("Hospital Municipal", "Institución", "Todo Panambí", "+54 376 422-1100", "📞 Llamada", "Activo"),
        ("Escuela N° 602", "Institución", "Ribera Norte", "+54 376 422-2201", "💬 SMS", "Activo"),
        ("Prefectura Naval", "Institución", "Todo Panambí", "+54 376 422-3302", "📞 Llamada", "Activo"),
        ("Intendente R. Cabrera", "Autoridad", "Municipal", "+54 9 376 422-0055", "📱 WhatsApp", "Activo"),
        ("Coordinación Defensa Civil", "Autoridad", "Todo Panambí", "+54 9 376 422-0101", "📱 WhatsApp", "Activo"),
        ("Policía Comisaría 2°", "Autoridad", "Todo Panambí", "+54 376 422-0100", "📞 Llamada", "Activo"),
        ("Secretaría de Acción Social", "Autoridad", "Municipal", "+54 9 376 422-0808", "💬 SMS", "Activo"),
    ])

    for contact in seed:
        exists = conn.execute(
            "SELECT 1 FROM contactos WHERE LOWER(nombre) = LOWER(?) AND zona = ? LIMIT 1",
            (contact[0], contact[2]),
        ).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO contactos (nombre, tipo, zona, telefono, canal, estado) VALUES (?, ?, ?, ?, ?, ?)",
                contact,
            )


def destinatarios_para_zona(conn, zona):
    zona = str(zona or "").strip()
    if not zona or zona == "Seleccionar...":
        return []
    if zona == "Todo Panambí":
        rows = conn.execute(
            """
            SELECT id, nombre, tipo, zona, telefono, canal, estado
            FROM contactos
            WHERE estado = 'Activo'
            ORDER BY CASE tipo WHEN 'Vecino ribereño' THEN 0 WHEN 'Institución' THEN 1 ELSE 2 END, zona, nombre
            """
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT id, nombre, tipo, zona, telefono, canal, estado
            FROM contactos
            WHERE estado = 'Activo'
              AND (
                (tipo = 'Vecino ribereño' AND zona = ?)
                OR (tipo IN ('Institución', 'Autoridad') AND zona IN (?, 'Todo Panambí', 'Municipal', 'Centro'))
              )
            ORDER BY CASE tipo WHEN 'Vecino ribereño' THEN 0 WHEN 'Institución' THEN 1 ELSE 2 END, nombre
            """,
            (zona, zona),
        ).fetchall()
    return rows_to_dicts(rows)


def latest_sensor_views(conn):
    latest = []
    for sensor in SENSORES:
        row = conn.execute(
            """
            SELECT sensor, zona, nivel_m, tendencia_m, temperatura_c, humedad_pct, registrado_en
            FROM mediciones
            WHERE sensor = ?
            ORDER BY registrado_en DESC, id DESC
            LIMIT 1
            """,
            (sensor["sensor"],),
        ).fetchone()
        if not row:
            continue
        data = dict(row)
        risk, threshold = riesgo_desde_nivel(float(data["nivel_m"]))
        data.update({
            "riesgo": risk,
            "umbral_m": threshold,
            "lat": sensor["lat"],
            "lng": sensor["lng"],
            "estado": "Intermitente" if sensor["sensor"] == "S-03" else "Activo",
        })
        latest.append(data)
    return latest


def zonas_con_riesgo(conn):
    sensors = latest_sensor_views(conn)
    risk_by_zone = {z["nombre"]: z["riesgo_base"] for z in ZONAS_MAPA}
    priority = {"Verde": 0, "Amarillo": 1, "Naranja": 2, "Rojo": 3}
    for sensor in sensors:
        zona = sensor["zona"]
        current = risk_by_zone.get(zona, "Verde")
        if priority[sensor["riesgo"]] > priority.get(current, 0):
            risk_by_zone[zona] = sensor["riesgo"]
    zonas = []
    for zona in ZONAS_MAPA:
        zonas.append({**zona, "riesgo": risk_by_zone.get(zona["nombre"], zona["riesgo_base"])})
    return zonas


def rebuild_alertas_if_old_check(conn):
    row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='alertas'").fetchone()
    if not row or "CHECK" not in (row[0] or ""):
        return

    conn.execute("ALTER TABLE alertas RENAME TO alertas_old")
    conn.execute(
        """
        CREATE TABLE alertas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          origen TEXT NOT NULL,
          riesgo TEXT NOT NULL,
          zona TEXT NOT NULL,
          mensaje TEXT NOT NULL,
          estado TEXT NOT NULL DEFAULT 'Pendiente',
          operador TEXT,
          notificados INTEGER NOT NULL DEFAULT 0,
          observacion TEXT DEFAULT '',
          sensor TEXT DEFAULT '',
          nivel_m REAL,
          umbral_m REAL,
          porcentaje INTEGER DEFAULT 0,
          incidencia_id INTEGER,
          creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          actualizada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    old_cols = {r[1] for r in conn.execute("PRAGMA table_info(alertas_old)").fetchall()}
    def col(name, default):
        return name if name in old_cols else default
    conn.execute(
        f"""
        INSERT INTO alertas (id, origen, riesgo, zona, mensaje, estado, operador, notificados, observacion, sensor, nivel_m, umbral_m, porcentaje, incidencia_id, creada_en, actualizada_en)
        SELECT id, origen, riesgo, zona, mensaje, estado, operador, notificados,
               {col('observacion', "''")}, {col('sensor', "''")}, {col('nivel_m', 'NULL')}, {col('umbral_m', 'NULL')},
               {col('porcentaje', '0')}, {col('incidencia_id', 'NULL')}, creada_en, actualizada_en
        FROM alertas_old
        """
    )
    conn.execute("DROP TABLE alertas_old")


def init_db():
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS usuarios (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              usuario TEXT NOT NULL UNIQUE,
              password TEXT NOT NULL,
              nombre TEXT NOT NULL,
              rol TEXT NOT NULL DEFAULT 'Operador',
              activo INTEGER NOT NULL DEFAULT 1,
              creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS contactos (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nombre TEXT NOT NULL,
              tipo TEXT NOT NULL,
              zona TEXT NOT NULL,
              telefono TEXT,
              canal TEXT NOT NULL,
              estado TEXT NOT NULL DEFAULT 'Activo',
              creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS mediciones (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              sensor TEXT NOT NULL,
              zona TEXT NOT NULL,
              nivel_m REAL NOT NULL,
              tendencia_m REAL NOT NULL DEFAULT 0,
              temperatura_c REAL,
              humedad_pct REAL,
              registrado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS alertas (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              origen TEXT NOT NULL,
              riesgo TEXT NOT NULL,
              zona TEXT NOT NULL,
              mensaje TEXT NOT NULL,
              estado TEXT NOT NULL DEFAULT 'Pendiente',
              operador TEXT,
              notificados INTEGER NOT NULL DEFAULT 0,
              observacion TEXT DEFAULT '',
              sensor TEXT DEFAULT '',
              nivel_m REAL,
              umbral_m REAL,
              porcentaje INTEGER DEFAULT 0,
              incidencia_id INTEGER,
              creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              actualizada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS incidencias (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              codigo TEXT NOT NULL UNIQUE,
              tipo TEXT NOT NULL,
              descripcion TEXT NOT NULL,
              ubicacion TEXT NOT NULL,
              zona TEXT NOT NULL DEFAULT 'A determinar',
              vecino_nombre TEXT NOT NULL DEFAULT '',
              dni TEXT NOT NULL DEFAULT '',
              alerta_id INTEGER,
              imagen_nombre TEXT DEFAULT '',
              imagen_path TEXT DEFAULT '',
              estado TEXT NOT NULL DEFAULT 'En revisión',
              creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS historial (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              tipo TEXT NOT NULL,
              descripcion TEXT NOT NULL,
              detalle TEXT NOT NULL,
              nivel TEXT DEFAULT '—',
              badge TEXT NOT NULL,
              zona TEXT NOT NULL,
              riesgo TEXT NOT NULL,
              fecha TEXT NOT NULL DEFAULT (date('now')),
              creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )

        rebuild_alertas_if_old_check(conn)
        ensure_column(conn, "alertas", "observacion", "TEXT DEFAULT ''")
        ensure_column(conn, "alertas", "sensor", "TEXT DEFAULT ''")
        ensure_column(conn, "alertas", "nivel_m", "REAL")
        ensure_column(conn, "alertas", "umbral_m", "REAL")
        ensure_column(conn, "alertas", "porcentaje", "INTEGER DEFAULT 0")
        ensure_column(conn, "alertas", "incidencia_id", "INTEGER")
        ensure_column(conn, "incidencias", "zona", "TEXT NOT NULL DEFAULT 'A determinar'")
        ensure_column(conn, "incidencias", "vecino_nombre", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "incidencias", "dni", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "incidencias", "alerta_id", "INTEGER")
        ensure_column(conn, "incidencias", "imagen_nombre", "TEXT DEFAULT ''")
        ensure_column(conn, "incidencias", "imagen_path", "TEXT DEFAULT ''")

        # Usuarios base del sistema local.
        # admin/admin permite administrar altas y bajas.
        conn.execute(
            "INSERT OR IGNORE INTO usuarios (usuario, password, nombre, rol) VALUES (?, ?, ?, ?)",
            ("admin", "admin", "Administrador", "Administrador"),
        )
        conn.execute(
            "INSERT OR IGNORE INTO usuarios (usuario, password, nombre, rol) VALUES (?, ?, ?, ?)",
            ("dcivil.panambi", "admin123", "J. López", "Operador Defensa Civil"),
        )

        seed_contacts(conn)

        if conn.execute("SELECT COUNT(*) FROM mediciones").fetchone()[0] == 0:
            for item in SENSORES:
                base = item["base"] + random.uniform(-0.15, 0.15)
                risk, threshold = riesgo_desde_nivel(base)
                conn.execute(
                    "INSERT INTO mediciones (sensor, zona, nivel_m, tendencia_m, temperatura_c, humedad_pct) VALUES (?, ?, ?, ?, ?, ?)",
                    (item["sensor"], item["zona"], round(base, 2), round(random.uniform(-0.05, 0.18), 2), 24.5, 88),
                )

        if conn.execute("SELECT COUNT(*) FROM alertas").fetchone()[0] == 0:
            seed_alerts = [
                ("Automática", "Rojo", "Ribera Norte", "Nivel crítico detectado por sensor S-01.", "Pendiente", None, 0, "S-01", 7.84, 7.20, 82),
                ("Automática", "Naranja", "Bajo Uruguay", "Umbral naranja superado por sensor S-02.", "Pendiente", None, 0, "S-02", 6.21, 6.00, 72),
            ]
            conn.executemany(
                """
                INSERT INTO alertas (origen, riesgo, zona, mensaje, estado, operador, notificados, sensor, nivel_m, umbral_m, porcentaje)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                seed_alerts,
            )

        if conn.execute("SELECT COUNT(*) FROM historial").fetchone()[0] == 0:
            history = [
                ("Alerta automática", "Nivel crítico detectado — S-01 Ribera Norte", "Generada automáticamente · Pendiente de validación", "7.84 m", "ROJO", "Ribera Norte", "Rojo", "+0 day"),
                ("Alerta manual", "Aviso preventivo emitido a Ribera Norte", "Operador: J. López · 28 notificados", "—", "EMITIDA", "Ribera Norte", "Rojo", "+0 day"),
                ("Incidencia", "Reporte vecinal: agua en calles — Ribera Norte", "Vecino: M. González · Estado: En revisión", "—", "REVISIÓN", "Ribera Norte", "Naranja", "+0 day"),
                ("Medición", "Registro periódico — S-01 Ribera Norte", "Automático · Frecuencia 5 min", "6.80 m", "NORMAL", "Ribera Norte", "Verde", "+0 day"),
            ]
            conn.executemany(
                """
                INSERT INTO historial (tipo, descripcion, detalle, nivel, badge, zona, riesgo, fecha)
                VALUES (?, ?, ?, ?, ?, ?, ?, date('now', ?))
                """,
                history,
            )


def insert_history(conn, tipo, descripcion, detalle, nivel="—", badge="REGISTRO", zona="Todo Panambí", riesgo="Verde"):
    conn.execute(
        """
        INSERT INTO historial (tipo, descripcion, detalle, nivel, badge, zona, riesgo, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))
        """,
        (tipo, descripcion, detalle, nivel, badge, zona, riesgo),
    )


def alert_view(row):
    if not row:
        return None
    alert = dict(row)
    risk = normalize_risk(alert.get("riesgo"))
    origin = alert.get("origen", "")
    if origin == "Vecinal":
        risk = "Vecinal"

    sensor = alert.get("sensor") or "—"
    nivel = alert.get("nivel_m")
    umbral = alert.get("umbral_m")
    porcentaje = alert.get("porcentaje")

    incidencia = None
    if alert.get("inc_codigo") or alert.get("incidencia_id"):
        incidencia = {
            "id": alert.get("incidencia_id"),
            "codigo": alert.get("inc_codigo") or "—",
            "tipo": alert.get("inc_tipo") or "—",
            "descripcion": alert.get("inc_descripcion") or "—",
            "ubicacion": alert.get("inc_ubicacion") or "—",
            "zona": alert.get("inc_zona") or alert.get("zona") or "—",
            "vecino_nombre": alert.get("inc_vecino_nombre") or "—",
            "dni": alert.get("inc_dni") or "—",
            "imagen_nombre": alert.get("inc_imagen_nombre") or "",
            "imagen_path": alert.get("inc_imagen_path") or "",
            "estado": alert.get("inc_estado") or "En revisión",
            "creada_en": alert.get("inc_creada_en") or alert.get("creada_en"),
        }

    if nivel is None:
        defaults = {"Rojo": (7.84, 7.20, 82), "Naranja": (6.21, 6.00, 72), "Amarillo": (5.30, 5.00, 58), "Verde": (2.35, 5.00, 24)}
        if origin == "Vecinal":
            nivel, umbral, porcentaje = None, None, 0
        else:
            nivel, umbral, porcentaje = defaults.get(risk, (0.0, 0.0, 0))

    estado = alert.get("estado", "Pendiente")
    badge = "PENDIENTE" if estado == "Pendiente" else estado.upper()
    if estado == "Emitida":
        badge = "EMITIDA"
    if estado == "Validada":
        badge = "VALIDADA"
    if origin == "Vecinal" and estado == "Pendiente":
        badge = "REPORTE VECINAL"

    nivel_display = "—" if nivel is None else f"{float(nivel):.2f} m"
    umbral_display = "—" if umbral is None else f"{float(umbral):.2f} m"

    detalle = f"Sensor {sensor} · {alert.get('mensaje', '')}"
    titulo = f"Alerta {risk} {origin} — {alert.get('zona', '')}".strip()
    if origin == "Vecinal":
        inc_tipo = incidencia.get("tipo") if incidencia else "Reporte vecinal"
        inc_vecino = incidencia.get("vecino_nombre") if incidencia else "—"
        inc_dni = incidencia.get("dni") if incidencia else "—"
        inc_ubicacion = incidencia.get("ubicacion") if incidencia else "—"
        detalle = f"Reporte vecinal · {inc_tipo} · Vecino: {inc_vecino} · DNI {inc_dni} · Ubicación: {inc_ubicacion}"
        titulo = f"Reporte vecinal pendiente — {alert.get('zona', '')}"
    if origin == "Manual":
        detalle = f"Alerta emitida por operador · {alert.get('mensaje', '')}"
        titulo = f"Alerta manual — {alert.get('zona', '')}"

    alert.update({
        "codigo": f"ALT-{alert['id']:04d}",
        "riesgo": risk,
        "sensor": sensor,
        "nivel": nivel,
        "nivelDisplay": nivel_display,
        "umbral": umbral,
        "umbralDisplay": umbral_display,
        "porcentaje": int(porcentaje or 0),
        "badge": badge,
        "titulo": titulo,
        "detalle": detalle,
        "incidencia": incidencia,
        "colorKey": "lila" if origin == "Vecinal" else risk.lower(),
    })
    return alert

def simulate_sensor_readings(conn):
    last = conn.execute("SELECT MAX(registrado_en) AS last_time FROM mediciones").fetchone()[0]
    if last:
        try:
            elapsed = (datetime.now() - datetime.fromisoformat(str(last).replace(" ", "T"))).total_seconds()
            if elapsed < 8:
                return
        except ValueError:
            pass

    seed = datetime.now().timestamp()
    for idx, item in enumerate(SENSORES):
        previous = conn.execute(
            "SELECT nivel_m FROM mediciones WHERE sensor = ? ORDER BY registrado_en DESC, id DESC LIMIT 1",
            (item["sensor"],),
        ).fetchone()
        prev_level = float(previous[0]) if previous else item["base"]
        wave = math.sin(seed / 30 + idx) * 0.09
        delta = random.uniform(-0.14, 0.18) + wave
        level = max(1.20, min(8.50, prev_level + delta))
        trend = level - prev_level
        risk, threshold = riesgo_desde_nivel(level)
        percent = max(0, min(100, int((level / 8.5) * 100)))

        conn.execute(
            """
            INSERT INTO mediciones (sensor, zona, nivel_m, tendencia_m, temperatura_c, humedad_pct)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (item["sensor"], item["zona"], round(level, 2), round(trend, 2), round(23 + random.random() * 4, 1), random.randint(70, 96)),
        )
        insert_history(
            conn,
            "Medición",
            f"Registro automático — {item['sensor']} {item['zona']}",
            "Lectura simulada del sensor local",
            nivel=f"{level:.2f} m",
            badge=risk_badge(risk),
            zona=item["zona"],
            riesgo=risk,
        )

        already_pending = conn.execute(
            "SELECT COUNT(*) FROM alertas WHERE origen = 'Automática' AND sensor = ? AND estado = 'Pendiente'",
            (item["sensor"],),
        ).fetchone()[0]
        if risk != "Verde" and already_pending == 0:
            conn.execute(
                """
                INSERT INTO alertas (origen, riesgo, zona, mensaje, estado, sensor, nivel_m, umbral_m, porcentaje)
                VALUES ('Automática', ?, ?, ?, 'Pendiente', ?, ?, ?, ?)
                """,
                (
                    risk,
                    item["zona"],
                    f"{risk}: nivel de río {level:.2f} m detectado por sensor {item['sensor']}.",
                    item["sensor"],
                    round(level, 2),
                    threshold,
                    percent,
                ),
            )
            insert_history(
                conn,
                "Alerta automática",
                f"{risk}: umbral superado — {item['sensor']} {item['zona']}",
                "Generada automáticamente · Pendiente de validación",
                nivel=f"{level:.2f} m",
                badge=risk_badge(risk),
                zona=item["zona"],
                riesgo=risk,
            )


class AppHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))

    def send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def parse_query(self):
        return {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}

    def serve_file(self):
        parsed = urlparse(self.path)
        clean_path = parsed.path.strip("/") or "index.html"
        parts = Path(clean_path).parts

        # Los adjuntos pueden vivir fuera del repositorio si el hosting monta
        # un disco persistente y SAT_UPLOAD_DIR apunta a ese directorio.
        if len(parts) >= 3 and parts[0] == "uploads" and parts[1] == "incidencias":
            relative_upload = Path(*parts[2:])
            file_path = (UPLOAD_DIR / relative_upload).resolve()
            allowed_root = UPLOAD_DIR
            allowed_static = True
        else:
            file_path = (ROOT_DIR / clean_path).resolve()
            allowed_root = ROOT_DIR
            allowed_static = clean_path == "index.html" or (parts and parts[0] in {"css", "js"})

        # El servidor público solo expone el frontend y los adjuntos. Evita que
        # README, render.yaml, .git u otros archivos internos queden descargables.
        if (
            not allowed_static
            or not str(file_path).startswith(str(allowed_root))
            or any(part.startswith(".") for part in parts)
        ):
            self.send_error(404)
            return

        if file_path.is_dir():
            file_path = file_path / "index.html"

        if not file_path.exists():
            self.send_error(404)
            return

        content_type, _ = mimetypes.guess_type(str(file_path))
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.end_headers()
        with open(file_path, "rb") as f:
            self.wfile.write(f.read())

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/health":
                return self.send_json({"ok": True, "app": "SAT Inundaciones", "database": "SQLite"})

            if path == "/api/dashboard":
                with get_conn() as conn:
                    simulate_sensor_readings(conn)
                    latest = conn.execute(
                        """
                        SELECT sensor, zona, nivel_m AS nivel, tendencia_m AS tendencia,
                               temperatura_c AS temperatura, humedad_pct AS humedad, registrado_en
                        FROM mediciones
                        ORDER BY registrado_en DESC, id DESC
                        LIMIT 1
                        """
                    ).fetchone()
                    pending = conn.execute("SELECT COUNT(*) FROM alertas WHERE estado = 'Pendiente'").fetchone()[0]
                    active_contacts = conn.execute("SELECT COUNT(*) FROM contactos WHERE estado = 'Activo'").fetchone()[0]
                    incidents_review = conn.execute("SELECT COUNT(*) FROM incidencias WHERE estado = 'En revisión'").fetchone()[0]
                    sensores = latest_sensor_views(conn)
                    zonas = zonas_con_riesgo(conn)
                    recent_alerts = [alert_view(row) for row in conn.execute(
                        """
                        SELECT a.*,
                               i.codigo AS inc_codigo, i.tipo AS inc_tipo, i.descripcion AS inc_descripcion,
                               i.ubicacion AS inc_ubicacion, i.zona AS inc_zona,
                               i.vecino_nombre AS inc_vecino_nombre, i.dni AS inc_dni,
                               i.imagen_nombre AS inc_imagen_nombre, i.imagen_path AS inc_imagen_path,
                               i.estado AS inc_estado, i.creada_en AS inc_creada_en
                        FROM alertas a
                        LEFT JOIN incidencias i ON i.id = a.incidencia_id
                        ORDER BY CASE WHEN a.estado = 'Pendiente' THEN 0 ELSE 1 END, a.actualizada_en DESC, a.id DESC
                        LIMIT 10
                        """
                    ).fetchall()]
                return self.send_json({
                    "ok": True,
                    "latest": dict(latest) if latest else None,
                    "pendingAlerts": pending,
                    "activeContacts": active_contacts,
                    "incidentsReview": incidents_review,
                    "recentAlerts": recent_alerts,
                    "sensores": sensores,
                    "zonas": zonas,
                })

            if path == "/api/alertas":
                query = self.parse_query()
                estado = query.get("estado")
                clauses = []
                params = []
                if estado:
                    clauses.append("a.estado = ?")
                    params.append(estado)
                where = "WHERE " + " AND ".join(clauses) if clauses else ""
                with get_conn() as conn:
                    simulate_sensor_readings(conn)
                    alertas = [alert_view(row) for row in conn.execute(
                        f"""
                        SELECT a.*,
                               i.codigo AS inc_codigo, i.tipo AS inc_tipo, i.descripcion AS inc_descripcion,
                               i.ubicacion AS inc_ubicacion, i.zona AS inc_zona,
                               i.vecino_nombre AS inc_vecino_nombre, i.dni AS inc_dni,
                               i.imagen_nombre AS inc_imagen_nombre, i.imagen_path AS inc_imagen_path,
                               i.estado AS inc_estado, i.creada_en AS inc_creada_en
                        FROM alertas a
                        LEFT JOIN incidencias i ON i.id = a.incidencia_id
                        {where}
                        ORDER BY a.creada_en ASC, a.id ASC
                        LIMIT 100
                        """,
                        params,
                    ).fetchall()]
                    pending = conn.execute("SELECT COUNT(*) FROM alertas WHERE estado = 'Pendiente'").fetchone()[0]
                return self.send_json({"ok": True, "alertas": alertas, "pendingAlerts": pending})

            if path == "/api/usuarios":
                with get_conn() as conn:
                    usuarios = rows_to_dicts(conn.execute(
                        """
                        SELECT id, usuario, nombre, rol, activo, creado_en
                        FROM usuarios
                        WHERE activo = 1
                        ORDER BY CASE WHEN usuario = 'admin' THEN 0 ELSE 1 END, nombre ASC
                        """
                    ).fetchall())
                return self.send_json({"ok": True, "usuarios": usuarios})

            if path == "/api/contactos/destinatarios":
                query = self.parse_query()
                zona = query.get("zona", "Ribera Norte")
                with get_conn() as conn:
                    contactos = destinatarios_para_zona(conn, zona)
                    resumen = {
                        "Vecino ribereño": sum(1 for c in contactos if c["tipo"] == "Vecino ribereño"),
                        "Institución": sum(1 for c in contactos if c["tipo"] == "Institución"),
                        "Autoridad": sum(1 for c in contactos if c["tipo"] == "Autoridad"),
                    }
                return self.send_json({"ok": True, "zona": zona, "contactos": contactos, "resumen": resumen, "total": len(contactos)})

            if path == "/api/contactos":
                query = self.parse_query()
                search = query.get("search", "")
                tipo = query.get("tipo", "Todos los tipos")
                zona = query.get("zona", "Todas las zonas")
                clauses = []
                params = []
                if search:
                    clauses.append("(LOWER(nombre) LIKE ? OR telefono LIKE ?)")
                    params.extend([f"%{search.lower()}%", f"%{search}%"])
                if tipo and tipo != "Todos los tipos":
                    clauses.append("tipo = ?")
                    params.append(tipo)
                if zona and zona != "Todas las zonas":
                    clauses.append("zona = ?")
                    params.append(zona)
                where = "WHERE " + " AND ".join(clauses) if clauses else ""

                with get_conn() as conn:
                    contactos = rows_to_dicts(conn.execute(
                        f"SELECT id, nombre, tipo, zona, telefono, canal, estado FROM contactos {where} ORDER BY nombre ASC",
                        params,
                    ).fetchall())
                    stats = dict(conn.execute(
                        """
                        SELECT
                          COUNT(*) AS total,
                          SUM(CASE WHEN estado = 'Activo' THEN 1 ELSE 0 END) AS activos,
                          SUM(CASE WHEN tipo = 'Institución' THEN 1 ELSE 0 END) AS instituciones,
                          SUM(CASE WHEN estado = 'Incompleto' THEN 1 ELSE 0 END) AS incompletos
                        FROM contactos
                        """
                    ).fetchone())
                return self.send_json({"ok": True, "contactos": contactos, "stats": stats})

            if path == "/api/historial":
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
                if tipo and tipo != "Todos":
                    clauses.append("tipo = ?")
                    params.append(tipo)
                if desde:
                    clauses.append("fecha >= ?")
                    params.append(desde)
                if hasta:
                    clauses.append("fecha <= ?")
                    params.append(hasta)
                where = "WHERE " + " AND ".join(clauses) if clauses else ""
                with get_conn() as conn:
                    eventos = rows_to_dicts(conn.execute(
                        f"""
                        SELECT id, tipo, descripcion AS desc, detalle AS detail, nivel, badge, zona, riesgo, fecha, creado_en
                        FROM historial
                        {where}
                        ORDER BY creado_en DESC, id DESC
                        LIMIT 100
                        """,
                        params,
                    ).fetchall())
                    stats = dict(conn.execute(
                        """
                        SELECT
                          SUM(CASE WHEN tipo = 'Medición' THEN 1 ELSE 0 END) AS mediciones,
                          SUM(CASE WHEN tipo = 'Alerta automática' THEN 1 ELSE 0 END) AS automaticas,
                          SUM(CASE WHEN tipo = 'Alerta manual' THEN 1 ELSE 0 END) AS manuales,
                          SUM(CASE WHEN tipo = 'Incidencia' THEN 1 ELSE 0 END) AS incidencias
                        FROM historial
                        """
                    ).fetchone())
                return self.send_json({"ok": True, "eventos": eventos, "stats": stats})

            if path.startswith("/api/"):
                return self.send_json({"ok": False, "error": "Ruta API no encontrada."}, 404)

            return self.serve_file()
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            data = self.read_json()

            if path == "/api/auth/login":
                usuario = data.get("usuario")
                password = data.get("password")
                if not usuario or not password:
                    return self.send_json({"ok": False, "error": "Debe ingresar usuario y contraseña."}, 400)
                with get_conn() as conn:
                    user = conn.execute(
                        "SELECT id, usuario, nombre, rol FROM usuarios WHERE usuario = ? AND password = ? AND activo = 1",
                        (usuario, password),
                    ).fetchone()
                if not user:
                    return self.send_json({"ok": False, "error": "Usuario o contraseña incorrectos."}, 401)
                return self.send_json({"ok": True, "user": dict(user)})

            if path == "/api/usuarios":
                nombre = str(data.get("nombre", "")).strip()
                usuario = str(data.get("usuario", "")).strip().lower()
                password = str(data.get("password", ""))
                rol = str(data.get("rol", "Operador Defensa Civil")).strip()
                roles_validos = {"Operador Defensa Civil", "Operador Municipalidad", "Administrador"}
                if not nombre or not usuario or not password or not rol:
                    return self.send_json({"ok": False, "error": "Nombre, usuario, contraseña y rol son obligatorios."}, 400)
                if len(password) < 4:
                    return self.send_json({"ok": False, "error": "La contraseña debe tener al menos 4 caracteres."}, 400)
                if rol not in roles_validos:
                    return self.send_json({"ok": False, "error": "Rol inválido."}, 400)
                with get_conn() as conn:
                    try:
                        cur = conn.execute(
                            "INSERT INTO usuarios (usuario, password, nombre, rol) VALUES (?, ?, ?, ?)",
                            (usuario, password, nombre, rol),
                        )
                    except sqlite3.IntegrityError:
                        return self.send_json({"ok": False, "error": "Ya existe un usuario con ese nombre de usuario."}, 409)
                    nuevo = dict(conn.execute(
                        "SELECT id, usuario, nombre, rol, activo, creado_en FROM usuarios WHERE id = ?",
                        (cur.lastrowid,),
                    ).fetchone())
                    insert_history(conn, "Usuario", f"Usuario agregado — {nombre}", f"{usuario} · {rol}", badge="ALTA", zona="Sistema", riesgo="Verde")
                return self.send_json({"ok": True, "usuario": nuevo}, 201)

            if path == "/api/contactos":
                nombre = str(data.get("nombre", "")).strip()
                tipo = data.get("tipo")
                zona = data.get("zona")
                telefono = normalize_phone(data.get("telefono"))
                estado = contact_status(telefono)
                canal = "Sin número" if estado == "Incompleto" else data.get("canal", "📱 WhatsApp")
                if not nombre or not tipo or not zona:
                    return self.send_json({"ok": False, "error": "Nombre, tipo y zona son obligatorios."}, 400)
                with get_conn() as conn:
                    cur = conn.execute(
                        "INSERT INTO contactos (nombre, tipo, zona, telefono, canal, estado) VALUES (?, ?, ?, ?, ?, ?)",
                        (nombre, tipo, zona, telefono, canal, estado),
                    )
                    contacto = dict(conn.execute(
                        "SELECT id, nombre, tipo, zona, telefono, canal, estado FROM contactos WHERE id = ?",
                        (cur.lastrowid,),
                    ).fetchone())
                    insert_history(conn, "Contacto", f"Contacto agregado — {nombre}", f"{tipo} · {telefono}", badge="ALTA", zona=zona, riesgo="Verde")
                return self.send_json({"ok": True, "contacto": contacto}, 201)

            if path == "/api/incidencias":
                tipo = str(data.get("tipo", "")).strip()
                descripcion = str(data.get("descripcion", "")).strip()
                ubicacion = str(data.get("ubicacion", "")).strip()
                zona = str(data.get("zona", "")).strip() or "A determinar"
                vecino_nombre = str(data.get("nombre", "")).strip()
                dni = ''.join(ch for ch in str(data.get("dni", "")).strip() if ch.isdigit())
                if not tipo or not descripcion or not ubicacion or not vecino_nombre or not dni:
                    return self.send_json({"ok": False, "error": "Nombre, DNI, tipo, descripción y ubicación son obligatorios."}, 400)
                if len(dni) < 7 or len(dni) > 8:
                    return self.send_json({"ok": False, "error": "El DNI debe tener 7 u 8 números."}, 400)
                try:
                    imagen_nombre, imagen_path = save_incident_image(data.get("imagen"))
                except ValueError as exc:
                    return self.send_json({"ok": False, "error": str(exc)}, 400)
                year = datetime.now().year
                with get_conn() as conn:
                    next_n = conn.execute(
                        "SELECT COUNT(*) + 1 FROM incidencias WHERE strftime('%Y', creada_en) = ?",
                        (str(year),),
                    ).fetchone()[0]
                    codigo = f"INC-{year}-{next_n:04d}"
                    cur_inc = conn.execute(
                        """
                        INSERT INTO incidencias (codigo, tipo, descripcion, ubicacion, zona, vecino_nombre, dni, imagen_nombre, imagen_path)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (codigo, tipo, descripcion, ubicacion, zona, vecino_nombre, dni, imagen_nombre, imagen_path),
                    )
                    adjunto = f" Foto adjunta: {imagen_nombre}." if imagen_nombre else ""
                    mensaje = f"Reporte {codigo}: {tipo}. {descripcion}. Ubicación: {ubicacion}. Vecino: {vecino_nombre} - DNI {dni}.{adjunto}"
                    cur_alert = conn.execute(
                        """
                        INSERT INTO alertas (origen, riesgo, zona, mensaje, estado, sensor, nivel_m, umbral_m, porcentaje, incidencia_id)
                        VALUES ('Vecinal', 'Vecinal', ?, ?, 'Pendiente', 'Reporte vecinal', NULL, NULL, 0, ?)
                        """,
                        (zona, mensaje, cur_inc.lastrowid),
                    )
                    conn.execute("UPDATE incidencias SET alerta_id = ? WHERE id = ?", (cur_alert.lastrowid, cur_inc.lastrowid))
                    insert_history(
                        conn,
                        "Incidencia",
                        f"Reporte vecinal recibido — {tipo}",
                        f"{vecino_nombre} · DNI {dni} · {ubicacion} · Código {codigo} · {'con foto adjunta · ' if imagen_nombre else ''}Pendiente de validación",
                        badge="VECINAL",
                        zona=zona,
                        riesgo="Vecinal",
                    )
                return self.send_json({"ok": True, "codigo": codigo, "alertaId": cur_alert.lastrowid, "imagen": imagen_path}, 201)

            if path == "/api/alertas/manuales":
                riesgo = data.get("riesgo")
                zona = data.get("zona")
                mensaje = str(data.get("mensaje", "")).strip()
                operador = data.get("operador", "J. López")
                destinatarios_ids = data.get("destinatarios_ids") or []
                if not riesgo or not zona or not mensaje:
                    return self.send_json({"ok": False, "error": "Riesgo, zona y mensaje son obligatorios."}, 400)
                clean_risk = normalize_risk(riesgo)
                with get_conn() as conn:
                    if destinatarios_ids:
                        placeholders = ",".join("?" for _ in destinatarios_ids)
                        notificados = conn.execute(
                            f"SELECT COUNT(*) FROM contactos WHERE estado = 'Activo' AND id IN ({placeholders})",
                            destinatarios_ids,
                        ).fetchone()[0]
                    else:
                        notificados = len(destinatarios_para_zona(conn, zona))
                    if notificados <= 0:
                        return self.send_json({"ok": False, "error": "No hay destinatarios activos para esa zona."}, 400)
                    cur = conn.execute(
                        """
                        INSERT INTO alertas (origen, riesgo, zona, mensaje, estado, operador, notificados, sensor)
                        VALUES ('Manual', ?, ?, ?, 'Emitida', ?, ?, 'Manual')
                        """,
                        (clean_risk, zona, mensaje, operador, notificados),
                    )
                    insert_history(
                        conn,
                        "Alerta manual",
                        f"Alerta manual emitida — {zona}",
                        f"Operador: {operador} · {notificados} contactos notificados",
                        badge="EMITIDA",
                        zona=zona,
                        riesgo=clean_risk,
                    )
                return self.send_json({"ok": True, "id": cur.lastrowid, "notificados": notificados}, 201)

            if path == "/api/alertas/accion":
                accion = data.get("accion")
                operador = data.get("operador", "J. López")
                observacion = str(data.get("observacion", "")).strip()
                alert_id = data.get("alertaId")

                if accion not in ["Validada", "Rechazada"]:
                    return self.send_json({"ok": False, "error": "Acción inválida."}, 400)

                with get_conn() as conn:
                    if alert_id:
                        pending = conn.execute("""
                            SELECT a.*,
                                   i.codigo AS inc_codigo, i.tipo AS inc_tipo, i.descripcion AS inc_descripcion,
                                   i.ubicacion AS inc_ubicacion, i.zona AS inc_zona,
                                   i.vecino_nombre AS inc_vecino_nombre, i.dni AS inc_dni,
                                   i.imagen_nombre AS inc_imagen_nombre, i.imagen_path AS inc_imagen_path,
                                   i.estado AS inc_estado, i.creada_en AS inc_creada_en
                            FROM alertas a
                            LEFT JOIN incidencias i ON i.id = a.incidencia_id
                            WHERE a.id = ? AND a.estado = 'Pendiente'
                        """, (alert_id,)).fetchone()
                    else:
                        pending = conn.execute("""
                            SELECT a.*,
                                   i.codigo AS inc_codigo, i.tipo AS inc_tipo, i.descripcion AS inc_descripcion,
                                   i.ubicacion AS inc_ubicacion, i.zona AS inc_zona,
                                   i.vecino_nombre AS inc_vecino_nombre, i.dni AS inc_dni,
                                   i.imagen_nombre AS inc_imagen_nombre, i.imagen_path AS inc_imagen_path,
                                   i.estado AS inc_estado, i.creada_en AS inc_creada_en
                            FROM alertas a
                            LEFT JOIN incidencias i ON i.id = a.incidencia_id
                            WHERE a.estado = 'Pendiente'
                            ORDER BY a.creada_en ASC, a.id ASC
                            LIMIT 1
                        """).fetchone()

                    if not pending:
                        pending_count = conn.execute("SELECT COUNT(*) FROM alertas WHERE estado = 'Pendiente'").fetchone()[0]
                        return self.send_json({"ok": True, "pendingAlerts": pending_count, "message": "La alerta ya no está pendiente."})

                    pending = dict(pending)
                    notificados = len(destinatarios_para_zona(conn, pending["zona"])) if accion == "Validada" else 0
                    conn.execute(
                        """
                        UPDATE alertas
                        SET estado = ?, operador = ?, notificados = ?, observacion = ?, actualizada_en = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (accion, operador, notificados, observacion, pending["id"]),
                    )
                    if pending.get("incidencia_id"):
                        nuevo_estado = "Validada" if accion == "Validada" else "Rechazada"
                        conn.execute("UPDATE incidencias SET estado = ? WHERE id = ?", (nuevo_estado, pending["incidencia_id"]))

                    detalle = f"{accion} por {operador}"
                    if notificados:
                        detalle += f" · {notificados} contactos notificados"
                    if observacion:
                        detalle += f" · Obs.: {observacion}"

                    view = alert_view(pending)
                    tipo_hist = "Incidencia" if pending.get("origen") == "Vecinal" else "Alerta automática"
                    insert_history(
                        conn,
                        tipo_hist,
                        f"{pending['origen']}: {pending['mensaje']} — {pending['zona']}",
                        detalle,
                        nivel=view["nivelDisplay"],
                        badge="RECHAZADA" if accion == "Rechazada" else "VALIDADA",
                        zona=pending["zona"],
                        riesgo=pending["riesgo"],
                    )
                    pending_count = conn.execute("SELECT COUNT(*) FROM alertas WHERE estado = 'Pendiente'").fetchone()[0]
                    next_pending = conn.execute(
                        """
                        SELECT a.*,
                               i.codigo AS inc_codigo, i.tipo AS inc_tipo, i.descripcion AS inc_descripcion,
                               i.ubicacion AS inc_ubicacion, i.zona AS inc_zona,
                               i.vecino_nombre AS inc_vecino_nombre, i.dni AS inc_dni,
                               i.imagen_nombre AS inc_imagen_nombre, i.imagen_path AS inc_imagen_path,
                               i.estado AS inc_estado, i.creada_en AS inc_creada_en
                        FROM alertas a
                        LEFT JOIN incidencias i ON i.id = a.incidencia_id
                        WHERE a.estado = 'Pendiente'
                        ORDER BY a.creada_en ASC, a.id ASC
                        LIMIT 1
                        """
                    ).fetchone()

                return self.send_json({
                    "ok": True,
                    "pendingAlerts": pending_count,
                    "nextAlert": alert_view(next_pending) if next_pending else None,
                })

            return self.send_json({"ok": False, "error": "Ruta API no encontrada."}, 404)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path.startswith("/api/contactos/"):
                contact_id = int(path.split("/")[-1])
                data = self.read_json()
                with get_conn() as conn:
                    current = conn.execute("SELECT * FROM contactos WHERE id = ?", (contact_id,)).fetchone()
                    if not current:
                        return self.send_json({"ok": False, "error": "Contacto no encontrado."}, 404)
                    current = dict(current)
                    nombre = str(data.get("nombre", current["nombre"])).strip()
                    tipo = data.get("tipo", current["tipo"])
                    zona = data.get("zona", current["zona"])
                    telefono = normalize_phone(data.get("telefono", current["telefono"]))
                    estado = contact_status(telefono)
                    canal = "Sin número" if estado == "Incompleto" else data.get("canal", current["canal"])
                    conn.execute(
                        """
                        UPDATE contactos
                        SET nombre = ?, tipo = ?, zona = ?, telefono = ?, canal = ?, estado = ?, actualizado_en = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (nombre, tipo, zona, telefono, canal, estado, contact_id),
                    )
                    contacto = dict(conn.execute(
                        "SELECT id, nombre, tipo, zona, telefono, canal, estado FROM contactos WHERE id = ?",
                        (contact_id,),
                    ).fetchone())
                return self.send_json({"ok": True, "contacto": contacto})
            return self.send_json({"ok": False, "error": "Ruta API no encontrada."}, 404)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path.startswith("/api/contactos/"):
                contact_id = int(path.split("/")[-1])
                with get_conn() as conn:
                    current = conn.execute("SELECT * FROM contactos WHERE id = ?", (contact_id,)).fetchone()
                    if not current:
                        return self.send_json({"ok": False, "error": "Contacto no encontrado."}, 404)
                    current = dict(current)
                    conn.execute("DELETE FROM contactos WHERE id = ?", (contact_id,))
                    insert_history(
                        conn,
                        "Contacto",
                        f"Contacto eliminado — {current['nombre']}",
                        f"{current['tipo']} · {current['zona']}",
                        badge="BAJA",
                        zona=current["zona"],
                        riesgo="Verde",
                    )
                return self.send_json({"ok": True})
            if path.startswith("/api/usuarios/"):
                user_id = int(path.split("/")[-1])
                with get_conn() as conn:
                    current = conn.execute("SELECT * FROM usuarios WHERE id = ? AND activo = 1", (user_id,)).fetchone()
                    if not current:
                        return self.send_json({"ok": False, "error": "Usuario no encontrado."}, 404)
                    current = dict(current)
                    if current["usuario"] == "admin":
                        return self.send_json({"ok": False, "error": "El usuario admin no se puede eliminar."}, 400)
                    if current["rol"] == "Administrador":
                        admins = conn.execute("SELECT COUNT(*) FROM usuarios WHERE rol = 'Administrador' AND activo = 1").fetchone()[0]
                        if admins <= 1:
                            return self.send_json({"ok": False, "error": "Debe quedar al menos un administrador activo."}, 400)
                    conn.execute("DELETE FROM usuarios WHERE id = ?", (user_id,))
                    insert_history(
                        conn,
                        "Usuario",
                        f"Usuario eliminado — {current['nombre']}",
                        f"{current['usuario']} · {current['rol']}",
                        badge="BAJA",
                        zona="Sistema",
                        riesgo="Verde",
                    )
                return self.send_json({"ok": True})

            return self.send_json({"ok": False, "error": "Ruta API no encontrada."}, 404)
        except Exception as exc:
            return self.send_json({"ok": False, "error": str(exc)}, 500)


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer(("", PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{PORT}")
    print(f"Base de datos local: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        server.server_close()
