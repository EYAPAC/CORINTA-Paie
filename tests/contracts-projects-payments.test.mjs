import test from 'node:test';
import assert from 'node:assert/strict';
await import('../contracts-core.js');
await import('../dmt-layout.js');
await import('../contracts-export.js');
await import('../contracts-services-doc.js');
const K = globalThis.CorintaContracts, X = globalThis.CorintaContractsExport, LAY = globalThis.CorintaDmtLayout;

const company = { name: 'Cabinet Test', profile: { siege: 'Dakar', representant: 'Monsieur Awa DIOP', qualite: 'Directeur', alias: 'CT' } };
function make(type, over) {
  const d = K.blankContract(company, '2026-11-13'); K.switchType(d, type); d.number = (type === 'LDC' ? 'LDC' : 'PS') + '-2026-001';
  Object.assign(d.worker, { civilite: 'Madame', sexe: 'F', nom: 'Sarr', prenoms: 'Mame Awa', domicile: 'Dakar', naissance: '1990-05-12', lieuNaissance: 'Thiès' });
  Object.assign(d.job, { emploi: 'Assistante de projet', dateEngagement: '2026-12-01', dateFin: '2027-05-31', lieu: 'Kaffrine', lieuSignature: 'Dakar' });
  Object.assign(d.service, { projet: 'Projet Alpha', client: 'ANAT', intitule: 'Appui à la mission', montant: 180000, remunMode: 'mensuel', nature: 'brut', perdiem: 30000, penaliteTaux: 1, penalitePlafond: 10 });
  if (over) over(d); return d;
}
const text = (d, rec) => X.honorairesModel(d, rec).blocks.map((b) => (b.k === 'p' ? b.r.map((r) => r.t).join('') : b.k === 'tab' ? b.rows.flat(2).map((r) => r.t).join(' ') : b.k === 'sign' ? b.cols.flat().map((p) => p.r.map((r) => r.t).join('')).join(' ') : (b.lines || []).join(' '))).join('\n').replace(/ /g, ' ');

test('projet obligatoire : un contrat de prestation ou une lettre de commande sans projet n’est pas finalisable', () => {
  for (const type of ['PRESTATION', 'LDC']) {
    const d = make(type, (c) => { c.service.projet = ''; }); assert.ok(K.validate(d).errors.some((e) => /projet/i.test(e)), type); d.service.projet = 'Projet Alpha'; assert.equal(K.validate(d).valid, true, type);
  }
  assert.ok(!K.validate(K.blankContract(company, '')).errors.some((e) => /projet/i.test(e)));   // contrats de travail : pas de projet exigé
});

test('projets de l’entreprise : créés automatiquement, retrouvés sans tenir compte de la casse', () => {
  const list = []; const a = K.ensureProject(list, '  Projet   Alpha ', 'ANAT'); assert.equal(a.name, 'Projet Alpha'); assert.equal(a.client, 'ANAT'); assert.equal(list.length, 1);
  const b = K.ensureProject(list, 'projet ALPHA', ''); assert.equal(b.id, a.id); assert.equal(list.length, 1);
  K.ensureProject(list, 'Projet Beta', ''); assert.equal(list.length, 2); assert.equal(K.ensureProject(list, '   ', ''), null);
});

test('valeur d’un contrat : prix global, ou honoraires mensuels × nombre de mois', () => {
  assert.equal(K.serviceValue(make('PRESTATION', (c) => { c.service.remunMode = 'global'; c.service.montant = 2000000; })), 2000000);
  assert.equal(K.serviceValue(make('PRESTATION')), 180000 * 6);
  assert.equal(K.serviceValue(make('PRESTATION', (c) => { c.job.dateFin = ''; })), 180000);
});

test('bulletin d’honoraires mensuels : mois complet, prorata sur 30 jours, per diem', () => {
  const d = make('PRESTATION');
  let h = K.computeHonoraires(d, { periode: 'Décembre 2026' }); assert.equal(h.base, 180000); assert.equal(h.net, 180000); assert.ok(/Mois complet/.test(h.lines[0].detail));
  h = K.computeHonoraires(d, { periode: 'Décembre 2026', jours: 15 }); assert.equal(h.base, 90000); h = K.computeHonoraires(d, { jours: 10 }); assert.equal(h.base, 60000);
  h = K.computeHonoraires(d, { periode: 'x', nuitees: 4 }); assert.equal(h.perdiem, 120000); assert.equal(h.net, 300000); assert.equal(h.netEnLettres, 'trois cent mille');
});

