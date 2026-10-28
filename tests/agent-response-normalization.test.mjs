import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResponse } from '../server/agent-orchestrator.mjs';

const chart = { type: 'line', title: 'Minutos', xAxis: { field: 'period', label: 'Periodo' }, yAxis: { field: 'minutes', label: 'Minutos' }, series: [{ field: 'minutes', label: 'Minutos' }], data: [{ period: 'Semana 1', minutes: 20 }], source: { tool: 'get_study_trends' }, datasetVersion: 'test-v1' };

test('normaliza grafico JSON cercado por Markdown sem exibir o objeto bruto', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const response = parseResponse(`Veja o resultado:\n\n${fence}json\n${JSON.stringify(chart)}\n${fence}`, 'analysis', new Set(['get_study_trends']));
  assert.equal(response.type, 'analysis');
  assert.equal(response.chart.title, 'Minutos');
  assert.equal(response.analysis, 'Veja o resultado:');
});

test('normaliza grafico dentro do campo textual de uma analise', () => {
  const response = parseResponse(JSON.stringify({ type: 'analysis', analysis: JSON.stringify(chart), metrics: {} }), 'analysis', new Set(['get_study_trends']));
  assert.equal(response.chart.data[0].minutes, 20);
  assert.equal(response.analysis, 'Analise visual gerada a partir dos seus dados.');
});

test('classifica JSON malformado, schema invalido e tipo inesperado separadamente', () => {
  assert.throws(() => parseResponse('{', 'analysis'), error => error.code === 'malformed-json');
  assert.throws(() => parseResponse(JSON.stringify({ type: 'analysis', analysis: 'x' }), 'analysis'), error => error.code === 'schema-validation-failed');
  assert.throws(() => parseResponse(JSON.stringify({ type: 'text', content: 'x' }), 'analysis'), error => error.code === 'unexpected-response-type');
});
