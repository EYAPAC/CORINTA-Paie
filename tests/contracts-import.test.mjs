import test from 'node:test';
import assert from 'node:assert/strict';
await import('../contracts-import.js');
await import('../contracts-core.js');
const I = globalThis.CorintaContractsImport, K = globalThis.CorintaContracts;

/* Contrat Word reconstitué sur le modèle du cabinet (données fictives). */
const p = (t) => '<w:p><w:r><w:t xml:space="preserve">' + t + '</w:t></w:r></w:p>';
const DOCX = '<w:document><w:body>' + [
  'CONTRAT DE TRAVAIL', 'A DUREE INDETERMINEE', 'Entre les Soussignés :',
  'Le Cabinet Test dont le siège social est situé à Dakar, Immeuble Atlantis, Almadies, représenté par Madame Awa DIOP, en sa qualité de gérante',
  'Monsieur,', 'Nom : _________________ SOW ____________', 'Prénoms : ____________ ABDOU KARIM ___________',
  'Date et Lieu de Naissance : ______ 08/03/1983 à Dakar_____', 'Nationalité : ______ Sénégalais ______', 'Filiation : ______Fils de Samba SOW et Fatou BA_____',
  'Situation de Famille : ____Marié___ 02 enfants _____', 'Domicilié (e) : _____ 29 Zone A Grand Dakar _____',
  'I. EMPLOI TENU : ___ COMPTABLE ____', 'II. CLASSIFICATION PROFESSIONNELLE : ___7ème B de la convention du commerce___', "III. DATE DE L'ENGAGEMENT : ____ 01/04/2026 ____", 'IV. DUREE DU CONTRAT : ____ Durée Indéterminée ____',
  'Le présent contrat est conclu avec une période d’essai de trois (03) mois, renouvelable tacitement, au cours de laquelle chacune des parties pourra y mettre fin.',
  'L’horaire de travail est en principe de 40 heures par semaine, soit 173,33 le mois.',
  'Le salaire brut mensuel est ainsi décomposé :', 'Salaire de base         113984', 'Sursalaire              203389', 'Indemnité de transport  26000',
  'Le présent contrat est établi à Dakar en quatre (04) exemplaires originaux.', 'Dakar, le 01 Avril 2026'
].map(p).join('') + '</w:body></w:document>';

test('Word : le contrat type est lu paragraphe par paragraphe', () => {
  const [c] = I.extract(I.docxXmlToBlocks(DOCX)), f = c.fields;
  assert.equal(f['worker.nom'], 'SOW'); assert.equal(f['worker.prenoms'], 'ABDOU KARIM'); assert.equal(f['worker.civilite'], 'Monsieur'); assert.equal(f['worker.sexe'], 'M');
  assert.equal(f['worker.naissance'], '1983-03-08'); assert.equal(f['worker.lieuNaissance'], 'Dakar'); assert.equal(f['worker.nationalite'], 'Sénégalais');
  assert.equal(f['worker.pere'], 'Samba SOW'); assert.equal(f['worker.mere'], 'Fatou BA'); assert.equal(f['worker.famille'], 'marie'); assert.equal(f['worker.enfants'], 2);
  assert.equal(f['worker.domicile'], '29 Zone A Grand Dakar');
  assert.equal(f['job.emploi'], 'COMPTABLE'); assert.equal(f['job.classification'], '7ème B de la convention du commerce'); assert.equal(f['job.dateEngagement'], '2026-04-01'); assert.equal(f['job.type'], 'CDI');
  assert.equal(f['job.essaiMois'], 3); assert.equal(f['job.essaiRenouvelable'], true); assert.equal(f['job.horaire'], 40);
  assert.equal(f['salary.base'], 113984); assert.equal(f['salary.sursalaire'], 203389); assert.equal(f['salary.transport'], 26000);
  assert.equal(f['employer.name'], 'Cabinet Test'); assert.equal(f['employer.siege'], 'Dakar, Immeuble Atlantis, Almadies'); assert.equal(f['employer.representant'], 'Madame Awa DIOP'); assert.equal(f['employer.qualite'], 'gérante');
  assert.equal(f['job.exemplaires'], 4); assert.equal(f['job.lieuSignature'], 'Dakar'); assert.equal(f['job.dateContrat'], '2026-04-01');
});

