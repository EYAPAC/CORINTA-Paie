import test from 'node:test';
import assert from 'node:assert/strict';
await import('../contracts-core.js');
await import('../dmt-layout.js');
await import('../contracts-export.js');
await import('../contracts-services-doc.js');
const K = globalThis.CorintaContracts, X = globalThis.CorintaContractsExport;

function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder(), out = {};
  const end = u8.length - 22; assert.equal(dv.getUint32(end, true), 0x06054b50);
  const n = dv.getUint16(end + 10, true); let p = dv.getUint32(end + 16, true);
  for (let i = 0; i < n; i++) {
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const ll = dv.getUint16(off + 26, true), data = u8.subarray(off + 30 + ll, off + 30 + ll + size);
    assert.equal(X.crc32(data), crc, 'CRC32 de ' + name); out[name] = dec.decode(data); p += 46 + nl;
  }
  return out;
}
const wtext = (xml) => (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((s) => s.replace(/<[^>]+>/g, '')).join('');
const company = { name: 'MSA Associés', profile: { alias: 'MSA', siege: 'VDN Bande Verte, Dakar', representant: 'Monsieur Malick SOW', qualite: 'Directeur Général' } };

function stage(over) {
  const d = K.blankContract(company, '2026-11-06'); K.switchType(d, 'STAGE'); d.id = 'st1';
  Object.assign(d.worker, { civilite: 'Mademoiselle', sexe: 'F', nom: 'DIA', prenoms: 'Ndèye Awa Soukeyna', naissance: '2005-03-30', lieuNaissance: 'Saint-Louis', domicile: 'Dakar, Ouakam' });
  Object.assign(d.job, { dateEngagement: '2026-11-09', dateFin: '2027-05-08', dateContrat: '2026-11-06', lieuSignature: 'Dakar' });
  Object.assign(d.service, { cin: '2 251 2005 08490', alias: 'MSA' });
  Object.assign(d.stage, { indemnite: 120000, maitre: 'Chef de projet / Responsable de la communication', taches: ['Création de contenus', 'Animation des réseaux sociaux'], pole: 'pôle de gestion des projets' });
  if (over) over(d); return d;
}

test('le type STAGE existe, sans DMT ni projet obligatoire', () => {
  assert.equal(K.TYPE_LABEL.STAGE, 'Contrat de stage'); assert.ok(K.isStage('STAGE')); assert.ok(K.isAlt('STAGE')); assert.ok(!K.isService('STAGE'));
  const d = stage(); assert.equal(K.validate(d).valid, true, JSON.stringify(K.validate(d).errors)); assert.equal(d.job.essaiMois, 0);
});

test('validation du stage : dates, nom, rappel art. 183, horaire > 40 h', () => {
  const d = stage((x) => { x.job.dateFin = '2026-10-01'; x.stage.heuresSemaine = 45; x.worker.nom = ''; });
  const v = K.validate(d); assert.ok(!v.valid); assert.ok(v.errors.some((e) => /postérieure/.test(e))); assert.ok(v.errors.some((e) => /nom/.test(e)));
  assert.ok(v.warnings.some((w) => /241/.test(w))); assert.ok(K.validate(stage()).warnings.some((w) => /183/.test(w) && /inspection/.test(w)));
});

test('document de stage : Times New Roman 11, articles numérotés, clauses légales, champs variables', () => {
  const m = X.contractModel(stage()); assert.equal(m.font, 'Times New Roman'); assert.equal(m.sz, 11);
  const html = X.modelHtml(m).split(String.fromCharCode(160)).join(' ').split(String.fromCharCode(8239)).join(' ').replace(/&nbsp;/g, ' ');
  for (const t of ['CONTRAT DE STAGE', 'Mademoiselle', 'DIA', 'Saint-Louis', '2 251 2005 08490', 'Dakar, Ouakam', 'la Stagiaire', '120 000', 'Cent vingt mille', 'Chef de projet / Responsable de la communication', 'article 183', 'article 387', 'article 301', 'Article 1', 'Article 10', 'inspection du travail', 'sept (07)'])
    assert.ok(html.toLowerCase().includes(t.toLowerCase()), 'manque : ' + t);
  assert.ok(!/diplôm/i.test(html), 'la condition de diplôme ne doit pas apparaître');
  assert.ok(!/MSA Associés.*(prestataire)/i.test(html));
});

test('genre : le stagiaire masculin est accordé', () => {
  const html = X.modelHtml(X.contractModel(stage((d) => { d.worker.sexe = 'M'; d.worker.civilite = 'Monsieur'; })));
  assert.ok(/Le Stagiaire|le Stagiaire/.test(html)); assert.ok(!/la Stagiaire/.test(html));
});

test('Word du stage : ZIP valide et texte présent', () => {
  const d = stage(), files = unzip(X.modelDocx(X.contractModel(d), { title: 'Stage' })); const xml = files['word/document.xml'];
  assert.ok(wtext(xml).includes('CONTRAT DE STAGE')); assert.ok(wtext(xml).includes('DIA')); assert.ok(/Times New Roman/.test(files['word/styles.xml'] || xml));
  assert.equal(X.fileName('contract', d), 'ContratStage_' + X.fileName('contract', d).slice('ContratStage_'.length)); assert.ok(X.fileName('contract', d).startsWith('ContratStage_'));
});

test('indemnité : prorata sur 30 jours, frais de déplacement, retenue', () => {
  const d = stage(), full = K.computeIndemnite(d, { periode: 'Novembre 2026' });
  assert.equal(full.net, 120000); assert.equal(full.netEnLettres.toLowerCase().includes('cent vingt mille'), true);
  const part = K.computeIndemnite(d, { periode: 'Nov', jours: 15, frais: 5000, retenuePct: 10 });
  assert.equal(part.base, 60000); assert.equal(part.retenue, 6000); assert.equal(part.net, 59000);
  assert.ok(!K.validateIndemnite(d, { periode: '' }).valid); assert.ok(K.validateIndemnite(d, { periode: 'Nov', jours: 15 }).valid);
  d.stage.fraisDeplacement = false; assert.equal(K.computeIndemnite(d, { periode: 'N', frais: 5000 }).net, 120000);
});

test('état de paiement de l’indemnité : document Word, pas un bulletin de salaire', () => {
  const d = stage(), rec = { id: 'p1', numero: 'CS-2026-001/01', periode: 'Novembre 2026', date: '2026-11-30', jours: 20 };
  const m = X.indemniteModel(d, rec), html = X.modelHtml(m).split(String.fromCharCode(160)).join(' ').split(String.fromCharCode(8239)).join(' ');
  assert.equal(m.font, 'Times New Roman'); assert.ok(/ÉTAT DE PAIEMENT/.test(html)); assert.ok(/pas un bulletin de salaire/.test(html)); assert.ok(html.includes('80 000'));
  assert.ok(X.fileNamePaiement(d, rec).startsWith('EtatPaiementStage_')); assert.ok(unzip(X.modelDocx(m, { title: 'x' }))['word/document.xml']);
});

test('numérotation : lettre de commande façon 114202403, stage 01/2026, suite continue sans remise à zéro', () => {
  assert.equal(K.numFormatFor({}, 'LDC').pattern, '{NNN}{AAAA}{MM}'); assert.equal(K.numFormatFor({}, 'LDC').scope, 'continu'); assert.equal(K.numFormatFor({}, 'STAGE').pattern, '{NN}/{AAAA}');
  assert.equal(K.numFormatFor({ numFormats: { LDC: { pattern: '{NN}-{AAAA}', scope: 'type' } } }, 'LDC').pattern, '{NN}-{AAAA}');
  const mk = (type, date) => { const d = K.blankContract(company, date); K.switchType(d, type); d.id = 'n' + Math.random(); const f = K.numFormatFor({}, type); Object.assign(d.service, { numPattern: f.pattern, numScope: f.scope, projet: 'P' }); Object.assign(d.worker, { nom: 'A', prenoms: 'B' }); Object.assign(d.job, { dateContrat: date, dateEngagement: date }); return d; };
  const list = []; const add = (d) => { d.service.numero = K.nextServiceNumber(list, d); list.push(d); return d.service.numero; };
  assert.equal(add(mk('LDC', '2024-03-10')), '001202403'); assert.equal(add(mk('LDC', '2024-05-02')), '002202405'); assert.equal(add(mk('LDC', '2025-01-15')), '003202501');
  assert.equal(add(mk('STAGE', '2026-11-09')), '01/2026'); assert.equal(add(mk('STAGE', '2026-12-09')), '02/2026'); assert.equal(add(mk('STAGE', '2027-01-09')), '01/2027');
});

test('LDC et prestation : Times New Roman 11 ; objet libre et fonction du prestataire', () => {
  const mk = (type) => { const d = K.blankContract(company, '2026-11-13'); K.switchType(d, type); Object.assign(d.worker, { nom: 'Sarr', prenoms: 'Awa' }); Object.assign(d.job, { dateEngagement: '2026-12-01', dateFin: '2027-05-31', emploi: 'Assistant de projet' }); Object.assign(d.service, { projet: 'P', intitule: 'Mission', montant: 1000, objet: 'À ce titre, le Prestataire apporte son appui au suivi du projet.' }); return d; };
  assert.equal(X.contractModel(mk('LDC')).font, 'Times New Roman'); assert.equal(X.contractModel(mk('LDC')).sz, 11);
  const html = X.modelHtml(X.contractModel(mk('PRESTATION'))); assert.ok(html.includes('apporte son appui au suivi du projet')); assert.ok(html.includes('Fonction')); assert.ok(html.includes('Assistant de projet'));
});

await import('../contracts-import.js');
const I = globalThis.CorintaContractsImport;
test('aller-retour : un contrat de stage généré se ré-importe sans perte', () => {
  const src = stage((d) => { d.service.numero = '03/2026'; });
  const files = unzip(X.modelDocx(X.contractModel(src), { title: 'Stage' })), [c] = I.extract(I.docxXmlToBlocks(files['word/document.xml'])), f = c.fields;
  assert.equal(f['job.type'], 'STAGE'); assert.equal(f['worker.nom'], 'DIA'); assert.equal(f['worker.civilite'], 'Mademoiselle'); assert.equal(f['worker.naissance'], '2005-03-30'); assert.equal(f['worker.lieuNaissance'], 'Saint-Louis');
  assert.equal(f['service.cin'], '2 251 2005 08490'); assert.equal(f['worker.domicile'], 'Dakar, Ouakam'); assert.equal(f['job.dateEngagement'], '2026-11-09'); assert.equal(f['job.dateFin'], '2027-05-08');
  assert.equal(f['stage.indemnite'], 120000); assert.equal(f['service.numero'], '03/2026'); assert.equal(f['job.lieuSignature'], 'Dakar'); assert.equal(f['job.dateContrat'], '2026-11-06');
  assert.deepEqual(f['stage.taches'], src.stage.taches); assert.ok(/Chef de projet/.test(f['stage.maitre'])); assert.ok(!('service.taches' in f));
});

test('anciens contrats : la normalisation ajoute les paramètres de stage sans rien casser', () => {
  const old = { id: 'x', job: { type: 'CDI' }, worker: { nom: 'A' } }, n = K.normalize(old, company);
  assert.equal(n.stage.heuresSemaine, 40); assert.equal(n.stage.preavis, 7); assert.ok(n.stage.clauses.formalites.includes('183'));
});
