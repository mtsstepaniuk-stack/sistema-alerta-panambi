"""Capa final de operación del SAT Panambí.

Agrega cierre controlado de alertas manuales ya emitidas sin eliminarlas:
- una alerta Emitida puede pasar a Finalizada;
- desaparece del mapa porque deja de estar activa;
- la finalización queda registrada en Historial y Auditoría;
- mantiene intactas las capas RNF1/RNF2 y los RF existentes.
"""

from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

import server_rnf2 as previous

base = previous.base

OPERATIVE_ROLES = {
    "Administrador",
    "Operador Defensa Civil",
    "Operador Municipalidad",
}


def _link_manual_history(conn, alert_id, zone, created_at=None):
    """Relaciona una alerta manual con su evento de emisión en historial."""
    already = conn.execute(
        "SELECT 1 FROM historial WHERE alerta_id = ? LIMIT 1",
        (int(alert_id),),
    ).fetchone()
    if already:
        return

    if created_at:
        row = conn.execute(
            """
            SELECT id
            FROM historial
            WHERE tipo = 'Alerta manual'
              AND badge = 'EMITIDA'
              AND zona = ?
              AND alerta_id IS NULL
            ORDER BY ABS(
                COALESCE(strftime('%s', creado_en), 0) -
                COALESCE(strftime('%s', ?), 0)
            ) ASC, id DESC
            LIMIT 1
            """,
            (zone, created_at),
        ).fetchone()
    else:
        row = conn.execute(
            """
            SELECT id
            FROM historial
            WHERE tipo = 'Alerta manual'
              AND badge = 'EMITIDA'
              AND zona = ?
              AND alerta_id IS NULL
            ORDER BY id DESC
            LIMIT 1
            """,
            (zone,),
        ).fetchone()

    if row:
        conn.execute(
            "UPDATE historial SET alerta_id = ? WHERE id = ?",
            (int(alert_id), int(row["id"])),
        )


def _backfill_manual_history_links(conn):
    rows = conn.execute(
        """
        SELECT id, zona, creada_en
        FROM alertas
        WHERE origen = 'Manual'
        ORDER BY id
        """
    ).fetchall()
    for row in rows:
        _link_manual_history(conn, row["id"], row["zona"], row["creada_en"])


def init_db():
    previous.init_db()
    with base.get_conn() as conn:
        base.ensure_column(conn, "historial", "alerta_id", "INTEGER")
        _backfill_manual_history_links(conn)


def _active_manual_alerts():
    with base.get_conn() as conn:
        rows = base.rows_to_dicts(
            conn.execute(
                """
                SELECT id, riesgo, zona, mensaje, estado, operador,
                       notificados, creada_en, actualizada_en
                FROM alertas
                WHERE origen = 'Manual' AND estado = 'Emitida'
                ORDER BY creada_en DESC, id DESC
                """
            ).fetchall()
        )

    for row in rows:
        row["codigo"] = f"ALT-{int(row['id']):04d}"
    return rows