test('Word : tableau à deux colonnes (libellé | valeur) et entités XML', () => {
  const cell = (t) => '<w:tc>' + p(t) + '</w:tc>', row = (a, b) => '<w:tr>' + cell(a) + cell(b) + '</w:tr>';
  const xml = '<w:document><w:body><w:tbl>' + row('Nom', 'DIOP &amp; Fils') + row('Prénoms', 'Awa') + row('Emploi', 'Assistante RH') + row("Date d'embauche", '15/09/2026') + row('Salaire de base', '250 000 FCFA') + row('Transport', '26 000') + '</w:tbl></w:body></w:document>';
  const [c] = I.extract(I.docxXmlToBlocks(xml)), f = c.fields;
  assert.equal(f['worker.nom'], 'DIOP & Fils'); assert.equal(f['worker.prenoms'], 'Awa'); assert.equal(f['job.emploi'], 'Assistante RH'); assert.equal(f['job.dateEngagement'], '2026-09-15'); assert.equal(f['salary.base'], 250000); assert.equal(f['salary.transport'], 26000);
});

test('Excel : feuille à deux colonnes avec date numérique Excel', () => {
  const rows = [['Nom et prénoms', 'Awa DIOP'], ['Date de naissance', '33000'], ['Sexe', 'Féminin'], ['Situation matrimoniale', 'Célibataire'], ["Nombre d'enfants", '0'], ['Poste', 'Comptable'], ["Date d'engagement", '46113'], ['Salaire de base', '300000'], ["Prime d'ancienneté", '5 %']];
  const [c] = I.extract(I.rowsToBlocks(rows)), f = c.fields;
  assert.equal(f['worker.nom'], 'DIOP'); assert.equal(f['worker.prenoms'], 'Awa'); assert.equal(f['worker.naissance'], '1990-05-07'); assert.equal(f['worker.sexe'], 'F'); assert.equal(f['worker.famille'], 'celibataire'); assert.equal(f['worker.enfants'], 0);
  assert.equal(f['job.emploi'], 'Comptable'); assert.equal(f['job.dateEngagement'], '2026-04-01'); assert.equal(f['salary.base'], 300000); assert.equal(f['salary.anciennetePct'], 5);
});

test('Excel : tableau à en-têtes, une ligne par travailleur', () => {
  const rows = [['Nom', 'Prénoms', 'Emploi', "Date d'embauche", 'Salaire de base', 'Sursalaire', 'Transport'], ['SOW', 'Abdou', 'Chauffeur', '01/11/2026', '120000', '30000', '26000'], ['NDIAYE', 'Fatou', 'Secrétaire', '2026-12-01', '150 000', '', '26000']];
  const cands = I.extract(I.rowsToBlocks(rows));
  assert.equal(cands.length, 2); assert.equal(cands[0].fields['worker.nom'], 'SOW'); assert.equal(cands[0].fields['salary.sursalaire'], 30000); assert.equal(cands[1].fields['job.dateEngagement'], '2026-12-01'); assert.equal(cands[1].fields['salary.base'], 150000);
  assert.equal(cands[1].fields['salary.sursalaire'], undefined);
});

test('CSV et durée déterminée', () => {
  const rows = I.csvToRows('Nom;Prénoms;Durée du contrat\nSOW;Abdou;"CDD du 01/11/2026 au 30/04/2027"');
  const [c] = I.extract(I.rowsToBlocks([['Nom', 'Prénoms', 'Durée du contrat', 'Emploi'], ...rows.slice(1).map((r) => [...r, 'Vendeur'])]));
  assert.equal(c.fields['job.type'], 'CDD'); assert.equal(c.fields['job.dateEngagement'], '2026-11-01'); assert.equal(c.fields['job.dateFin'], '2027-04-30');
});

test('application au contrat : seules les valeurs retenues sont écrites, le contrat reste valide', () => {
  const [c] = I.extract(I.docxXmlToBlocks(DOCX)), draft = K.blankContract({ name: 'Cabinet Test SARL', profile: {} }, '2026-10-23');
  const applied = I.apply(draft, c.fields, ['worker.nom', 'worker.prenoms', 'job.emploi', 'job.dateEngagement', 'salary.base']);
  assert.deepEqual(applied.sort(), ['job.dateEngagement', 'job.emploi', 'salary.base', 'worker.nom', 'worker.prenoms']);
  assert.equal(draft.worker.nom, 'SOW'); assert.equal(draft.salary.base, 113984); assert.equal(draft.worker.domicile, '');
  assert.equal(K.validate(draft).valid, true);
  I.apply(draft, c.fields); assert.equal(draft.worker.famille, 'marie'); assert.equal(draft.job.essaiMois, 3);
});

test('un fichier sans information utile ne produit aucun candidat', () => {
  assert.deepEqual(I.extract(I.rowsToBlocks([['Facture', '123'], ['Total', '5000']])), []);
  assert.deepEqual(I.extract([]), []);
});
