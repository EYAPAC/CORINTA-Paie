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
  assert.equal(m.nextDeadline, null); assert.equal(m.distribution.length, 0); assert.equal(m.employeeRows.length, 0);
  assert.equal(m.series.points.filter((p) => p.value !== null).length, 0);
  assert.match(D.renderChart(m), /Aucune donnée/); assert.match(D.renderEmployeeTable(m), /Aucun salarié/); assert.match(D.renderDonut(m), /indisponible/);
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

test('liste des salariés : un salarié par ligne, classés par statut puis par nom', () => {
  const r1 = rec({ status: 'Payé' }); r1._index = 0;                                              // Awa Ndiaye (e1)
  const r2 = rec({ employeeId: 'e2', name: 'Moussa Diop', status: 'Validé' }); r2._index = 1;      // Moussa (e2)
  const m = base([r1, r2]);
  assert.deepEqual(m.employeeRows.map((x) => [x.name, x.status]), [['Awa Ndiaye', 'Payé'], ['Moussa Diop', 'Validé'], ['Fatou Bâ', 'Sans bulletin']]);
  const ordre = base([rec({ employeeId: 'e3', name: 'Fatou Bâ', status: 'Brouillon' }), rec({ employeeId: 'e1', name: 'Awa Ndiaye' }), rec({ employeeId: 'e2', name: 'Moussa Diop', status: 'Payé' })]);
  assert.deepEqual(ordre.employeeRows.map((x) => x.status), ['Payé', 'À valider', 'Brouillon']);
  assert.equal(m.employeeRows.length, m.employeeCount, 'chaque salarié du dossier apparaît une seule fois');
});

test('liste des salariés : rendu avec colonnes de la maquette, voir/télécharger, création si sans bulletin', () => {
  const r = rec({ status: 'Payé' }); r._index = 3; const m = base([r]);
  const t = D.renderEmployeeTable(m);
  for (const h of ['Salarié', 'Période', 'Net à payer', 'Statut', 'Actions']) assert.ok(t.includes(h), h);
  assert.ok(!t.includes('Brut') && !t.includes('Retenues'), 'colonnes limitées à celles de la maquette');
  for (const a of ['view', 'download', 'status', 'employee']) assert.ok(t.includes('data-act="' + a + '"'), a);
  assert.ok(!t.includes('data-act="print"'));
  assert.ok(t.includes('data-i="3"')); assert.match(t, /Sans bulletin/);
  assert.match(D.renderEmployeeTable(m, 1), /Voir les 3 salariés/, 'au-delà de la limite : lien vers la liste complète');
});

test('général : les totaux sont la somme exacte des entreprises, sans mélange', () => {
  const c2 = { id: 'c2', name: 'CESAG', employees: [{ id: 'x1', name: 'Ibrahima Diallo', mat: 'C01', fields: { hire: '2025-01-01', base: '1' } }] };
  const recs = [rec({}), rec({ employeeId: 'e2', name: 'Moussa Diop' }), { ...rec({ employeeId: 'x1', name: 'Ibrahima Diallo' }), companyId: 'c2', totals: { ...rec({}).totals, grossAll: 300000, net: 250000, employerCost: 340000 } }];
  const g = D.buildGlobalModel({ companies: [company, c2], records: recs, period: '2026-10', today: '2026-10-08' });
  const a = base(recs), b = D.buildModel({ company: c2, records: recs, period: '2026-10', today: '2026-10-08' });
  assert.equal(g.companyCount, 2); assert.equal(g.employeeCount, a.employeeCount + b.employeeCount);
  assert.equal(g.gross, a.gross + b.gross); assert.equal(g.gross, 500000 * 2 + 300000);
  assert.equal(g.bulletins.count, 3); assert.equal(g.bulletins.expected, a.bulletins.expected + b.bulletins.expected);
  assert.equal(Math.round(g.distTotal), Math.round(a.distTotal + b.distTotal));
  const sep = g.series.points.at(-1); assert.equal(sep.value, g.gross); assert.equal(sep.count, 3);
  assert.deepEqual(g.rows.map((r) => r.name).sort(), ['CESAG', 'Cabinet MSA']);
});

test('général : alertes préfixées par l’entreprise, dossiers à traiter en premier, vide sans entreprise', () => {
  const c2 = { id: 'c2', name: 'CESAG', employees: [] };
  const g = D.buildGlobalModel({ companies: [company, c2], records: [rec({})], period: '2026-10', today: '2026-11-20' });
  assert.ok(g.alerts.length && g.alerts.every((a) => a.text.startsWith('Cabinet MSA · ') && a.companyId === 'c1'));
  assert.equal(g.rows[0].name, 'Cabinet MSA', 'le dossier avec alertes passe devant');
  assert.match(D.renderAlerts(g), /class="main-act" data-act="panel:[a-z]+" data-company="c1"/, 'le clic sur l’alerte ouvre le dossier concerné');
  assert.match(D.renderAlerts(g), /data-act="done" data-company="c1"/);
  assert.doesNotMatch(D.renderAlerts(base([rec({})], { today: '2026-11-20' })), /data-company/, 'au niveau d’une entreprise, pas d’attribut');
  const vide = D.buildGlobalModel({ companies: [], records: [], period: '2026-10', today: '2026-10-08' });
  assert.equal(vide.companyCount, 0); assert.equal(vide.gross, 0);
  assert.match(D.renderCompanyTable(vide), /Aucune entreprise/); assert.match(D.renderChart(vide), /Aucune donnée/);
});

test('général : tableau des entreprises avec action « Ouvrir » et état du cycle', () => {
  const g = D.buildGlobalModel({ companies: [company], records: [rec({})], period: '2026-10', today: '2026-10-08' });
  const t = D.renderCompanyTable(g);
  assert.ok(t.includes('data-act="open-company"') && t.includes('data-id="c1"')); assert.match(t, /En cours|Bloqué|Terminé/);
  assert.match(D.renderGlobalKpis(g), /Entreprises/);
});

test('cartes : variation vs mois précédent pour salariés payés et bulletins', () => {
  const m = base([rec({}), rec({ employeeId: 'e2', name: 'M2' }), rec({ period: '2026-09' })]);
  assert.equal(m.paidEmployees, 2); assert.equal(m.prevPaidEmployees, 1); assert.equal(m.prevCount, 1);
  assert.match(D.renderKpis(m), /↑ \+1/);
});

test('sécurité : le contenu saisi par l’utilisateur est échappé dans tous les rendus', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const r = rec({ name: evil, fields: { job: evil } }); r._index = 0;
  const co = { ...company, name: evil, employees: [{ id: 'e1', name: evil, job: evil, mat: 'M1', fields: {} }] };
  const m = base([r], { company: co });
  const g = D.buildGlobalModel({ companies: [co], records: [r], period: '2026-10', today: '2026-10-08' });
  for (const html of [D.renderEmployeeTable(m), D.renderAlerts(m), D.renderKpis(m), D.renderCycle(m), D.renderCompanyTable(g), D.renderAlerts(g), D.renderGlobalKpis(g)]) assert.ok(!html.includes('<img'), html.slice(0, 80));
});

test('montants et formats', () => {
  assert.match(D.money(32480000), /32.480.000.FCFA/); assert.match(D.compact(32480000), /^32,48.M$/);
});