def _record_finalization_audit(conn, alert, user, operator, observation):
    """Registra auditoría cuando la tabla de auditoría está disponible."""
    try:
        conn.execute(
            """
            INSERT INTO auditoria_alertas
              (alerta_id, accion, usuario_id, usuario, rol,
               estado_anterior, estado_nuevo, observacion)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(alert["id"]),
                "Finalizar alerta manual",
                user.get("id"),
                operator,
                user.get("rol") or "Sistema",
                "Emitida",
                "Finalizada",
                observation,
            ),
        )
    except Exception:
        # La trazabilidad principal queda igualmente registrada en Historial.
        pass


class AppHandler(previous.AppHandler):
    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/alertas/manuales-activas":
            if not self._require_session(admin=False):
                return
            try:
                return self.send_json({"ok": True, "alertas": _active_manual_alerts()})
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/alertas/finalizar":
            if not self._require_session(admin=False):
                return

            role = str((self.auth_user or {}).get("rol") or "")
            if role not in OPERATIVE_ROLES:
                return self.send_json(
                    {"ok": False, "error": "Su rol no permite finalizar alertas manuales."},
                    403,
                )

            try:
                data = self.read_json()
                alert_id = int(data.get("alertaId") or 0)
                observation = str(data.get("observacion") or "").strip()
                if alert_id <= 0:
                    return self.send_json({"ok": False, "error": "Alerta inválida."}, 400)

                with base.get_conn() as conn:
                    row = conn.execute(
                        "SELECT * FROM alertas WHERE id = ?",
                        (alert_id,),
                    ).fetchone()
                    if not row:
                        return self.send_json({"ok": False, "error": "Alerta no encontrada."}, 404)

                    alert = dict(row)
                    if alert.get("origen") != "Manual":
                        return self.send_json(
                            {"ok": False, "error": "Sólo las alertas manuales emitidas pueden finalizarse desde esta acción."},
                            400,
                        )
                    if alert.get("estado") == "Finalizada":
                        return self.send_json(
                            {"ok": False, "error": "La alerta ya fue finalizada."},
                            409,
                        )
                    if alert.get("estado") != "Emitida":
                        return self.send_json(
                            {"ok": False, "error": "La alerta ya no se encuentra activa."},
                            409,
                        )

                    operator = (
                        (self.auth_user or {}).get("nombre")
                        or (self.auth_user or {}).get("usuario")
                        or "Operador"
                    )

                    conn.execute(
                        """
                        UPDATE alertas
                        SET estado = 'Finalizada', operador = ?, observacion = ?,
                            actualizada_en = CURRENT_TIMESTAMP
                        WHERE id = ? AND estado = 'Emitida'
                        """,
                        (operator, observation, alert_id),
                    )

                    _link_manual_history(conn, alert_id, alert.get("zona") or "Todo Panambí", alert.get("creada_en"))

                    detail = f"Finalizada por {operator}"
                    if observation:
                        detail += f" · Motivo: {observation}"

                    conn.execute(
                        """
                        INSERT INTO historial
                          (tipo, descripcion, detalle, nivel, badge, zona,
                           riesgo, fecha, alerta_id)
                        VALUES (?, ?, ?, '—', 'FINALIZADA', ?, ?, date('now'), ?)
                        """,
                        (
                            "Alerta manual",
                            f"Alerta manual finalizada — {alert.get('zona') or 'Panambí'}",
                            detail,
                            alert.get("zona") or "Todo Panambí",
                            base.normalize_risk(alert.get("riesgo")),
                            alert_id,
                        ),
                    )

                    _record_finalization_audit(
                        conn,
                        alert,
                        self.auth_user or {},
                        operator,
                        observation,
                    )

                return self.send_json(
                    {
                        "ok": True,
                        "alertaId": alert_id,
                        "estado": "Finalizada",
                        "mensaje": "Alerta finalizada correctamente.",
                    }
                )
            except (TypeError, ValueError):
                return self.send_json({"ok": False, "error": "Alerta inválida."}, 400)
            except Exception as exc:
                return self.send_json({"ok": False, "error": str(exc)}, 500)

        # El endpoint original crea la alerta y su registro histórico. Después
        # de responder, vinculamos ambos registros para conservar trazabilidad.
        if path == "/api/alertas/manuales":
            with base.get_conn() as conn:
                before_id = conn.execute(
                    "SELECT COALESCE(MAX(id), 0) FROM alertas"
                ).fetchone()[0]

            result = super().do_POST()

            try:
                with base.get_conn() as conn:
                    row = conn.execute(
                        """
                        SELECT id, zona, creada_en
                        FROM alertas
                        WHERE id > ? AND origen = 'Manual'
                        ORDER BY id DESC
                        LIMIT 1
                        """,
                        (before_id,),
                    ).fetchone()
                    if row:
                        _link_manual_history(conn, row["id"], row["zona"], row["creada_en"])
            except Exception as exc:
                print(f"[Historial alerta manual] No se pudo vincular: {exc}")

            return result

        return super().do_POST()


if __name__ == "__main__":
    init_db()
    httpd = ThreadingHTTPServer(("", base.PORT), AppHandler)
    print(f"SAT Inundaciones escuchando en 0.0.0.0:{base.PORT}")
    print("RNF1: control de generación de alertas <= 5 minutos habilitado")
    print("RNF2: control de precisión <= 5 cm habilitado")
    print("Alertas manuales: finalización y trazabilidad habilitadas")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()
