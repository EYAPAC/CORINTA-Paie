import test from 'node:test';
import assert from 'node:assert/strict';
await import('../contracts-core.js');
await import('../dmt-layout.js');
await import('../contracts-export.js');
await import('../contracts-services-doc.js');
const K = globalThis.CorintaContracts, X = globalThis.CorintaContractsExport;

let seq = 0;
const company = { name: 'Cabinet Test', profile: { alias: 'CT' } };
function make(type, over) {
  const d = K.blankContract(company, '2026-11-13'); K.switchType(d, type); d.id = 'id' + (++seq);
  Object.assign(d.worker, { nom: 'Sarr', prenoms: 'Awa' }); Object.assign(d.job, { dateEngagement: '2026-12-01', dateFin: '2027-05-31' }); Object.assign(d.service, { projet: 'Projet A', intitule: 'Mission', montant: 100000 });
  if (over) over(d); return d;
}
/** Enregistre le document comme le fait l'interface : numéro automatique calculé sur les documents déjà enregistrés. */
function save(list, d) { if (!String(d.service.numero || '').trim()) d.service.numero = K.nextServiceNumber(list, d); list.push(d); return d; }

test('numéros automatiques à la suite : 01, 02, 03…', () => {
  const list = []; const n = [1, 2, 3].map(() => save(list, make('LDC')).service.numero);
  assert.deepEqual(n, ['01/2026', '02/2026', '03/2026']);
});

test('chaque type de document a sa propre suite (lettre de commande / contrat de prestation)', () => {
  const list = []; save(list, make('LDC')); save(list, make('LDC'));
  assert.equal(save(list, make('PRESTATION')).service.numero, '01/2026'); assert.equal(save(list, make('LDC')).service.numero, '03/2026'); assert.equal(save(list, make('PRESTATION')).service.numero, '02/2026');
});

test('la suite repart à 01 chaque année (selon la date du document)', () => {
  const list = []; save(list, make('LDC')); save(list, make('LDC'));
  assert.equal(save(list, make('LDC', (c) => { c.job.dateContrat = '2027-01-10'; })).service.numero, '01/2027');
  assert.equal(save(list, make('LDC', (c) => { c.job.dateContrat = '2027-02-10'; })).service.numero, '02/2027'); assert.equal(save(list, make('LDC', (c) => { c.job.dateContrat = '2026-12-31'; })).service.numero, '03/2026');
});

test('suite « par projet » : 01 pour chaque projet', () => {
  const list = [], pr = (p) => (c) => { c.service.projet = p; c.service.numScope = 'projet'; };
  assert.equal(save(list, make('LDC', pr('Alpha'))).service.numero, '01/2026'); assert.equal(save(list, make('LDC', pr('Alpha'))).service.numero, '02/2026');
  assert.equal(save(list, make('LDC', pr('Beta'))).service.numero, '01/2026'); assert.equal(save(list, make('LDC', pr('alpha'))).service.numero, '03/2026');   // casse ignorée
});

test('numéro corrigé à la main : conservé, et la suite continue après le plus grand compteur', () => {
  const list = []; save(list, make('LDC')); const m = save(list, make('LDC', (c) => { c.service.numero = '07/2026'; c.service.numeroAuto = false; }));
  assert.equal(m.service.numero, '07/2026'); assert.equal(save(list, make('LDC')).service.numero, '08/2026');
  const libre = save(list, make('LDC', (c) => { c.service.numero = 'LC-ANAT-2024'; c.service.numeroAuto = false; })); assert.equal(libre.service.numero, 'LC-ANAT-2024');   // format libre : ignoré pour la suite
  assert.equal(save(list, make('LDC')).service.numero, '09/2026');
});

