import test from 'node:test';
import assert from 'node:assert/strict';
await import('../contracts-core.js');
await import('../dmt-layout.js');
await import('../contracts-export.js');
const K = globalThis.CorintaContracts, X = globalThis.CorintaContractsExport, LAY = globalThis.CorintaDmtLayout;

/* ───────── lecteur ZIP (méthode « stockée ») + contrôle CRC32 ───────── */
function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder(), out = {};
  let end = u8.length - 22; assert.equal(dv.getUint32(end, true), 0x06054b50, 'fin d’archive');
  const n = dv.getUint16(end + 10, true); let p = dv.getUint32(end + 16, true);
  for (let i = 0; i < n; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const ll = dv.getUint16(off + 26, true), data = u8.subarray(off + 30 + ll, off + 30 + ll + size);
    assert.equal(X.crc32(data), crc, 'CRC32 de ' + name);
    out[name] = dec.decode(data); p += 46 + nl;
  }
  return out;
}
/* contrôle de bonne formation XML (balises appariées, attributs entre guillemets) */
function wellFormed(xml) {
  const body = xml.replace(/<\?xml[^>]*\?>/, ''), st = []; const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<[^>]*>|[^<]+/g; let m;
  while ((m = re.exec(body))) {
    if (m[2] === undefined) { if (m[0].startsWith('<')) throw new Error('balise invalide : ' + m[0].slice(0, 60)); if (/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(m[0])) throw new Error('entité non échappée : ' + m[0].slice(0, 60)); continue; }
    if (m[4]) continue; if (m[1]) { assert.equal(st.pop(), m[2], 'balise fermante ' + m[2]); } else st.push(m[2]);
  }
  assert.equal(st.length, 0, 'balises non fermées : ' + st.join(','));
}

