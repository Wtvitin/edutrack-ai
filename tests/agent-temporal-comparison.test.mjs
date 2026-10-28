import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareAnalytics, prepareTemporalAnalytics } from '../server/analytics.mjs';
import { normalizeTemporalRequest } from '../server/temporal.mjs';
import { createAgentToolRegistry } from '../server/agent-tools.mjs';

const snapshot = sessions => ({ subjects: [], tasks: [], sessions });

test('analytics agrega duas janelas consecutivas, limites inclusivos e sess�es do mesmo dia', async () => {
  const metrics = await prepareAnalytics(snapshot([
    { date: '2026-10-14', minutes: 10 },
    { date: '2026-10-14', minutes: 20 },
    { date: '2026-10-20', minutes: 40 },
    { date: '2026-10-27', minutes: 60 },
    { date: '2026-10-12', minutes: 99 },
    { date: '2026-10-28', minutes: 99 },
  ]), 7, 'all', { today: '2026-10-27' });

  assert.equal(metrics.previousStart, '2026-10-14');
  assert.equal(metrics.previousEnd, '2026-10-20');
  assert.equal(metrics.start, '2026-10-21');
  assert.equal(metrics.end, '2026-10-27');
  assert.equal(metrics.previousMinutes, 70);
  assert.equal(metrics.minutes, 60);
  assert.deepEqual(metrics.previousDaily[0], { date: '2026-10-14', minutes: 30 });
  assert.equal(metrics.daily[6].minutes, 60);
});

test('analytics mant�m dias sem atividade em zero e representa per�odos vazios honestamente', async () => {
  const currentOnly = await prepareAnalytics(snapshot([{ date: '2026-10-27', minutes: 35 }]), 7, 'all', { today: '2026-10-27' });
  assert.equal(currentOnly.sessions, 1);
  assert.equal(currentOnly.previousSessions, 0);
  assert.equal(currentOnly.previousDaily.reduce((sum, day) => sum + day.minutes, 0), 0);
  assert.equal(currentOnly.daily[6].minutes, 35);

  const empty = await prepareAnalytics(snapshot([]), 7, 'all', { today: '2026-10-27' });
  assert.equal(empty.minutes, 0);
  assert.equal(empty.previousMinutes, 0);
  assert.equal(empty.daily.length, 7);
  assert.ok(empty.daily.every(day => day.minutes === 0));
  assert.ok(empty.previousDaily.every(day => day.minutes === 0));
});

test('get_study_trends consulta o snapshot autenticado e devolve as duas s�ries', async () => {
  const user = { id: 'authorized-user' };
  let requestedDays;
  let snapshotUser;
  const registry = createAgentToolRegistry({
    readSnapshot: async (db, currentUser) => {
      snapshotUser = currentUser;
      return { data: snapshot([]) };
    },
    analytics: async (data, days) => {
      requestedDays = days;
      return prepareAnalytics(data, days, 'all', { today: '2026-10-27' });
    },
  });
  const result = await registry.execute('get_study_trends', { days: 7 }, { db: {}, user });

  assert.equal(snapshotUser, user);
  assert.equal(requestedDays, 7);
  assert.equal(result.daily.length, 7);
  assert.equal(result.previousDaily.length, 7);
  assert.equal(result.previousStart, '2026-10-14');
});

test('analytics produz quatro buckets semanais sem repetir agregados', async () => {
  const request = normalizeTemporalRequest('Compare meu desempenho nas ultimas 4 semanas', { today: '2026-10-27' });
  const result = await prepareTemporalAnalytics(snapshot([
    { date: '2026-10-06', minutes: 10 },
    { date: '2026-10-13', minutes: 20 },
    { date: '2026-10-20', minutes: 30 },
    { date: '2026-10-27', minutes: 40 },
  ]), request);
  assert.equal(result.periods.length, 4);
  assert.deepEqual(result.periods.map(period => period.minutes), [10, 20, 30, 40]);
  assert.deepEqual(result.periods.map(period => period.start), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
});

test('analytics produz dois buckets mensais, incluindo o mes atual parcial', async () => {
  const request = normalizeTemporalRequest('Compare meu desempenho nos ultimos 2 meses', { today: '2026-10-27' });
  const result = await prepareTemporalAnalytics(snapshot([
    { date: '2026-09-30', minutes: 15 },
    { date: '2026-10-01', minutes: 25 },
    { date: '2026-10-27', minutes: 35 },
    { date: '2026-10-28', minutes: 100 },
  ]), request);
  assert.deepEqual(result.periods.map(period => period.start), ['2026-09-01', '2026-10-01']);
  assert.deepEqual(result.periods.map(period => period.minutes), [15, 60]);
  assert.equal(result.periods[1].complete, false);
  assert.equal(result.end, '2026-10-27');
});

test('analytics preserva seis meses e trinta dias sem reduzir para sete', async () => {
  const months = normalizeTemporalRequest('Compare meu desempenho nos ultimos 6 meses', { today: '2026-10-27' });
  const monthResult = await prepareTemporalAnalytics(snapshot([{ date: '2026-05-03', minutes: 5 }, { date: '2026-10-27', minutes: 7 }]), months);
  const days = normalizeTemporalRequest('Mostre meus minutos estudados nos ultimos 30 dias', { today: '2026-10-27' });
  const dayResult = await prepareTemporalAnalytics(snapshot([{ date: '2026-10-01', minutes: 4 }, { date: '2026-10-27', minutes: 8 }]), days);
  assert.equal(monthResult.periods.length, 6);
  assert.equal(dayResult.periods.length, 30);
  assert.equal(dayResult.periods[0].start, '2026-09-28');
});