test('formats personnalisables : {NN}, {NNN}, {N}, {AAAA}, {AA}, {MM}, {TYPE} ; compteur obligatoire', () => {
  assert.equal(K.formatNumero('{NNN}/{AA}', 7, '2026-03-09', 'LDC'), '007/26'); assert.equal(K.formatNumero('{TYPE}-{AAAA}{MM}-{N}', 12, '2026-03-09', 'LDC'), 'LDC-202603-12'); assert.equal(K.formatNumero('{TYPE}-{N}', 3, '2026-03-09', 'PRESTATION'), 'CPS-3');
  assert.equal(K.formatNumero('ANAT', 4, '2026-03-09', 'LDC'), 'ANAT-04'); assert.equal(K.formatNumero('', 1, '2026-03-09', 'LDC'), '01/2026');   // sans compteur : « -{NN} » ajouté ; format vide : format par défaut
  assert.deepEqual(K.numeroSeq('LDC-2026-012', 'LDC-{AAAA}-{NNN}'), { seq: 12, year: '2026' }); assert.deepEqual(K.numeroSeq('5/26', '{N}/{AA}'), { seq: 5, year: '2026' }); assert.equal(K.numeroSeq('abc', '{NN}/{AAAA}'), null);
  const list = []; const f = (c) => { c.service.numPattern = '{TYPE}-{AAAA}-{NNN}'; }; assert.equal(save(list, make('LDC', f)).service.numero, 'LDC-2026-001'); assert.equal(save(list, make('LDC', f)).service.numero, 'LDC-2026-002');
  const sansAnnee = []; const g = (c) => { c.service.numPattern = 'N°{NN}'; }; save(sansAnnee, make('LDC', g)); assert.equal(save(sansAnnee, make('LDC', (c) => { g(c); c.job.dateContrat = '2030-01-01'; })).service.numero, 'N°02');   // sans année : la suite ne repart pas
});

test('doublons détectés (même type ; même projet si suite par projet)', () => {
  const list = []; const a = save(list, make('LDC')); const b = make('LDC', (c) => { c.service.numero = '01/2026'; c.service.numeroAuto = false; });
  assert.equal(K.duplicateNumero(list, b).id, a.id); assert.equal(K.duplicateNumero(list, a), null);                       // un document ne se compare pas à lui-même
  assert.equal(K.duplicateNumero(list, make('PRESTATION', (c) => { c.service.numero = '01/2026'; })), null);               // autre type : pas de conflit
  const p = make('LDC', (c) => { c.service.numero = '01/2026'; c.service.numScope = 'projet'; c.service.projet = 'Autre projet'; }); assert.equal(K.duplicateNumero(list, p), null);
  assert.equal(K.duplicateNumero(list, make('LDC', (c) => { c.service.numero = ''; })), null);
});

test('contrats enregistrés avant la numérotation : numéro saisi conservé (jamais recalculé), numéro vide généré', () => {
  const avecNumero = K.normalize({ worker: { nom: 'A', prenoms: 'B' }, job: { type: 'LDC' }, service: { numero: '01032024' } }, company); assert.equal(avecNumero.service.numeroAuto, false); assert.equal(avecNumero.service.numero, '01032024');
  const sans = K.normalize({ worker: { nom: 'A', prenoms: 'B' }, job: { type: 'LDC' } }, company); assert.equal(sans.service.numeroAuto, true); assert.equal(sans.service.numPattern, '{NN}/{AAAA}'); assert.equal(sans.service.numScope, 'type');
  assert.equal(K.blankContract({ name: 'X', profile: { numPattern: '{TYPE}-{NN}', numScope: 'projet' } }, '').service.numPattern, '{TYPE}-{NN}');   // réglages mémorisés pour les prochains documents
});

test('le numéro apparaît dans les documents : lettre de commande (titre), contrat de prestation (sous le titre), bulletin', () => {
  const txt = (d) => X.contractModel(d).blocks.map((b) => (b.k === 'p' ? b.r.map((r) => r.t).join('') : b.k === 'box' ? b.lines.join(' ') : '')).join('\n');
  const l = make('LDC', (c) => { c.service.numero = '05/2026'; }); assert.ok(txt(l).includes('LETTRE DE COMMANDE DE SERVICES N° 05/2026'));
  const p = make('PRESTATION', (c) => { c.service.numero = '03/2026'; }); assert.ok(txt(p).includes('Contrat n° 03/2026')); assert.ok(!txt(make('PRESTATION', (c) => { c.service.numero = ''; })).includes('Contrat n°'));
  l.number = 'LDC-2026-001'; const b = X.honorairesModel(l, { numero: 'LDC-2026-001/01', date: '2026-12-31', periode: 'x' }).blocks.find((k) => k.k === 'tab').rows.flat(2).map((r) => r.t).join(' '); assert.ok(b.includes('n° 05/2026'));
});