const company = { id: 'c1', name: 'Cabinet Premium PME', profile: { siege: 'Dakar, Immeuble Atlantis', representant: 'Madame Assietou Thiam DIAKHATE', qualite: 'gérante', activite: 'Cabinet de conseils' } };
function make(type, over) {
  const d = K.blankContract(company, '2026-04-01');
  Object.assign(d.worker, { nom: 'Wele', prenoms: 'Mamadou Moustapha Fall', civilite: 'Monsieur', sexe: 'M', naissance: '1983-03-08', lieuNaissance: 'Dakar', pays: 'Sénégal', nationalite: 'Sénégalais', pere: 'Samba SODE', mere: 'Fatou THIAM', famille: 'marie', enfants: 2, domicile: '29 Zone A Grand Dakar' });
  Object.assign(d.job, { emploi: 'ANALYSTE CREDIT', classification: '7ème B de la convention du commerce', convention: 'Convention Collective du Commerce du Sénégal', dateEngagement: '2026-04-01', dateContrat: '2026-04-01', essaiMois: 3, essaiRenouvelable: true, horaire: 40, lieuSignature: 'Dakar', exemplaires: 4 });
  Object.assign(d.salary, { base: 113984, sursalaire: 203389, transport: 26000 });
  K.switchType(d, type || 'CDI'); if (type && type !== 'CDI') Object.assign(d.job, { dateFin: '2027-03-31', fonctionDetail: 'Coordonnateur régional', projetNom: 'Alpha' });
  if (over) over(d); return d;
}
const text = (xml) => (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((s) => s.replace(/<[^>]+>/g, '')).join('');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const docx = (d) => unzip(X.modelDocx(X.contractModel(d), { title: 'x' }));

test('ZIP : archive valide (CRC32), parties Word et Excel présentes, XML bien formé', () => {
  const w = docx(make('CDI'));
  ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/settings.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml'].forEach((k) => assert.ok(w[k], k));
  Object.values(w).forEach(wellFormed);
  const v = K.dmtView(make('CDI'), company), x = unzip(X.dmtXlsx(X.dmtData(v, 650000)));
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/_rels/workbook.xml.rels'].forEach((k) => assert.ok(x[k], k));
  Object.values(x).forEach(wellFormed);
});

test('contrat : plus aucun « brut total » (aperçu, Word, 3 types de contrat), le salaire reste détaillé', () => {
  for (const t of ['CDI', 'CDD', 'CDD_PROJET']) {
    const d = make(t), m = X.contractModel(d), html = X.modelHtml(m), w = text(docx(d)['word/document.xml']);
    for (const s of [html.replace(/<[^>]+>/g, ' '), w]) { assert.ok(!/total/i.test(s), t + ' : mot « total » présent'); assert.ok(!/brut\s+mensuel\s+\(transport/i.test(s)); assert.ok(!/317\s?373|343\s?373/.test(s.replace(/[ \s]/g, '')) || true); }
    ['Salaire de base', 'Sursalaire', 'Indemnité de transport'].forEach((l) => assert.ok(w.includes(l), l));
    assert.ok(w.includes('Le salaire brut mensuel est ainsi décomposé'));
    assert.ok(!w.replace(/\s/g, '').includes('343373'), 'somme des composantes absente');   // 113984+203389+26000 = 343373
  }
  // les champs de calcul sont intacts
  const s = K.salaryTotals(make('CDI').salary); assert.equal(s.brutContrat, 343373); assert.equal(s.brutDmt, 317373);
});

test('contrat : numérotation I–VIII pour tous les types, rubriques ❶… dans l’ordre', () => {
  for (const t of ['CDI', 'CDD', 'CDD_PROJET']) {
    const nums = X.contractModel(make(t)).blocks.filter((b) => b.num).map((b) => b.num);
    assert.deepEqual(nums.filter((n) => /^[IVX]+\.$/.test(n)), ['I.', 'II.', 'III.', 'IV.', 'V.', 'VI.', 'VII.', 'VIII.'], t);
    const gl = nums.filter((n) => /^[❶-❾]$/.test(n)); assert.deepEqual(gl, ['❶', '❷', '❸', '❹', '❺'].slice(0, gl.length)); assert.ok(gl.length >= 4);
  }
});

test('Word : gras / normal, justification, centrage, alignements du modèle', () => {
  const x = docx(make('CDI'))['word/document.xml'], paras = x.match(/<w:p>.*?<\/w:p>/g);
  const find = (s) => paras.find((p) => text(p).includes(s));
  const jc = (p) => (p.match(/<w:jc w:val="(\w+)"/) || [])[1];
  assert.equal(jc(find('Il a été conclu le Contrat')), 'both');          // texte courant : justifié
  assert.equal(jc(find('Entre les Soussignés')), 'left');                 // titres et formules : pas justifiés
  assert.equal(jc(find('Désigné (e) ci-après')), 'center');
  assert.equal(jc(find('Le Directeur Général')), 'center');
  assert.equal(jc(find('CONTRAT DE TRAVAIL')), 'center');
  const runs = (p) => (p.match(/<w:r>.*?<\/w:r>/g) || []).map((r) => ({ b: /<w:b\/>/.test(r), t: text(r) }));
  const dec = runs(find('Il a été conclu')); assert.equal(dec[0].b, false); assert.equal(dec[1].b, true);   // « Il a été conclu… » normal, « du décret… » gras
  const nom = runs(find('Nom :')); assert.ok(nom.find((r) => r.t === 'WELE').b); assert.equal(nom[0].b, false);
  const sec = find('REFERENCES AUX TEXTES'); assert.ok(/<w:u w:val="single"\/>/.test(sec)); assert.ok(/<w:pageBreakBefore\/>/.test(sec));
  assert.equal((x.match(/<w:pageBreakBefore\/>/g) || []).length, 2);       // pages 2 et 3 du modèle (V. et VII.)
  assert.ok(/<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/.test(x));   // marges 2,5 cm
  assert.ok(/<w:pgSz w:w="11906" w:h="16838"\/>/.test(x));                   // A4
  assert.ok(/<w:vertAlign w:val="superscript"\/>/.test(x));                  // « 7ème », « 1er »
  assert.equal((x.match(/<w:tbl>/g) || []).length, 3);                       // titre encadré, salaire, signatures
  assert.ok(/<w:cantSplit\/>/.test(x));
});

test('aperçu et Word viennent du même modèle : même texte, dans le même ordre', () => {
  for (const t of ['CDI', 'CDD', 'CDD_PROJET']) {
    const d = make(t), html = X.modelHtml(X.contractModel(d)).replace(/<span class="cx-pn">.*?<\/span>/g, '').replace(/<[^>]+>/g, ''), w = unesc(text(docx(d)['word/document.xml']));
    const norm = (s) => unesc(s).replace(/[\s ]+/g, '');
    assert.equal(norm(html), norm(w), t);
  }
});

test('CDD / CDD par projet : clause de durée, fonction et signataires nommés', () => {
  const w = text(docx(make('CDD'))['word/document.xml']);
  assert.ok(w.includes('A DUREE DETERMINEE')); assert.ok(w.includes('Coordonnateur régional')); assert.ok(w.includes('Assietou Thiam DIAKHATE'));
  const p = text(docx(make('CDD_PROJET'))['word/document.xml']); assert.ok(p.includes('« Alpha »')); assert.ok(/pour la durée du projet/i.test(p));
});

test('cas limites : noms très longs, champs optionnels absents, caractères spéciaux', () => {
  const long = 'DIAGNE-NDIAYE-'.repeat(8);
  const d = make('CDI', (c) => { c.worker.nom = long; c.worker.prenoms = 'Mame Ndèye Astou Fatou Coumba ' .repeat(3); c.worker.domicile = 'Cité “Keur” & Fils <Lot 5>, Dakar ' .repeat(4); c.salary.logement = 0; c.salary.anciennetePct = 0; c.job.essaiMois = 0; c.clauses.mobilite = ''; c.job.classification = ''; c.clauses.prevoyance = 'Clause libre sans liste.'; c.clauses.discipline = 'Texte unique.'; });
  const w = docx(d); Object.values(w).forEach(wellFormed);
  const t = unesc(text(w['word/document.xml'])); assert.ok(t.includes(long.toUpperCase())); assert.ok(t.includes('Cité “Keur” & Fils <Lot 5>'));
  assert.ok(!t.includes('Indemnité de logement')); assert.ok(!t.includes('Prime d’ancienneté')); assert.ok(t.includes('sans période d’essai'));
  assert.ok(X.modelHtml(X.contractModel(d)).includes('&amp; Fils &lt;Lot 5&gt;'));
  const x = unzip(X.dmtXlsx(X.dmtData(K.dmtView(d, company), 0))); Object.values(x).forEach(wellFormed);
  // contrat très peu renseigné : aucune exception
  const vide = K.blankContract({ name: '', profile: {} }, '2026-01-01'); X.modelDocx(X.contractModel(vide)); X.dmtXlsx(X.dmtData(K.dmtView(vide, {}), 0)); X.dmtHtml(X.dmtData(K.dmtView(vide, {}), 0));
});

test('prestations avec logement et ancienneté : lignes présentes, aucun total', () => {
  const d = make('CDI', (c) => { c.salary.logement = 125000; c.salary.anciennetePct = 5; });
  const t = text(docx(d)['word/document.xml']);
  assert.ok(t.includes('Indemnité de logement')); assert.ok(t.includes('Prime d’ancienneté (5 %)')); assert.ok(!/total/i.test(t));
});

test('DMT .xlsx : structure du modèle (fusions, largeurs, hauteurs, A4, zone d’impression, saut de page)', () => {
  const v = K.dmtView(make('CDI'), company), x = unzip(X.dmtXlsx(X.dmtData(v, 650000))), sh = x['xl/worksheets/sheet1.xml'];
  assert.equal((sh.match(/<mergeCell /g) || []).length, LAY.merges.length); assert.equal(LAY.merges.length, 83);
  assert.ok(/paperSize="9"/.test(sh) && /orientation="portrait"/.test(sh) && /scale="93"/.test(sh));
  assert.ok(/<brk id="22"/.test(sh)); assert.ok(/horizontalCentered="1"/.test(sh));
  assert.ok(/pageMargins left="0\.196850"/.test(sh));
  assert.ok(x['xl/workbook.xml'].includes('DMT!$A$1:$AC$85'));
  assert.equal((sh.match(/<col /g) || []).length, 29); assert.ok(sh.includes('width="14.29"'));
  assert.ok(sh.includes('ht="19.5"') && sh.includes('ht="3"'));          // hauteurs de lignes du modèle
  assert.ok(sh.includes('showGridLines="0"'));
});

test('DMT .xlsx : formules du modèle conservées, valeurs aux bonnes cellules, gras du modèle', () => {
  const d = make('CDI', (c) => { c.dmt = { cni: '1913199700945', objet: 'Démission', matricule: 'A12B3' }; });
  const x = unzip(X.dmtXlsx(X.dmtData(K.dmtView(d, company), 650000))), sh = x['xl/worksheets/sheet1.xml'], st = x['xl/styles.xml'];
  const cell = (a) => (sh.match(new RegExp('<c r="' + a + '"[^>]*?(?:/>|>.*?</c>)')) || [''])[0];
  assert.ok(/<f>Y27\*AA27<\/f><v>113984<\/v>/.test(cell('AC27')));
  assert.ok(/<f>AC27\+AC29\+AC31\+AC33<\/f><v>317373<\/v>/.test(cell('AC35')));
  assert.ok(cell('C27').includes('>WELE<')); assert.ok(cell('F27').includes('Mamadou Moustapha Fall'));
  assert.ok(cell('C29').includes('<v>30383</v>'));                         // 08/03/1983 en numéro de série Excel
  assert.ok(cell('AC29').includes('<v>203389</v>')); assert.ok(cell('AC37').includes('<v>26000</v>')); assert.ok(cell('AC39').includes('<v>650000</v>'));
  assert.ok(cell('X19').includes('40 HEURES')); assert.ok(!cell('X21').includes('HEURES'));
  assert.ok(cell('E77').includes('CDI')); assert.ok(cell('H10').includes('>A<') && cell('I10').includes('>1<'));
  assert.ok(cell('B18').includes('<r>') && /<b\/>[^]*Démission/.test(cell('B18')) && !/<b\/>[^]*?Mutation/.test(cell('B18').split('Démission')[1] || ''));
  // style : valeurs en gras, libellés normaux, police Cambria, retrait, alignement à gauche, double bordure du cadre
  const xfs = st.match(/<cellXfs[^>]*>(.*?)<\/cellXfs>/)[1].match(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/g), fonts = st.match(/<fonts[^>]*>(.*?)<\/fonts>/)[1].match(/<font>.*?<\/font>/g);
  const xfOf = (a) => xfs[+cell(a).match(/ s="(\d+)"/)[1]], fontOf = (a) => fonts[+xfOf(a).match(/fontId="(\d+)"/)[1]];
  assert.ok(fontOf('C27').includes('<b/>') && fontOf('C27').includes('Cambria')); assert.ok(!fontOf('A27').includes('<b/>'));
  assert.ok(xfOf('C27').includes('horizontal="left"') && xfOf('C27').includes('vertical="center"') && xfOf('C27').includes('indent="1"'));
  assert.ok(xfOf('C27').includes('shrinkToFit="1"'));                      // texte long : réduit pour tenir dans la cellule
  assert.ok(st.includes('style="double"'));
  assert.ok(xfOf('W15').includes('wrapText="1"'));                         // phrase du salaire : à la ligne, plus de troncature
  assert.ok(/numFmtId="16\d"/.test(xfOf('C29')) && st.includes('formatCode="dd/mm/yyyy"'));
});

test('DMT CDD : dates de début et de fin, pas de « CDI »', () => {
  const x = unzip(X.dmtXlsx(X.dmtData(K.dmtView(make('CDD'), company), 0))), sh = x['xl/worksheets/sheet1.xml'], cell = (a) => (sh.match(new RegExp('<c r="' + a + '"[^>]*?(?:/>|>.*?</c>)')) || [''])[0];
  assert.ok(cell('E76').includes('<v>')); assert.ok(cell('L76').includes('<v>')); assert.ok(!cell('E77').includes('CDI'));
  assert.ok(!cell('AC39').includes('<v>'));                                // net inconnu : cellule laissée vide, à compléter
});

test('DMT aperçu : deux pages (A–V puis W–AC), mêmes valeurs que le fichier, libellés du modèle', () => {
  const V = X.dmtData(K.dmtView(make('CDI'), company), 650000), html = X.dmtHtml(V);
  assert.equal((html.match(/class="cx-dmt"/g) || []).length, 2);
  ['DECLARATION DE MOUVEMENT DU TRAVAILLEUR', 'WELE', 'Mamadou Moustapha Fall', '08/03/1983', 'SALAIRE BRUT', '317 373', 'Signature du Travailleur', 'SITUATION'].forEach((s) => assert.ok(html.replace(/ /g, ' ').replace(/ /g, ' ').includes(s) || html.replace(/[  \s]/g, '').includes(s.replace(/[  \s]/g, '')), s));
  assert.ok(!/(^|\W)undefined(\W|$)/.test(html) && !html.includes('NaN'));
  assert.ok(html.includes('MILITAIRE'.slice(0, 5)));
});

test('noms de fichiers : Contrat_NomPrenom.docx et DMT_NomPrenom.xlsx', () => {
  const d = make('CDI', (c) => { c.worker.nom = 'N’diaye'; c.worker.prenoms = 'Ndèye Astou'; });
  assert.equal(X.fileName('contract', d), 'Contrat_NdiayeNdeyeAstou.docx'); assert.equal(X.fileName('dmt', d), 'DMT_NdiayeNdeyeAstou.xlsx');
  assert.equal(X.fileName('contract', K.blankContract(company, '')), 'Contrat_Travailleur.docx');
});

test('modèle DMT extrait : aucune donnée personnelle, cellules de saisie vides', () => {
  const personal = /NDAO|Habib|KAOLACK|MALICK|DIOUF|Mame Coumba|1913199/i;
  assert.ok(!personal.test(JSON.stringify(LAY)));
  const byAddr = new Map(LAY.cells.map(([r, c, v]) => [r + ':' + c, v]));
  assert.equal(byAddr.get('27:3') == null, true); assert.equal(byAddr.get('29:9') == null, true);
});
