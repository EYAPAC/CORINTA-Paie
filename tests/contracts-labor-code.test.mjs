import test from 'node:test';
import assert from 'node:assert/strict';
await import('../contracts-core.js');
await import('../dmt-layout.js');
await import('../contracts-export.js');
const K = globalThis.CorintaContracts, X = globalThis.CorintaContractsExport, LAY = globalThis.CorintaDmtLayout;

/* Contrats de travail (CDI / CDD) mis en conformité avec le Code du travail : loi n° 2026-18 du 3 septembre 2026 (JO n° 7931),
   qui abroge la loi n° 97-17. Articles vérifiés dans le texte officiel : 3, 93, 94, 96, 97, 99, 100, 101, 102, 103, 105, 106, 241, 244, 248, 249, 295, 363, 461. */
const company = { name: 'Cabinet Test', profile: { siege: 'Dakar', representant: 'Monsieur Awa DIOP', qualite: 'Directeur', alias: 'CT' } };
function make(type, over) {
  const d = K.blankContract(company, '2026-11-13'); K.switchType(d, type);
  Object.assign(d.worker, { nom: 'Diop', prenoms: 'Awa Marie', civilite: 'Madame', sexe: 'F', naissance: '1990-05-12', lieuNaissance: 'Thiès', nationalite: 'Sénégalaise', domicile: 'Dakar', pere: 'Samba DIOP', mere: 'Fatou BA' });
  Object.assign(d.job, { emploi: 'Comptable', classification: '7ème B', dateEngagement: '2026-12-01', dateContrat: '2026-11-20', lieuSignature: 'Dakar', horaire: 40 });
  Object.assign(d.salary, { base: 150000, sursalaire: 20000, transport: 26000 });
  if (type === 'CDD') d.job.dateFin = '2027-05-31'; if (type === 'CDD_PROJET') { d.job.projetNom = 'Alpha'; d.job.dateFin = '2028-12-31'; }
  if (over) over(d); return d;
}
const text = (d) => { const model = X.contractModel(d); return model.blocks.map((b) => (b.k === 'p' ? (b.num ? b.num + ' ' : '') + b.r.map((r) => r.t).join('') : b.k === 'sign' ? b.cols.flat().map((p) => p.r.map((r) => r.t).join('')).join(' ') : b.k === 'tab' ? b.rows.flat(2).map((r) => r.t).join(' ') : (b.lines || []).join(' '))).join('\n').replace(/ /g, ' '); };

test('textes par défaut : plus aucune référence à l’ancien Code (loi 97-17, L33, L34, L148, L150)', () => {
  const all = JSON.stringify([K.CLAUSES, K.CLAUSES_CDD]);
  assert.ok(!/97-17|L33|L34|L148|L150|visa d’approbation/.test(all)); assert.ok(K.CLAUSES.references[0].includes('Loi n° 2026-18 du 3 septembre 2026'));
  for (const t of ['CDI', 'CDD', 'CDD_PROJET']) assert.ok(!/97-17|\bL\d{2,3}\b/.test(text(make(t))), t);
});

test('CDI : essai (art. 94 et 96), dépôt (art. 93), congés (248-249), durée du travail (241), non-concurrence (295)', () => {
  const t = text(make('CDI', (c) => { c.job.essaiMois = 3; c.job.essaiRenouvelable = true; }));
  ['renouvelable une fois par accord écrit', 'six (06) mois (article 94', 'sans préavis (article 96', 'avant tout début d’exécution (article 93', 'articles 248 et 249', 'article 241', 'Aucune interdiction d’exercer une activité à l’expiration du contrat n’est stipulée (article 295'].forEach((s) => assert.ok(t.includes(s), s));
  assert.ok(!/renouvelable tacitement/.test(t)); assert.ok(!/non-concurrence tant au moment de l’exécution/.test(t));
  const sans = text(make('CDI', (c) => { c.job.essaiMois = 0; })); assert.ok(sans.includes('sans période d’essai')); assert.ok(!sans.includes('article 93'));   // pas d’essai : pas de dépôt imposé
});

