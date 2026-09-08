/*
 * Utilidades horarias del SAT Panambí.
 * SQLite CURRENT_TIMESTAMP entrega UTC; estos helpers interpretan esos valores
 * correctamente y los muestran siempre en America/Argentina/Buenos_Aires.
 */

export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function parseBackendUtc(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Si el backend ya envía zona horaria, respetarla. Los timestamps SQLite sin
  // sufijo se consideran UTC porque CURRENT_TIMESTAMP trabaja en UTC.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const iso = raw.replace(' ', 'T') + (hasZone ? '' : 'Z');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatArgentinaDateTime(value) {
  const date = parseBackendUtc(value);
  if (!date) return value || '—';

  return date.toLocaleString('es-AR', {
    timeZone: ARGENTINA_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatArgentinaTime(value, includeSeconds = false) {
  const date = value instanceof Date ? value : parseBackendUtc(value);
  if (!date || Number.isNaN(date.getTime())) return value || '—';

  return date.toLocaleTimeString('es-AR', {
    timeZone: ARGENTINA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  });
}

export function argentinaDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
