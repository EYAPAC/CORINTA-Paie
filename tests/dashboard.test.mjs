import test from 'node:test';
import assert from 'node:assert/strict';

await import('../dashboard.js');
const D = globalThis.CorintaDash;

const company = { id: 'c1', name: 'Cabinet MSA', employees: [
  { id: 'e1', name: 'Awa Ndiaye', mat: 'M1', job: 'Comptable', fields: { hire: '2025-01-10', categoryMonthly: '400000' } },
  { id: 'e2', name: 'Moussa Diop', mat: 'M2', job: 'Chauffeur', fields: { base: '250000' } },
  { id: 'e3', name: 'Fatou Bâ', mat: '', fields: {} },
] };
function rec(over) {
  const t = { grossAll: 500000, net: 400000, totalDeductions: 100000, employerCharges: 60000, employerCost: 560000, irAmount: 30000, trimfAmount: 1000, ipresEmployee: 20000, ipresEmployer: 30000, cssEmployee: 0, cssEmployer: 20000, ...(over.totals || {}) };
  return { name: 'Awa Ndiaye', period: '2026-10', companyId: 'c1', employeeId: 'e1', net: '400 000 FCFA', fields: { job: 'Comptable', mat: 'M1' }, ...over, totals: t };
}
const base = (records, extra = {}) => D.buildModel({ company, records, period: '2026-10', today: '2026-10-08', ...extra });

test('entreprise sans aucune donnée : zéros et états vides, rien d’inventé', () => {
  const m = D.buildModel({ company: { id: 'x', name: 'Vide', employees: [] }, records: [], period: '2026-10', today: '2026-10-08' });
  assert.equal(m.employeeCount, 0); assert.equal(m.gross, 0); assert.equal(m.bulletins.count, 0);
  assert.equal(m.nextDeadline, null); assert.equal(m.distribution.length, 0); assert.equal(m.latest.length, 0);
  assert.equal(m.series.points.filter((p) => p.value !== null).length, 0);
  assert.match(D.renderChart(m), /Aucune donnée/); assert.match(D.renderTable(m), /Aucun bulletin/); assert.match(D.renderDonut(m), /indisponible/);
  assert.match(D.renderCycle(m), /non démarré/); assert.match(D.renderAlerts(m), /Rien à signaler/);
});

test('isolation entreprise : les bulletins d’une autre entreprise sont ignorés', () => {
  const m = base([rec({}), rec({ companyId: 'autre', totals: { grossAll: 9e9, net: 9e9 } })]);
  assert.equal(m.gross, 500000); assert.equal(m.bulletins.count, 1);
});

test('KPI : effectif, masse salariale, variation vs mois précédent', () => {
  const m = base([rec({}), rec({ period: '2026-09', totals: { grossAll: 400000 } })]);
  assert.equal(m.employeeCount, 3); assert.equal(m.gross, 500000); assert.equal(m.prevGross, 400000); assert.equal(m.grossDelta, 25);
  assert.match(D.renderKpis(m), /\+25/);
  assert.equal(base([rec({})]).grossDelta, null, 'pas de variation sans mois précédent');
});

test('échéances : jour du mois suivant, niveaux d’urgence, uniquement pour une période traitée', () => {
  assert.equal(D.dueDate('2026-10', 15), '2026-11-15'); assert.equal(D.dueDate('2026-12', 15), '2027-01-15'); assert.equal(D.dueDate('2026-01', 31), '2026-02-28');
  const m = base([rec({})], { today: '2026-11-10' });
  assert.equal(m.nextDeadline.days, 5); assert.equal(m.nextDeadline.level, 'soon');
  assert.equal(base([rec({})], { today: '2026-11-13' }).nextDeadline.level, 'urgent');
  assert.equal(base([rec({})], { today: '2026-11-20' }).nextDeadline.level, 'late');
  assert.equal(base([], { today: '2026-11-10' }).deadlines.length, 0, 'aucune échéance sans bulletin');
  const done = base([rec({})], { today: '2026-11-10', company: { ...company, obligations: { '2026-10': { ipres: true, css: true, impots: true } } } });
  assert.equal(done.deadlines.length, 0);
  const custom = base([rec({})], { today: '2026-11-01', deadlineDays: { ipres: 5, css: 20, impots: 25 } });
  assert.equal(custom.nextDeadline.key, 'ipres'); assert.equal(custom.nextDeadline.due, '2026-11-05');
});

test('échéances : les périodes de plus d’un mois ne créent pas d’alerte permanente', () => {
  const vieux = [rec({ period: '2026-06' }), rec({ period: '2026-07' })];
  const m = D.buildModel({ company, records: vieux, period: '2026-07', today: '2026-10-08' });
  assert.equal(m.deadlines.length, 0); assert.equal(m.nextDeadline, null);
  const recent = D.buildModel({ company, records: [rec({ period: '2026-09' })], period: '2026-09', today: '2026-10-08' });
  assert.equal(recent.nextDeadline.period, '2026-09'); assert.equal(recent.nextDeadline.days, 7);
});

