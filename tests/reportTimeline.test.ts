import assert from 'node:assert/strict';
import { buildReportTimeline, type ReportTimelineRow } from '../src/features/admin/reportTimeline';

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const rows: ReportTimelineRow[] = [
  { date: new Date(2026, 9, 2, 12), revenue: 40, profit: 10 },
  { date: new Date(2026, 9, 2, 18), revenue: 20, profit: 5 },
  { date: new Date(2026, 9, 18, 12), revenue: 80, profit: 25 },
  { date: new Date(2025, 11, 5, 12), revenue: 30, profit: 8 },
];

const daily = buildReportTimeline(rows.filter((row) => row.date.getFullYear() === 2026 && row.date.getMonth() === 9), 2026, 9, months);
assert.equal(daily.length, 31, 'Outubro deve mostrar os 31 dias do calendário.');
assert.deepEqual(daily[1], { label: '2 Out 2026', axisLabel: '2', orders: 2, revenue: 60, profit: 15 });
assert.deepEqual(daily[2], { label: '3 Out 2026', axisLabel: '3', orders: 0, revenue: 0, profit: 0 });
assert.deepEqual(daily[17], { label: '18 Out 2026', axisLabel: '18', orders: 1, revenue: 80, profit: 25 });

const yearly = buildReportTimeline(rows.filter((row) => row.date.getFullYear() === 2026), 2026, 'all', months);
assert.equal(yearly.length, 12, 'A vista anual deve mostrar os doze meses.');
assert.deepEqual(yearly[9], { label: 'Out 2026', axisLabel: 'Out', orders: 3, revenue: 140, profit: 40 });

const history = buildReportTimeline(rows, 'all', 'all', months);
assert.deepEqual(history.map((point) => point.axisLabel), ['2025', '2026']);

console.log('reportTimeline tests passed');