test('CDD : écrit et déposé avant exécution (art. 99), un seul renouvellement (100-103), poursuite = CDI (101)', () => {
  const t = text(make('CDD'));
  ['constaté par écrit et déposé par l’employeur à l’inspection du travail et de la sécurité sociale du ressort', 'article 99', 'seul renouvellement ou d’une seule prolongation', 'articles 100, 102 et 103', 'article 101'].forEach((s) => assert.ok(t.includes(s), s));
  const p = text(make('CDD_PROJET')); assert.ok(p.includes('ni renouvelé ni prolongé (article 100')); assert.ok(!/toute prolongation .* avenant écrit/.test(p));
});

test('validation : CDD > 2 ans refusé, CDD projet autorisé ; essai > 6 mois refusé ; horaire > 40 h signalé', () => {
  const long = make('CDD', (c) => { c.job.dateFin = '2029-01-31'; }); assert.ok(K.validate(long).errors.some((e) => /article 100/.test(e)));
  assert.equal(K.validate(make('CDD', (c) => { c.job.dateFin = '2028-11-30'; })).valid, true);   // exactement 2 ans
  assert.equal(K.validate(make('CDD_PROJET')).valid, true);                                      // ouvrage déterminé : peut excéder 2 ans
  assert.ok(K.validate(make('CDI', (c) => { c.job.essaiMois = 7; })).errors.some((e) => /article 94/.test(e)));
  assert.ok(K.validate(make('CDI', (c) => { c.job.essaiMois = 4; c.job.essaiRenouvelable = true; })).warnings.some((w) => /article 94/.test(w)));
  assert.ok(!K.validate(make('CDI', (c) => { c.job.essaiMois = 3; c.job.essaiRenouvelable = false; })).warnings.some((w) => /article 94/.test(w)));
  assert.ok(K.validate(make('CDI', (c) => { c.job.horaire = 44; })).warnings.some((w) => /article 241/.test(w)));
  assert.ok(K.validate(make('CDD')).warnings.some((w) => /article 97/.test(w) && /article 99/.test(w)));
});

test('non-concurrence après le contrat (art. 295) : nulle par défaut, licite seulement sous 6 mois / 30 km / compensation', () => {
  const on = (o) => make('CDI', (c) => Object.assign(c.job, { ncActif: true, ncMois: 6, ncKm: 30, ncMontant: 500000 }, o || {}));
  assert.equal(K.validate(on()).valid, true);
  assert.ok(K.validate(on({ ncMois: 7 })).errors.some((e) => /six \(06\) mois/.test(e))); assert.ok(K.validate(on({ ncKm: 31 })).errors.some((e) => /trente \(30\) kilomètres/.test(e))); assert.ok(K.validate(on({ ncMontant: 0 })).errors.some((e) => /compensation financière/.test(e)));
  const t = text(on()); ['pendant 6 mois', 'rayon de 30 kilomètres', 'imputable au travailleur', 'cinq cent mille (500 000) francs CFA', 'article 295'].forEach((s) => assert.ok(t.includes(s), s));
});

test('formalités selon le salarié : travailleur étranger (art. 105), jeune travailleur (art. 106)', () => {
  const f = make('CDI', (c) => { c.worker.nationalite = 'Française'; }); assert.ok(K.validate(f).warnings.some((w) => /article 105/.test(w))); assert.ok(text(f).includes('visé par le Directeur général du Travail et de la Sécurité sociale'));
  assert.ok(!text(make('CDI')).includes('article 105'));
  const y = make('CDI', (c) => { c.worker.naissance = '2009-03-01'; }); assert.ok(K.validate(y).warnings.some((w) => /article 106/.test(w))); assert.ok(text(y).includes('représentant légal'));
  assert.ok(!text(make('CDI')).includes('article 106'));
  assert.ok(K.isForeign('Sénégalo-mauritanienne') === false && K.isForeign('') === false && K.isForeign('Ivoirienne') === true);
});

