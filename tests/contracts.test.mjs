import test from 'node:test';
import assert from 'node:assert/strict';
await import('../contracts-core.js');
const C = globalThis.CorintaContracts;

const company = { id: 'c1', name: 'Cabinet Test', employer: 'Cabinet Test SARL', profile: { siege: 'Dakar, Almadies', representant: 'Madame A. B.', qualite: 'gérante', ville: 'Dakar' } };
const filled = () => {
  const c = C.blankContract(company, '2026-10-23');
  Object.assign(c.worker, { nom: 'Diop', prenoms: 'Awa Marie', naissance: '1990-05-12', lieuNaissance: 'Thiès', pere: 'Samba Diop', mere: 'Fatou Ba', domicile: 'Dakar', famille: 'marie', enfants: 2 });
  Object.assign(c.job, { emploi: 'Comptable', classification: '7ème B', dateEngagement: '2026-11-01', essaiMois: 3 });
  Object.assign(c.salary, { base: 113984, sursalaire: 203389, transport: 26000, anciennetePct: 0 });
  return c;
};

test('contrat vierge : pré-rempli avec le profil de l’entreprise', () => {
  const c = C.blankContract(company, '2026-10-23');
  assert.equal(c.employer.name, 'Cabinet Test SARL'); assert.equal(c.employer.siege, 'Dakar, Almadies'); assert.equal(c.job.lieuSignature, 'Dakar'); assert.equal(c.job.type, 'CDI');
  assert.equal(c.clauses.references.length, 4);
});

test('validation : champs obligatoires et dates', () => {
  const v = C.validate(C.blankContract(company, '')); assert.equal(v.valid, false); assert.ok(v.errors.length >= 5);
  assert.equal(C.validate(filled()).valid, true);
  const cdd = filled(); cdd.job.type = 'CDD'; assert.equal(C.validate(cdd).valid, false);
  cdd.job.dateFin = '2026-10-01'; assert.equal(C.validate(cdd).valid, false); cdd.job.dateFin = '2027-05-01'; assert.equal(C.validate(cdd).valid, true);
  const young = filled(); young.worker.naissance = '2020-01-01'; assert.equal(C.validate(young).valid, false);
});

test('salaires : brut du contrat (transport compris) et brut DMT (hors transport, comme le modèle)', () => {
  const t = C.salaryTotals(filled().salary);
  assert.equal(t.brutContrat, 113984 + 203389 + 26000); assert.equal(t.brutDmt, 113984 + 203389);
  assert.equal(C.salaryTotals({ base: 623511, sursalaire: 125000, logement: 0, anciennetePct: 18.56, transport: 26000 }).brutDmt, 623511 + 125000 + Math.round(623511 * 18.56 / 100));
});

test('période d’essai : dernier jour = engagement + n mois − 1 jour', () => {
  assert.equal(C.trialEnd(filled()), '2027-01-31');
  const c = filled(); c.job.dateEngagement = '2026-11-30'; c.job.essaiMois = 3; assert.equal(C.trialEnd(c), '2027-02-27');
  c.job.essaiMois = 0; assert.equal(C.trialEnd(c), '');
});

test('numérotation par entreprise et par année', () => {
  assert.equal(C.nextNumber([], '2026-10-23'), 'CT-2026-001');
  assert.equal(C.nextNumber([{ number: 'CT-2026-001' }, { number: 'CT-2026-007' }, { number: 'CT-2025-099' }], '2026-12-01'), 'CT-2026-008');
});

test('DMT : toutes les informations du contrat sont reprises, les compléments restent séparés', () => {
  const c = filled(); c.dmt = { cni: '1 913 199 700 945', ccpf: '123' };
  const v = C.dmtView(c, company), s = v.synced;
  assert.equal(s.nom, 'DIOP'); assert.equal(s.prenoms, 'Awa Marie'); assert.equal(s.naissance, '1990-05-12'); assert.equal(s.lieuNaissance, 'Thiès');
  assert.equal(s.pere, 'Samba Diop'); assert.equal(s.famille, 'Marié(e)'); assert.equal(s.enfants, 2); assert.equal(s.epouses, 1);
  assert.equal(s.dateEntree, '2026-11-01'); assert.equal(s.emploi, 'Comptable'); assert.equal(s.profession, 'Comptable'); assert.equal(s.categorie, '7ème B');
  assert.equal(s.raisonSociale, 'Cabinet Test SARL'); assert.equal(s.adresseEtablissement, 'Dakar, Almadies'); assert.equal(s.type, 'CDI');
  assert.equal(s.base, 113984); assert.equal(s.sursalaire, 203389); assert.equal(s.brut, 317373); assert.equal(s.transport, 26000);
  assert.equal(v.extra.cni, '1 913 199 700 945'); assert.equal(v.extra.objet, 'Embauchage');
  // une modification du contrat se répercute aussitôt sur la DMT
  c.worker.nom = 'Ndiaye'; c.salary.base = 200000; const s2 = C.dmtView(c, company).synced; assert.equal(s2.nom, 'NDIAYE'); assert.equal(s2.base, 200000);
  assert.ok(C.dmtMissing(c, company).includes('N° d’immatriculation IPRES (A.G.R.O.M.)'));
});

test('alertes de gestion', () => {
  const c = filled(); c.dmt = { status: 'établie' };
  assert.deepEqual(C.alertsOf([c], '2026-10-23'), []);
  assert.ok(C.alertsOf([c], '2027-01-20').some((a) => /période d’essai/.test(a.text)));
  const cdd = filled(); cdd.job.type = 'CDD'; cdd.job.dateFin = '2026-11-10'; cdd.dmt = { status: 'établie' };
  assert.ok(C.alertsOf([cdd], '2026-11-01').some((a) => /CDD/.test(a.text)));
  assert.ok(C.alertsOf([cdd], '2026-11-20').some((a) => a.level === 'late'));
  assert.ok(C.alertsOf([filled()], '2026-10-23').some((a) => /DMT à établir/.test(a.text)));
  const done = filled(); done.status = 'terminé'; assert.deepEqual(C.alertsOf([done], '2026-10-23'), []);
});

test('normalisation des anciens enregistrements', () => {
  const n = C.normalize({ id: 'x', worker: { nom: 'A' }, status: 'inconnu' }, company);
  assert.equal(n.worker.nom, 'A'); assert.equal(n.worker.nationalite, 'Sénégalaise'); assert.equal(n.status, 'brouillon'); assert.ok(n.clauses.discipline.length > 20);
});