test('bulletin d’honoraires : échéance d’un prix global, solde, règlement partiel', () => {
  const d = make('LDC', (c) => { c.service.remunMode = 'global'; c.service.montant = 2000000; c.service.perdiem = 0; c.service.jalons = K.parseJalons('30 | Livrable 1\n40 | Livrable 2\n30 | Livrable 3'); });
  const h = K.computeHonoraires(d, { periode: 'Livrable 2', jalon: 1 }); assert.equal(h.base, 800000); assert.ok(/Échéance 2/.test(h.lines[0].label));
  assert.equal(K.computeHonoraires(d, { periode: 'x', jalon: 0 }).net, 600000);
  const sans = make('LDC', (c) => { c.service.remunMode = 'global'; c.service.montant = 1000000; });
  assert.equal(K.computeHonoraires(sans, { periode: 'Solde' }).net, 1000000); assert.equal(K.computeHonoraires(sans, { periode: 'Acompte', montantSaisi: 400000 }).net, 400000); assert.equal(K.computeHonoraires(sans, { periode: 'x', montantSaisi: 9e9 }).net, 1000000);   // plafonné au prix
});

test('retenue à la source : déduite si brut, supportée par l’entreprise si net ; TVA si hors taxes', () => {
  const brut = make('PRESTATION', (c) => { c.service.nature = 'brut'; c.service.perdiem = 0; }), r = { periode: 'Janvier', retenuePct: 5 };
  let h = K.computeHonoraires(brut, r); assert.equal(h.retenue, 9000); assert.equal(h.net, 171000);
  const net = make('PRESTATION', (c) => { c.service.nature = 'net'; c.service.perdiem = 0; }); h = K.computeHonoraires(net, r); assert.equal(h.retenueSupportee, 9000); assert.equal(h.net, 180000); assert.ok(h.lines.some((l) => l.info === 9000));
  const ht = make('PRESTATION', (c) => { c.service.nature = 'ht'; c.service.perdiem = 0; }); h = K.computeHonoraires(ht, { periode: 'x', tvaPct: 18 }); assert.equal(h.tva, 32400); assert.equal(h.net, 212400);
  assert.equal(K.computeHonoraires(make('PRESTATION', (c) => { c.service.nature = 'ttc'; }), { periode: 'x', tvaPct: 18 }).tva, 0);
});

test('pénalités de retard prévues au contrat : calculées, plafonnées, ignorées si non prévues', () => {
  const d = make('PRESTATION', (c) => { c.service.remunMode = 'global'; c.service.montant = 1000000; c.service.perdiem = 0; c.service.penaliteTaux = 1; c.service.penalitePlafond = 10; });
  assert.equal(K.computeHonoraires(d, { periode: 'x', penaliteJours: 20 }).penalites, 20000); assert.equal(K.computeHonoraires(d, { periode: 'x', penaliteJours: 500 }).penalites, 100000);
  d.service.penaliteTaux = 0; assert.equal(K.computeHonoraires(d, { periode: 'x', penaliteJours: 20 }).penalites, 0);
  assert.ok(K.validatePaiement(d, { periode: 'x', penaliteJours: 20 }).warnings.some((w) => /Aucune pénalité/.test(w)));
});

test('validation du bulletin : période, jours, échéance, taux', () => {
  const m = make('PRESTATION'); assert.ok(K.validatePaiement(m, {}).errors.some((e) => /période/i.test(e))); assert.ok(K.validatePaiement(m, { periode: 'x', jours: 31 }).errors.some((e) => /entre 1 et 30/.test(e)));
  assert.ok(K.validatePaiement(m, { periode: 'x', retenuePct: 120 }).errors.some((e) => /0 et 100/.test(e))); assert.equal(K.validatePaiement(m, { periode: 'x', retenuePct: 5 }).valid, true);
  assert.ok(K.validatePaiement(m, { periode: 'x' }).warnings.some((w) => /DGID/.test(w)));
  const g = make('LDC', (c) => { c.service.remunMode = 'global'; c.service.jalons = K.parseJalons('50 | A\n50 | B'); }); assert.ok(K.validatePaiement(g, { periode: 'x', jalon: '' }).errors.some((e) => /échéance/i.test(e))); assert.equal(K.validatePaiement(g, { periode: 'x', jalon: 0 }).valid, true);
});

