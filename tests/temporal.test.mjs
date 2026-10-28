import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTemporalRequest, temporalPeriodDates } from '../server/temporal.mjs';

test('normaliza dias explicitos sem substituir a quantidade', () => {
  const request = normalizeTemporalRequest('Mostre meus minutos estudados nos ultimos 21 dias', { today: '2026-10-27' });
  assert.deepEqual({ unit: request.unit, count: request.count, granularity: request.granularity }, { unit: 'day', count: 21, granularity: 'day' });
  assert.deepEqual(temporalPeriodDates(request), { start: '2026-10-07', end: '2026-10-27' });
});

test('normaliza semanas com numeros em algarismos e palavras', () => {
  const four = normalizeTemporalRequest('Compare meu desempenho nas ultimas 4 semanas', { today: '2026-10-27' });
  const twelve = normalizeTemporalRequest('Compare meu desempenho nas ultimas doze semanas', { today: '2026-10-27' });
  assert.equal(four.count, 4);
  assert.equal(four.unit, 'week');
  assert.equal(twelve.count, 12);
  assert.equal(temporalPeriodDates(four).start, '2026-10-05');
});

test('normaliza meses e comparacao entre semana atual e anterior', () => {
  const months = normalizeTemporalRequest('Compare meu desempenho nos ultimos 6 meses', { today: '2026-10-27' });
  const previousMonths = normalizeTemporalRequest('Compare os dois ultimos meses', { today: '2026-10-27' });
  const weeks = normalizeTemporalRequest('Compare esta semana com a semana passada', { today: '2026-10-27' });
  assert.deepEqual({ unit: months.unit, count: months.count, granularity: months.granularity }, { unit: 'month', count: 6, granularity: 'month' });
  assert.equal(previousMonths.count, 2);
  assert.equal(temporalPeriodDates(months).start, '2026-05-01');
  assert.equal(weeks.comparison, 'current_vs_previous');
  assert.equal(weeks.count, 2);
});

test('normaliza intervalo de datas e rejeita limites invalidos', () => {
  const request = normalizeTemporalRequest('Mostre o periodo de 2026-10-01 a 2026-10-03', { today: '2026-10-27' });
  assert.deepEqual({ start: request.start, end: request.end, count: request.count }, { start: '2026-10-01', end: '2026-10-03', count: 3 });
  assert.throws(() => normalizeTemporalRequest('Mostre os ultimos 400 dias', { today: '2026-10-27' }), /limite suportado/);
});
