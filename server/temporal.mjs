const timezone = 'America/Sao_Paulo';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const numberWords = Object.freeze({
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezasseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
  trinta: 30,
});

const stripAccents = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const localDate = value => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const shiftDate = (value, days) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const monthStart = value => `${value.slice(0, 7)}-01`;
const monthEnd = value => shiftDate(shiftDate(`${value.slice(0, 7)}-01`, 32).slice(0, 7) + '-01', -1);
const previousMonth = value => shiftDate(monthStart(value), -1).slice(0, 7) + '-01';
const monday = value => {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return shiftDate(value, day === 0 ? -6 : 1 - day);
};
const wordOrNumber = value => numberWords[value] || Number(value);

function matchCount(message, unitPattern) {
  const match = message.match(new RegExp(`(?:ultim[oa]s?|durante|nos?|das?)\\s+([0-9]+|[a-z]+)\\s+${unitPattern}`, 'i'));
  const count = match ? wordOrNumber(stripAccents(match[1])) : null;
  return Number.isInteger(count) ? count : null;
}

function chartType(message) {
  const normalized = stripAccents(message);
  if (/\b(barra|barras|bar)\b/.test(normalized)) return 'bar';
  if (/\b(linha|linhas|line)\b/.test(normalized)) return 'line';
  return 'bar';
}

function parseDate(value) {
  const normalized = value.includes('/') ? value.split('/').reverse().join('-') : value;
  if (!datePattern.test(normalized)) return null;
  const date = new Date(`${normalized}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? null : normalized;
}

function explicitDateRange(message) {
  const match = message.match(/(?:de|entre)\s+(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\s+(?:a|ate)\s+(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/i);
  if (!match) return null;
  const start = parseDate(match[1]);
  const end = parseDate(match[2]);
  if (!start || !end || start > end) return { invalid: true };
  const count = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1;
  return { unit: 'day', count, granularity: 'day', comparison: 'single', start, end, explicit: true };
}

export function normalizeTemporalRequest(message, { today = localDate(new Date()) } = {}) {
  const normalized = stripAccents(message);
  const dates = explicitDateRange(normalized);
  if (dates?.invalid) throw new RangeError('O intervalo informado e invalido.');
  if (dates) return { ...dates, chartType: chartType(message), timezone };

  let unit = 'week';
  let count = 2;
  if (/\b(dia|dias)\b/.test(normalized)) { unit = 'day'; count = matchCount(normalized, 'dias?') || (/\b(ultim[oa]|durante)\s+o?\s*dia\b/.test(normalized) ? 1 : count); }
  else if (/\b(mes|meses)\b/.test(normalized)) { unit = 'month'; count = matchCount(normalized, 'mes(?:es)?') || 1; }
  else if (/\b(semanas?|semana)\b/.test(normalized)) { unit = 'week'; count = matchCount(normalized, 'semanas?') || 2; }
  else if (/\b(90)\s*dias?\b/.test(normalized)) { unit = 'day'; count = 90; }

  const currentPrevious = /\b(esta|atual|corrente)\s+(semana|mes)|\b(anterior|passada|passado)\b/.test(normalized);
  const max = unit === 'day' ? 366 : unit === 'week' ? 52 : 24;
  if (!Number.isInteger(count) || count < 1 || count > max) throw new RangeError('O periodo solicitado esta fora do limite suportado.');
  const granularity = unit;
  return { unit, count, granularity, comparison: currentPrevious ? 'current_vs_previous' : 'periods', chartType: chartType(message), explicit: /\b(ultim|durante|esta|atual|anterior|passad|ultim[oa])/.test(normalized), today, timezone };
}

export function temporalPeriodDates(request, { today = request.today || localDate(new Date()) } = {}) {
  const end = request.end || today;
  if (request.unit === 'day') return { start: request.start || shiftDate(end, -(request.count - 1)), end };
  if (request.unit === 'week') {
    const currentWeek = monday(end);
    return { start: shiftDate(currentWeek, -7 * (request.count - 1)), end };
  }
  const currentStart = monthStart(end);
  const start = Array.from({ length: Math.max(0, request.count - 1) }).reduce(value => previousMonth(value), currentStart);
  return { start, end };
}

export { localDate, shiftDate, monday, monthStart, monthEnd };