test('seuls les articles vérifiés au Journal officiel sont cités dans un contrat de travail', () => {
  const allowed = new Set([3, 93, 94, 96, 97, 99, 100, 101, 102, 103, 105, 106, 241, 244, 248, 249, 295, 461]);
  const samples = [make('CDI', (c) => { c.job.essaiRenouvelable = true; Object.assign(c.job, { ncActif: true, ncMontant: 100000 }); c.worker.nationalite = 'Ivoirienne'; }), make('CDD'), make('CDD_PROJET')];
  samples.forEach((d) => {
    const t = text(d).replace(/articles 54 et suivants de la Convention collective nationale interprofessionnelle/g, 'CCNI'), cited = [...t.matchAll(/articles? ([\d ,et]+?)(?= du Code| ?\)| ;|\.|,| et |$)/g)].flatMap((m) => m[1].match(/\d+/g) || []).map(Number);
    cited.forEach((n) => assert.ok(allowed.has(n), 'article non vérifié : ' + n));
  });
});

test('anciens contrats enregistrés : textes par défaut de l’ancien Code remplacés, personnalisations conservées', () => {
  const old = K.blankContract(company, '2026-01-01'); old.job.type = 'CDI';
  old.clauses.references[0] = K.LEGACY.ref0; old.clauses.conges = K.LEGACY.conges[0]; old.clauses.discipline = K.LEGACY.discipline;
  const n = K.normalize(old, company); assert.ok(n.clauses.references[0].includes('2026-18')); assert.ok(n.clauses.conges.includes('articles 248 et 249')); assert.ok(!/après sa rupture/.test(n.clauses.discipline) && n.clauses.discipline.includes('article 295'));
  const cdd = K.blankContract(company, ''); cdd.job.type = 'CDD'; cdd.clauses.duree = K.LEGACY.duree[0]; cdd.clauses.conges = K.LEGACY.conges[1];
  const m = K.normalize(cdd, company); assert.ok(m.clauses.duree.includes('articles 100, 102 et 103')); assert.ok(m.clauses.conges.includes('articles 248 et 249') && m.clauses.conges.includes('articles 54'));
  const perso = K.blankContract(company, ''); perso.clauses.conges = 'Clause négociée : 30 jours.'; assert.equal(K.normalize(perso, company).clauses.conges, 'Clause négociée : 30 jours.');
});

test('alertes CDD : rappel de la règle (renouvellement unique, poursuite = CDI)', () => {
  const d = make('CDD', (c) => { c.id = 'x'; c.job.dateFin = '2026-10-01'; });
  assert.ok(K.alertsOf([d], '2026-11-13').some((a) => a.level === 'late' && /article 101/.test(a.text)));
});

test('DMT : références légales du modèle mises à jour (art. 363), plus de renvoi au Code de 1961', () => {
  const lines = LAY.cells.filter((c) => c[0] >= 5 && c[0] <= 7 && c[1] === 2).map((c) => c[2]).join(' ');
  assert.ok(lines.includes('Article 363 du Code du Travail (loi n° 2026-18 du 3 septembre 2026)')); assert.ok(!/61- 34|1961|1963/.test(lines));
  const html = X.dmtHtml(X.dmtData(K.dmtView(make('CDI'), company), 0)); assert.ok(html.includes('Article 363'));
});

test('documents CDI / CDD : aperçu, Word et texte identiques après mise à jour ; XML valide', () => {
  for (const t of ['CDI', 'CDD', 'CDD_PROJET']) {
    const d = make(t, (c) => { c.job.essaiMois = t === 'CDI' ? 3 : 0; }), zip = X.modelDocx(X.contractModel(d), { title: 't' });
    assert.ok(zip.length > 1000); const html = X.modelHtml(X.contractModel(d)).replace(/<span class="cx-pn">.*?<\/span>/g, '').replace(/<[^>]+>/g, '');
    assert.ok(/Code du travail/.test(html), t);
  }
});