test('document « Bulletin de paiement d’honoraires » : ce n’est pas un bulletin de salaire', () => {
  const d = make('PRESTATION'), rec = { numero: 'PS-2026-001/01', date: '2026-12-31', periode: 'Décembre 2026', jours: 20, nuitees: 2, retenuePct: 5 }, t = text(d, rec);
  ['BULLETIN DE PAIEMENT', 'ce document n’est pas un bulletin de salaire', 'PS-2026-001/01', 'Projet Alpha', 'ANAT', 'Décembre 2026', 'prorata', 'Per diem', 'Retenue à la source (5 %)', 'NET À PAYER', 'Bon pour acquit', 'francs CFA'].forEach((s) => assert.ok(t.includes(s), s));
  assert.ok(!/IPRES|CSS|TRIMF|CFCE|cotisation salariale|salaire de base/i.test(t), 'aucune rubrique de salaire');
  const h = K.computeHonoraires(d, rec); assert.ok(t.includes(h.netEnLettres + ' francs CFA'));
});

test('bulletin : Word généré, texte identique à l’aperçu, nom de fichier', () => {
  const d = make('LDC', (c) => { c.service.remunMode = 'global'; c.service.montant = 2000000; c.service.jalons = K.parseJalons('50 | Livrable 1\n50 | Livrable 2'); }), rec = { numero: 'LDC-2026-001/01', date: '2026-12-31', periode: 'Livrable 1 – rapport de démarrage', jalon: 0, retenuePct: 0 };
  const zip = X.modelDocx(X.honorairesModel(d, rec), { title: 't' }); assert.ok(zip.length > 1500);
  const html = X.modelHtml(X.honorairesModel(d, rec)).replace(/<span class="cx-pn">.*?<\/span>/g, '').replace(/<[^>]+>/g, '');
  assert.ok(html.replace(/[\s ]+/g, '').includes('1000000')); assert.equal(X.fileNamePaiement(d, rec), 'BulletinHonoraires_SarrMameAwa_Livrable1rapportdedemarrage.docx');
  assert.equal(X.fileNamePaiement(d, {}), 'BulletinHonoraires_SarrMameAwa_paiement.docx');
});

test('projet dans les documents ; contrats enregistrés avant la mise à jour restent lisibles', () => {
  const t = (d) => X.contractModel(d).blocks.map((b) => (b.k === 'p' ? b.r.map((r) => r.t).join('') : b.k === 'tab' ? b.rows.flat(2).map((r) => r.t).join(' ') : '')).join('\n');
  assert.ok(t(make('PRESTATION')).includes('s’inscrit dans le projet « Projet Alpha »')); assert.ok(t(make('LDC')).includes('Projet Alpha'));
  const old = K.normalize({ worker: { nom: 'A', prenoms: 'B' }, job: { type: 'LDC' } }, company); assert.ok(Array.isArray(old.paiements) && old.service.projet === '');
});

test('DMT : libellés mis à jour (dépôt à l’inspection, travailleur étranger), plus d’ancien régime', () => {
  const all = LAY.cells.map((c) => String(c[2] == null ? '' : c[2])).join('\n');
  ['Article 363', "dépôt du contrat à l'inspection (art. 93, 99)", 'Si le travailleur est étranger (article 105 du Code du Travail)', 'visa du contrat (étranger : art. 105 ; jeune : art. 106)', 'art. 363 du Code du Travail ; contenu fixé par arrêté du ministre du Travail'].forEach((s) => assert.ok(all.includes(s), s));
  assert.ok(!/Section locale|Bureau Central|journaliers|manœuvres ordinaires|article 107|tyravailleur|visa d'approbation|visa d'enregistrement/i.test(all));
});