test('KPI : variation nulle affichée « Stable »', () => {
  const m = base([rec({}), rec({ period: '2026-09' })]);
  assert.match(D.renderKpis(m), /Stable/); assert.doesNotMatch(D.renderKpis(m), /\+0/);
});

test('statuts : défaut « À valider », « Erreur » automatique si net ou brut nul', () => {
  const m = base([rec({}), rec({ employeeId: 'e2', name: 'Moussa Diop', status: 'Payé' }), rec({ employeeId: 'e3', name: 'Fatou Bâ', totals: { net: 0 }, net: '0 FCFA' })]);
  assert.deepEqual(m.bulletins.status, { 'Brouillon': 0, 'À valider': 1, 'Validé': 0, 'Payé': 1, 'Erreur': 1 });
  assert.ok(m.alerts.some((a) => /en erreur/.test(a.text)));
});

test('répartition : la somme des parts égale le coût employeur des bulletins détaillés', () => {
  const m = base([rec({}), rec({ employeeId: 'e2', name: 'Moussa Diop' })]);
  assert.equal(Math.round(m.distTotal), 2 * 560000);
  assert.equal(Math.round(m.distribution.reduce((t, x) => t + x.pct, 0)), 100);
  const anciens = base([{ name: 'Ancien', period: '2026-10', companyId: 'c1', net: '300 000 FCFA', totals: { grossAll: 350000 }, fields: {} }]);
  assert.equal(anciens.distribution.length, 0, 'un ancien bulletin sans détail n’est pas extrapolé');
  assert.match(D.renderDonut(anciens), /recalculez/);
});

test('série : plages 6 / 12 / personnalisée, mois sans bulletin = trou, jamais zéro', () => {
  const recs = [rec({ period: '2026-08' }), rec({ period: '2026-10' })];
  const m6 = base(recs); assert.equal(m6.series.points.length, 6); assert.equal(m6.series.points[0].period, '2026-05');
  assert.deepEqual(m6.series.points.map((p) => p.value !== null), [false, false, false, true, false, true]);
  assert.equal(base(recs, { range: { kind: '12' } }).series.points.length, 12);
  const c = base(recs, { range: { kind: 'custom', from: '2026-09', to: '2026-10' } }); assert.equal(c.series.points.length, 2);
  const inv = base(recs, { range: { kind: 'custom', from: '2026-10', to: '2026-08' } }); assert.equal(inv.series.points.length, 3, 'bornes inversées corrigées');
  assert.equal(base(recs, { metric: 'net' }).series.points[5].value, 400000);
  assert.equal(base(recs, { metric: 'employer' }).series.points[5].value, 60000);
});

test('cycle de paie : première étape non terminée = en cours ; erreur = bloqué', () => {
  assert.deepEqual(base([]).cycle.map((s) => s.state), ['done', 'current', 'pending', 'pending', 'pending', 'pending']);
  const all = [rec({ status: 'Payé' }), rec({ employeeId: 'e2', name: 'M', status: 'Payé' }), rec({ employeeId: 'e3', name: 'F', status: 'Payé' })];
  assert.deepEqual(base(all).cycle.map((s) => s.state), ['done', 'done', 'done', 'done', 'current', 'done'], 'chaque étape reflète la réalité : tout payé mais déclarations non faites');
  const err = base([rec({ totals: { net: 0 }, net: '0' }), rec({ employeeId: 'e2', name: 'M' }), rec({ employeeId: 'e3', name: 'F' })]);
  assert.equal(err.cycle[2].state, 'blocked');
});

test('informations manquantes et salariés sans bulletin', () => {
  const m = base([rec({})]);
  assert.deepEqual(m.missing.sort(), ['Fatou Bâ', 'Moussa Diop']);
  assert.ok(m.incomplete.some((e) => e.name === 'Fatou Bâ' && e.lack.includes('matricule')));
  assert.ok(m.incomplete.some((e) => e.name === 'Moussa Diop' && e.lack.includes('date d’embauche')));
  assert.ok(!m.incomplete.some((e) => e.name === 'Awa Ndiaye'));
});

test('derniers bulletins : récents d’abord, 6 maximum', () => {
  const recs = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-04'].map((p) => rec({ period: p }));
  const m = base(recs); assert.equal(m.latest.length, 6); assert.equal(m.latest[0].period, '2026-10'); assert.equal(m.latest[5].period, '2026-05');
});

test('sécurité : le contenu saisi par l’utilisateur est échappé dans tous les rendus', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const r = rec({ name: evil, fields: { job: evil } }); r._index = 0;
  const m = base([r], { company: { ...company, name: evil } });
  for (const html of [D.renderTable(m), D.renderAlerts(m), D.renderKpis(m), D.renderCycle(m)]) assert.ok(!html.includes('<img'), html.slice(0, 80));
});

test('actions : chaque bouton interactif porte un data-act, les montants sont en FCFA', () => {
  const r = rec({}); r._index = 3; const m = base([r]);
  const t = D.renderTable(m);
  for (const a of ['view', 'download', 'print', 'status']) assert.ok(t.includes('data-act="' + a + '"'), a);
  assert.ok(t.includes('data-i="3"')); assert.match(D.money(32480000), /32 480 000 FCFA/); assert.equal(D.compact(32480000), '32,48 M');
});
