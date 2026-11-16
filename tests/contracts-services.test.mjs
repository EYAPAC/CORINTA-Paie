import test from 'node:test';
import assert from 'node:assert/strict';
await import('../contracts-core.js');
await import('../contracts-import.js');
await import('../dmt-layout.js');
await import('../contracts-export.js');
await import('../contracts-services-doc.js');
const K = globalThis.CorintaContracts, I = globalThis.CorintaContractsImport, X = globalThis.CorintaContractsExport;

/* ───────── outils : lecture ZIP stocké (CRC32) et contrôle XML ───────── */
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
function wellFormed(xml) {
  const st = [], re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<[^>]*>|[^<]+/g; let m;
  while ((m = re.exec(xml.replace(/<\?xml[^>]*\?>/, '')))) {
    if (m[2] === undefined) { if (m[0].startsWith('<')) throw new Error('balise invalide : ' + m[0].slice(0, 50)); if (/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(m[0])) throw new Error('entité non échappée'); continue; }
    if (m[4]) continue; if (m[1]) assert.equal(st.pop(), m[2]); else st.push(m[2]);
  }
  assert.equal(st.length, 0);
}
const wtext = (xml) => (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((s) => s.replace(/<[^>]+>/g, '')).join('');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const docx = (d) => unzip(X.modelDocx(X.contractModel(d), { title: 't' }));
const company = { name: 'Cabinet Test & Associés', profile: { siege: 'Dakar, Almadies', representant: 'Monsieur Awa DIOP', qualite: 'Directeur', alias: 'CTA' } };

function make(type, over) {
  const d = K.blankContract(company, '2026-11-13'); K.switchType(d, type);
  Object.assign(d.worker, { civilite: 'Madame', sexe: 'F', nom: 'Sarr', prenoms: 'Mame Awa', naissance: '1990-05-12', lieuNaissance: 'Thiès', nationalite: 'Sénégalaise', domicile: '12 rue Test, Dakar' });
  Object.assign(d.job, { emploi: 'Assistante de projet', dateEngagement: '2026-12-01', dateFin: '2027-05-31', lieu: 'Kaffrine', lieuSignature: 'Dakar', dateContrat: '2026-11-20' });
  Object.assign(d.service, { projet: 'Projet Test', intitule: 'Appui à la mise en œuvre du plan d’action', client: 'AGEROUTE', contratPrincipal: 'Mission de maîtrise d’œuvre sociale', taches: ['Accueil des personnes affectées', 'Enregistrement des plaintes', 'Rédaction des rapports'], supervision: 'le Chef de mission adjoint', montant: 180000, remunMode: 'mensuel', nature: 'net', cin: '2 000 0000 00000', tel: '77 000 00 00' });
  if (over) over(d); return d;
}

test('montants en toutes lettres (accords de « vingt » et « cent », « mille » invariable)', () => {
  const W = K.amountWords;
  assert.equal(W(0), 'zéro'); assert.equal(W(21), 'vingt et un'); assert.equal(W(71), 'soixante et onze'); assert.equal(W(80), 'quatre-vingts'); assert.equal(W(81), 'quatre-vingt-un'); assert.equal(W(91), 'quatre-vingt-onze');
  assert.equal(W(200), 'deux cents'); assert.equal(W(201), 'deux cent un'); assert.equal(W(1000), 'mille'); assert.equal(W(1100), 'mille cent'); assert.equal(W(80000), 'quatre-vingt mille'); assert.equal(W(200000), 'deux cent mille');
  assert.equal(W(180000), 'cent quatre-vingt mille'); assert.equal(W(30000), 'trente mille'); assert.equal(W(2000000), 'deux millions'); assert.equal(W(1000000), 'un million'); assert.equal(W(80000000), 'quatre-vingts millions');
  assert.equal(W(2500000), 'deux millions cinq cent mille'); assert.equal(W(1e9), 'un milliard'); assert.equal(W(999999), 'neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf'); assert.equal(W(-5), '-5');
});

test('désignation courte et contractions (de / d’)', () => {
  assert.equal(K.deriveAlias('Cabinet Premium PME'), 'Premium PME'); assert.equal(K.deriveAlias(''), 'le Cabinet'); assert.ok(K.deriveAlias('Société Africaine de Conseil et de Gestion Immobilière').length <= 16);
  assert.equal(K.deAlias('MSA'), 'de MSA'); assert.equal(K.deAlias('Atlantis'), 'd’Atlantis');
});

test('types : prestation et lettre de commande sont des contrats de service, pas des CDI/CDD', () => {
  assert.equal(K.isService('PRESTATION'), true); assert.equal(K.isService('LDC'), true); assert.equal(K.isService('CDI'), false); assert.equal(K.isCdd('LDC'), false);
  const d = make('LDC'); assert.equal(d.job.exemplaires, 2); K.switchType(d, 'PRESTATION'); assert.equal(d.job.exemplaires, 4); K.switchType(d, 'CDI'); assert.equal(d.job.essaiMois, 3); assert.equal(d.job.type, 'CDI');
});

test('validation des prestations : champs obligatoires, échéances = 100 %, pas de salaire exigé', () => {
  const b0 = K.blankContract(company, ''); K.switchType(b0, 'PRESTATION'); const v0 = K.validate(b0);
  ['nom du prestataire', 'prénoms du prestataire', 'intitulé de la mission', 'projet', 'date de début', 'montant des honoraires'].forEach((k) => assert.ok(v0.errors.some((e) => e.toLowerCase().includes(k)), k));
  assert.ok(!v0.errors.some((e) => /salaire/i.test(e)));
  const d = make('PRESTATION'); assert.equal(K.validate(d).valid, true);
  d.service.jalons = K.parseJalons('30 | A\n40 | B'); assert.ok(K.validate(d).errors.some((e) => /100 %/.test(e)));
  d.service.jalons = K.parseJalons('30 | A\n40 | B\n30 | C'); assert.equal(K.validate(d).valid, true);
  d.job.dateFin = '2026-11-01'; assert.ok(K.validate(d).errors.some((e) => /postérieure/.test(e)));
  d.job.dateFin = '2027-05-31'; d.service.perdiem = -1; assert.ok(K.validate(d).errors.some((e) => /per diem/i.test(e)));
});

test('risque de requalification : honoraires mensuels fixes longs et vocabulaire de subordination signalés', () => {
  const d = make('PRESTATION'); assert.ok(K.validate(d).warnings.some((w) => /requalification/i.test(w)));   // 6 mois mensuels
  d.service.remunMode = 'global'; assert.ok(!K.validate(d).warnings.some((w) => /requalification/i.test(w)));
  d.service.supervision = 'sous la supervision directe du Chef de mission'; assert.ok(K.validate(d).warnings.some((w) => /subordination/i.test(w)));
});

test('échéances de paiement : calcul des montants et lecture du texte saisi', () => {
  const d = make('LDC', (c) => { c.service.remunMode = 'global'; c.service.montant = 2000000; c.service.jalons = K.parseJalons('30 | Livrable 1\n40 % Livrable 2\n30 Livrable 3'); });
  const t = K.serviceTotals(d); assert.deepEqual(t.jalons.map((x) => x.montant), [600000, 800000, 600000]); assert.equal(t.pctTotal, 100); assert.equal(t.enLettres, 'deux millions');
  assert.equal(K.jalonsText(t.jalons).split('\n').length, 3);
});

test('numérotation par type, normalisation d’anciens contrats, alertes de fin de mission', () => {
  assert.equal(K.nextNumber([], '2026-11-13', 'LDC'), 'LDC-2026-001'); assert.equal(K.nextNumber([{ number: 'PS-2026-004' }], '2026-11-13', 'PRESTATION'), 'PS-2026-005'); assert.equal(K.nextNumber([{ number: 'CT-2026-009' }], '2026-11-13'), 'CT-2026-010');
  const old = K.normalize({ worker: { nom: 'A', prenoms: 'B' }, job: { type: 'CDI' }, salary: { base: 100000 } }, company); assert.ok(old.service && Array.isArray(old.service.taches) && old.service.clauses.nature);
  const d = make('LDC', (c) => { c.id = 'x'; c.job.dateFin = '2026-11-20'; });
  const al = K.alertsOf([d], '2026-11-13'); assert.ok(al.some((a) => /lettre de commande/i.test(a.text))); assert.ok(!al.some((a) => /DMT/.test(a.text)));
  d.job.dateFin = '2026-10-01'; assert.ok(K.alertsOf([d], '2026-11-13').some((a) => a.level === 'late'));
});

/* ───────── import des modèles Word (textes reconstitués, données fictives) ───────── */
const para = (t) => '<w:p><w:r><w:t xml:space="preserve">' + t.replace(/&/g, '&amp;') + '</w:t></w:r></w:p>';
const docXml = (lines) => '<w:document><w:body>' + lines.map(para).join('') + '</w:body></w:document>';
const PRESTA = ['Entre le cabinet TEST Associés société, ayant son siège social à la VDN Lot N°58, BP 24186, DAKAR, Sénégal Représenté (e) par Monsieur Awa DIOP, Directeur,', 'Ci-après dénommé (e) « TEST »,', 'Et',
  'Madame ___ Fatou SARR ____ Née le ___ 04/04/1997____à ___ Mbam_____ ci-après dénommée Prestataire titulaire du CIN N° 2 000 0000 00000 demeurant à ___ Mbam ___.', 'Il a été convenu et arrêté ce qui suit :',
  'TEST requiert les services de Madame Fatou SARR dénommé ici Prestataire Animateur de Projet', 'Le Cabinet TEST s’est vu confier par l’AGEROUTE, (ci-après dénommé le « CLIENT »), aux termes du contrat de prestation intitulé « MISSION DE MAÎTRISE D’ŒUVRE SOCIALE »',
  'Il assure, en particulier, les activités suivantes :', 'Suivre toutes les activités mises en œuvre', 'Gestion des expressions des besoins', 'Accueil et orientation des PAP', 'Enregistrement des plaintes', 'Article 3 : Responsabilités du cabinet',
  'Le montant des honoraires est fixé à la somme de Cent quatre-vingt Mille Francs (180000) Francs CFA net par mois de prestation effective.',
  'Les prestations consisteront en une mission sur Kaffrine. La date de démarrage de la mission du prestataire est le 01 Février 2024 au 01 Octobre 2024. Sa durée est de Huit (08) mois.',
  'chaque partie pourra à tout moment mettre fin au présent contrat en donnant à l’autre partie un préavis écrit de quinze (15) jours en ce sens', 'Fait à Dakar, le 02 Février 2024'];
const LDC = ['LETTRE DE COMMANDE DE SERVICES N°01032024', 'Date : Le 01 Mars 2024', 'Montant : 2 000 000 F CFA', 'Monsieur\t\t\t\t: Ibrahima TEST', 'Date et Lieu de Naissance \t\t: 10/02/1983 à RICHARD TOLL', 'Adresse \t\t\t\t: RUE BELFORT X MARZAT', 'Tél \t\t\t\t: 77 000 00 00', 'Mail \t\t\t\t: ibrahima.test@exemple.sn',
  'Titre de l’activité : « Etude de Faisabilité de la zone industrielle »', 'Durée des prestations \t:\t06 (Six) mois', 'Lieu d’exécution\t:\tBAMBILOR', 'Début d’exécution \t: \t01 Mars 2024',
  'MS & Associés requiert les services de Ibrahima TEST dénommé ici Prestataire dans le cadre de l’Etude de Faisabilité s’est vu confier par l’ANAT (ci-après dénommé le « CLIENT »), aux termes du contrat de prestation intitulé Etude de Faisabilité de la zone industrielle',
  'Les tâches de l’ingénieur HSE sont les suivantes :', 'Analyse de la documentation sur le projet,', 'Rencontre avec les acteurs', 'Animation d’atelier ;', 'Article 3 : Durée et lieu des prestations',
  'Le montant de la prestation est fixé, à Deux Millions francs CFA (2.000.000) représentant l’honoraire global pour toute la durée de la mission',
  'Le Cabinet MSA versera directement au consultant des perdiem, au taux maximal de trente mille francs (30.000) CFA par nuitée passée sur le terrain', 'Fait en deux exemplaires originaux à Dakar le 01 Mars 2024'];

test('import d’un contrat de prestation Word : identité, mission, honoraires, durée, tâches', () => {
  const [c] = I.extract(I.docxXmlToBlocks(docXml(PRESTA))), f = c.fields;
  assert.equal(f['job.type'], 'PRESTATION'); assert.equal(f['worker.civilite'], 'Madame'); assert.equal(f['worker.sexe'], 'F'); assert.equal(f['worker.nom'], 'SARR'); assert.equal(f['worker.prenoms'], 'Fatou'); assert.equal(f['worker.naissance'], '1997-04-04'); assert.equal(f['worker.lieuNaissance'], 'Mbam');
  assert.equal(f['service.cin'], '2 000 0000 00000'); assert.equal(f['worker.domicile'], 'Mbam'); assert.equal(f['job.emploi'], 'Animateur de Projet'); assert.equal(f['service.client'], 'AGEROUTE'); assert.equal(f['service.contratPrincipal'], 'MISSION DE MAÎTRISE D’ŒUVRE SOCIALE');
  assert.equal(f['service.montant'], 180000); assert.equal(f['service.nature'], 'net'); assert.equal(f['service.remunMode'], 'mensuel'); assert.equal(f['job.lieu'], 'Kaffrine'); assert.equal(f['job.dateEngagement'], '2024-02-01'); assert.equal(f['job.dateFin'], '2024-10-01'); assert.equal(f['service.preavis'], 15);
  assert.deepEqual(f['service.taches'], ['Suivre toutes les activités mises en œuvre', 'Gestion des expressions des besoins', 'Accueil et orientation des PAP', 'Enregistrement des plaintes']);
  assert.equal(f['employer.name'], 'TEST Associés'); assert.equal(f['employer.qualite'], 'Directeur'); assert.equal(f['job.lieuSignature'], 'Dakar'); assert.equal(f['job.dateContrat'], '2024-02-02');
});

test('import d’une lettre de commande Word : fiche, durée convertie en date de fin, per diem, tâches', () => {
  const [c] = I.extract(I.docxXmlToBlocks(docXml(LDC))), f = c.fields;
  assert.equal(f['job.type'], 'LDC'); assert.equal(f['service.numero'], '01032024'); assert.equal(f['job.dateContrat'], '2024-03-01'); assert.equal(f['service.montant'], 2000000); assert.equal(f['service.remunMode'], 'global');
  assert.equal(f['worker.nom'], 'TEST'); assert.equal(f['worker.prenoms'], 'Ibrahima'); assert.equal(f['worker.civilite'], 'Monsieur'); assert.equal(f['worker.naissance'], '1983-02-10'); assert.equal(f['worker.lieuNaissance'], 'RICHARD TOLL'); assert.equal(f['worker.domicile'], 'RUE BELFORT X MARZAT');
  assert.equal(f['service.tel'], '77 000 00 00'); assert.equal(f['service.email'], 'ibrahima.test@exemple.sn'); assert.equal(f['service.intitule'], 'Etude de Faisabilité de la zone industrielle'); assert.equal(f['job.lieu'], 'BAMBILOR');
  assert.equal(f['job.dateEngagement'], '2024-03-01'); assert.equal(f['job.dateFin'], '2024-08-31'); assert.equal(f['service.perdiem'], 30000); assert.equal(f['service.client'], 'ANAT'); assert.equal(f['job.emploi'], 'Ingénieur HSE');
  assert.deepEqual(f['service.taches'], ['Analyse de la documentation sur le projet,', 'Rencontre avec les acteurs', 'Animation d’atelier ;']);
  assert.ok(!('service.dureeMois' in f) && !('dmt.cni' in f));   // valeurs de travail retirées
});

test('importer puis appliquer : contrat de prestation valide et prêt à imprimer', () => {
  const [c] = I.extract(I.docxXmlToBlocks(docXml(LDC))), d = K.blankContract(company, '2026-11-13');
  I.apply(d, c.fields); K.switchType(d, c.fields['job.type']); d.service.projet = 'Projet Import';
  assert.equal(d.job.type, 'LDC'); assert.equal(d.service.montant, 2000000); assert.equal(K.validate(d).valid, true);
  Object.values(docx(d)).forEach(wellFormed);
});

/* ───────── documents Word et aperçu ───────── */
test('contrat de prestation : articles numérotés dans l’ordre, mentions légales vérifiées, aucune notion de salaire', () => {
  const d = make('PRESTATION', (c) => { c.service.remunMode = 'global'; c.service.montant = 2000000; c.service.penaliteTaux = 1; }), w = unesc(wtext(docx(d)['word/document.xml']));
  const arts = [...w.matchAll(/Article (\d+) :/g)].map((m) => Number(m[1])); assert.ok(arts.length >= 14); assert.deepEqual(arts, arts.map((_, i) => i + 1));
  ['loi n° 2008-12 du 25 janvier 2008', 'loi n° 2008-09 du 25 janvier 2008', 'Code des obligations civiles et commerciales', 'ni un contrat de travail', 'deux millions (2 000 000) francs CFA', 'pour mille', 'Force majeure', 'juridictions compétentes de Dakar'].forEach((s) => assert.ok(w.replace(/\u00a0/g, ' ').includes(s), s));
  assert.ok(!/période d’essai|DMT|bulletin|convention collective|licenciement|L\d{2,3}\b/i.test(w), 'aucune notion propre au contrat de travail');
  assert.ok(/en qualité d’Assistante de projet/.test(w)); assert.ok(/au Chef de mission adjoint/.test(w));   // élisions et contractions
});

test('lettre de commande : fiche et échéances en tableaux, numéro, montant, per diem', () => {
  const d = make('LDC', (c) => { c.service.remunMode = 'global'; c.service.montant = 2000000; c.service.perdiem = 30000; c.service.numero = '01122026'; c.service.jalons = K.parseJalons('30 | Livrable 1 : rapport de démarrage\n40 | Livrable 2 : rapport provisoire\n30 | Livrable 3 : rapport définitif'); });
  const x = docx(d)['word/document.xml'], w = unesc(wtext(x)).replace(/\u00a0/g, ' ');
  assert.ok(w.includes('LETTRE DE COMMANDE DE SERVICES N° 01122026')); assert.ok(w.includes('Montant : 2 000 000 F CFA')); assert.ok(w.includes('trente mille (30 000) francs CFA par nuitée'));
  assert.equal((x.match(/<w:tbl>/g) || []).length, 3); assert.ok(/<w:tblBorders><w:top w:val="single"/.test(x)); assert.ok(/w:fill="EEF0F4"/.test(x));
  ['600 000', '800 000', '600 000', 'Livrable 2 : rapport provisoire'].forEach((s) => assert.ok(w.includes(s), s));
  const arts = [...w.matchAll(/Article (\d+) :/g)].map((m) => Number(m[1])); assert.deepEqual(arts, arts.map((_, i) => i + 1));
  assert.ok(/<w:rFonts w:ascii="Times New Roman"/.test(x));
});

test('mode mensuel, nature des honoraires, paiement après le client, arbitrage', () => {
  const t = (over) => unesc(wtext(docx(make('PRESTATION', over))['word/document.xml'])).replace(/\u00a0/g, ' ');
  assert.ok(t((c) => { c.service.remunMode = 'mensuel'; }).includes('par mois de prestation effective'));
  assert.ok(t((c) => { c.service.nature = 'ht'; }).includes('hors taxes')); assert.ok(t((c) => { c.service.nature = 'ttc'; }).includes('toutes taxes comprises')); assert.ok(t((c) => { c.service.nature = 'net'; }).includes('convenu net'));
  assert.ok(t((c) => { c.service.apresClient = true; }).includes('paiement correspondant par le Client'));
  assert.ok(t((c) => { c.service.litige = 'arbitrage'; }).includes('Acte uniforme de l’OHADA relatif au droit de l’arbitrage')); assert.ok(!t(() => {}).includes('arbitrage ;'));
  assert.ok(!t((c) => { c.service.penaliteTaux = 0; }).includes('pour mille'));
});

test('aperçu et Word : même texte ; fichiers nommés selon le type', () => {
  for (const type of ['PRESTATION', 'LDC']) {
    const d = make(type, (c) => { c.service.jalons = K.parseJalons('50 | A\n50 | B'); }), norm = (s) => unesc(s).replace(/[\s\u00a0]+/g, '');
    const html = X.modelHtml(X.contractModel(d)).replace(/<span class="cx-pn">.*?<\/span>/g, '').replace(/<[^>]+>/g, '');
    assert.equal(norm(html), norm(wtext(docx(d)['word/document.xml'])), type);
  }
  assert.equal(X.fileName('contract', make('PRESTATION')), 'ContratPrestation_SarrMameAwa.docx'); assert.equal(X.fileName('contract', make('LDC')), 'LettreCommande_SarrMameAwa.docx');
});

test('cas limites : textes très longs, caractères spéciaux, listes vides, contrat presque vide', () => {
  const longName = 'DIAGNE-NDIAYE-'.repeat(8);
  const d = make('PRESTATION', (c) => { c.worker.nom = longName; c.worker.domicile = 'Cité “Keur” & Fils <Lot 5>, Dakar '.repeat(4); c.service.taches = []; c.service.intitule = 'Mission & <audit> « spécial » '.repeat(6); c.service.clauses.nature = ''; });
  const w = docx(d); Object.values(w).forEach(wellFormed);
  const t = unesc(wtext(w['word/document.xml'])); assert.ok(t.includes(longName.toUpperCase().slice(0, 40))); assert.ok(t.includes('Cité “Keur” & Fils <Lot 5>')); assert.ok(t.includes('(à préciser)'));
  assert.ok(X.modelHtml(X.contractModel(d)).includes('&amp; Fils &lt;Lot 5&gt;'));
  for (const type of ['PRESTATION', 'LDC']) { const v = K.blankContract({ name: '', profile: {} }, '2026-01-01'); K.switchType(v, type); Object.values(unzip(X.modelDocx(X.contractModel(v)))).forEach(wellFormed); X.modelHtml(X.contractModel(v)); }
});

test('les contrats de travail ne sont pas affectés (CDI : toujours I–VIII, DMT et salaire)', () => {
  const d = K.blankContract(company, '2026-11-13'); Object.assign(d.worker, { nom: 'Diop', prenoms: 'Awa' }); Object.assign(d.job, { emploi: 'Comptable', dateEngagement: '2026-12-01' }); d.salary.base = 150000;
  assert.equal(K.validate(d).valid, true); const nums = X.contractModel(d).blocks.filter((b) => b.num).map((b) => b.num).filter((n) => /^[IVX]+\.$/.test(n)); assert.equal(nums.length, 8);
  assert.ok(K.alertsOf([Object.assign(d, { id: 'a' })], '2026-11-13').some((a) => /DMT/.test(a.text)));
});

test('aller-retour : un document généré par le logiciel se ré-importe sans perte (prestation et lettre de commande)', () => {
  for (const type of ['PRESTATION', 'LDC']) {
    const src = make(type, (c) => { c.service.remunMode = 'global'; c.service.montant = 1500000; c.service.perdiem = 25000; c.service.jalons = K.parseJalons('50 | Livrable 1\n50 | Livrable 2'); c.service.email = 'm.sarr@exemple.sn'; c.service.nature = 'ht'; });
    const [cand] = I.extract(I.docxXmlToBlocks(docx(src)['word/document.xml'])), f = cand.fields;
    assert.equal(f['job.type'], type, type); assert.equal(f['service.intitule'], src.service.intitule, type);
    assert.equal(f['worker.nom'], 'SARR', type); assert.equal(f['worker.prenoms'], 'Mame Awa', type); assert.equal(f['worker.civilite'], 'Madame', type); assert.equal(f['worker.naissance'], '1990-05-12', type); assert.equal(f['worker.lieuNaissance'], 'Thiès', type);
    assert.equal(f['service.montant'], 1500000, type); assert.equal(f['job.dateEngagement'], '2026-12-01', type); assert.equal(f['job.dateFin'], '2027-05-31', type); assert.equal(f['job.lieu'], 'Kaffrine', type);
    assert.ok(!('employer.name' in f) || !/Prestataire exerce/.test(f['employer.name']), 'aucune clause prise pour un libellé');
    assert.equal(f['service.client'], 'AGEROUTE', type); assert.deepEqual(f['service.taches'], src.service.taches, type);
    if (type === 'LDC') { assert.equal(f['service.cin'], '2 000 0000 00000'); assert.equal(f['service.email'], 'm.sarr@exemple.sn'); assert.equal(f['service.perdiem'], 25000); assert.equal(f['job.emploi'], 'Assistante de projet'); }
  }
});

/* ───────── Code du travail (loi n° 2026-18 du 3 septembre 2026) : seulement les articles applicables, lus au Journal officiel n° 7931 ───────── */
test('Code du travail : articles réellement applicables cités, aucun article inutile ni ancien', () => {
  const norm = (d) => unesc(wtext(docx(d)['word/document.xml'])).replace(/ /g, ' ');
  for (const type of ['PRESTATION', 'LDC']) {
    const w = norm(make(type));
    ['article 3 du Code du travail (loi n° 2026-18 du 3 septembre 2026)', 'articles 284 et 285', 'articles 287 et 291', 'article 291', 'articles 288 et 289'].forEach((s) => assert.ok(w.includes(s), type + ' : ' + s));
    const cited = [...w.matchAll(/articles? ([d ,et]+?) du Code du travail|(articles? ([d ,et]+?))/g)].flatMap((m) => (m[1] || m[2]).match(/d+/g)).map(Number);
    const allowed = new Set([3, 284, 285, 287, 288, 289, 291, 313, 314, 316]); cited.forEach((n) => assert.ok(allowed.has(n), type + ' : article non vérifié ' + n));
    assert.ok(!/article 105|loi n° 97-17|travailleur étranger|visa/i.test(w), type + ' : aucune référence hors sujet');
    assert.ok(!/articles? (313|314|316)/.test(w), type + ' : clause de sécurité absente par défaut');
  }
});

test('clause de sécurité sur site (articles 313, 314, 316) : ajoutée seulement si la mission le justifie', () => {
  for (const type of ['PRESTATION', 'LDC']) {
    const w = unesc(wtext(docx(make(type, (c) => { c.service.risques = true; }))['word/document.xml']));
    ['article 313 du Code du travail', 'article 314', 'article 316', 'Sécurité et santé au travail'].forEach((s) => assert.ok(w.includes(s), type + ' : ' + s));
    const arts = [...w.matchAll(/Article (\d+) :/g)].map((m) => Number(m[1])); assert.deepEqual(arts, arts.map((_, k) => k + 1), type + ' : articles consécutifs');
  }
  const h = unesc(wtext(docx(make('LDC', (c) => { c.service.risques = true; }))['word/document.xml']));
  const subs = [...h.matchAll(/6.(d). /g)].map((m) => Number(m[1])); assert.deepEqual(subs, subs.map((_, i) => i + 1), 'sous-articles 6.x consécutifs');
});

test('régularité du prestataire : justificatifs avant paiement, personnel et sous-traitance encadrés', () => {
  const w = unesc(wtext(docx(make('PRESTATION'))['word/document.xml']));
  assert.ok(/avant le premier paiement/.test(w)); assert.ok(/peut suspendre tout règlement/.test(w)); assert.ok(/attestation de régularité sociale/.test(w)); assert.ok(/ne constitue pas une opération de marchandage/.test(w));
  assert.ok(/sans recourir à des salariés ni à des sous-traitants/.test(w)); assert.ok(/garantit CTA contre toute réclamation/.test(w));
  assert.ok(K.validate(make('PRESTATION')).warnings.some((x) => /travail dissimulé/.test(x)));
  assert.ok(!K.validate(make('PRESTATION', (c) => { c.service.ninea = '123456789'; })).warnings.some((x) => /travail dissimulé/.test(x)));
});

test('contractions de l’entreprise dans les clauses : « à le Cabinet » devient « au Cabinet »', () => {
  const w = unesc(wtext(docx(make('PRESTATION', (c) => { c.service.alias = 'le Cabinet'; }))['word/document.xml']));
  assert.ok(!/ à le /.test(w)); assert.ok(/remet au Cabinet/.test(w));
});
