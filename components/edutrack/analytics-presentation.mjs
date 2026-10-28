const metricLabels = { study_minutes: 'Minutos estudados', sessions: 'Sess\u00f5es de estudo' };
const unitLabels = { day: 'Dia', week: 'Semana', month: 'M\u00eas', year: 'Ano' };
const granularityLabels = { day: 'Di\u00e1ria', week: 'Semanal', month: 'Mensal', year: 'Anual' };
const metadataLabels = { metric: 'M\u00e9trica', unit: 'Unidade', granularity: 'Granularidade', count: 'Quantidade' };

function readable(value) { return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toLocaleUpperCase('pt-BR')); }

export function analyticsMetadata(key, value) {
  const label = metadataLabels[key];
  if (!label || value === null || value === undefined || typeof value === 'object') return null;
  if (key === 'metric') return { label, value: metricLabels[String(value)] || readable(String(value)) };
  if (key === 'unit') return { label, value: unitLabels[String(value)] || readable(String(value)) };
  if (key === 'granularity') return { label, value: granularityLabels[String(value)] || readable(String(value)) };
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) return null;
  return { label, value: String(count) };
}

export function formatAnalyticsCount(value, unitValue) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) return '';
  const unit = String(unitValue || 'period');
  const label = unitLabels[unit];
  if (!label) return count + (count === 1 ? ' per\u00edodo' : ' per\u00edodos');
  const plural = { day: 'dias', week: 'semanas', month: 'meses', year: 'anos' };
  return count + ' ' + (count === 1 ? label.toLocaleLowerCase('pt-BR') : plural[unit]);
}

export function formatAnalyticsPeriod(value) {
  if (typeof value !== 'string') return '';
  const month = /^(\d{4})-(\d{2})$/.exec(value);
  if (month) return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1)));
  const week = /^(\d{4}-\d{2}-\d{2}) a (\d{4}-\d{2}-\d{2})$/.exec(value);
  if (week) {
    const dateLabel = date => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
    return dateLabel(week[1]) + ' - ' + dateLabel(week[2]);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
  return value;
}
