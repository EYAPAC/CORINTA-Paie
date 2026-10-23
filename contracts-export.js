/* Corinta Pay — documents de contrat : un seul modèle de document, plusieurs rendus.
   · contractModel(d)  → modèle du contrat (blocs : titre encadré, paragraphes, tableau du salaire, signatures)
   · modelHtml(model)  → aperçu à l'écran / impression (mêmes blocs, mêmes alignements que le fichier Word)
   · modelDocx(model)  → vrai fichier .docx (OOXML : styles, justification, gras/normal, tableaux, saut de page)
   · dmtData(view,net) → valeurs de la DMT ; dmtHtml / dmtXlsx → aperçu et classeur .xlsx fidèles au modèle Excel
   Aucune dépendance externe : l'archive ZIP (méthode « stockée », CRC32) est écrite ici. */
(function (root) {
  'use strict';
  const str = (v) => (v == null ? '' : String(v).trim());
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const NB = ' ';
  const frDate = (iso) => { const p = String(iso || '').split('-'); return p.length === 3 && p[0] ? p[2] + '/' + p[1] + '/' + p[0] : ''; };
  const money = (v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0)).replace(/[  \s]/g, NB);
  const K = () => root.CorintaContracts;

  /* ───────── ZIP (stocké) ───────── */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    const w16 = (v) => [v & 255, (v >>> 8) & 255], w32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    Object.keys(files).forEach((name) => {
      const nb = enc.encode(name), raw = files[name], data = raw instanceof Uint8Array ? raw : enc.encode(raw), crc = crc32(data);
      const lh = new Uint8Array([...w32(0x04034b50), ...w16(20), ...w16(0x0800), ...w16(0), ...w16(0), ...w16(0x21), ...w32(crc), ...w32(data.length), ...w32(data.length), ...w16(nb.length), ...w16(0), ...nb]);
      parts.push(lh, data);
      central.push(new Uint8Array([...w32(0x02014b50), ...w16(20), ...w16(20), ...w16(0x0800), ...w16(0), ...w16(0), ...w16(0x21), ...w32(crc), ...w32(data.length), ...w32(data.length), ...w16(nb.length), ...w16(0), ...w16(0), ...w16(0), ...w16(0), ...w32(0), ...w32(off), ...nb]));
      off += lh.length + data.length;
    });
    const cl = central.reduce((a, x) => a + x.length, 0);
    const end = new Uint8Array([...w32(0x06054b50), ...w16(0), ...w16(0), ...w16(central.length), ...w16(central.length), ...w32(cl), ...w32(off), ...w16(0)]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, x) => a + x.length, 0)); let p = 0;
    all.forEach((x) => { out.set(x, p); p += x.length; });
    return out;
  }

  /* ───────── Modèle du contrat ───────── */
  const R = (t, o) => Object.assign({ t: String(t == null ? '' : t) }, o);
  const B = (t, o) => R(t, Object.assign({ b: 1 }, o));
  const BU = (t) => R(t, { b: 1, u: 1 });
  const U = (n) => '_'.repeat(Math.max(1, n));
  const toRuns = (a) => (Array.isArray(a) ? a : [a]).flat().filter((x) => x != null && x !== '').map((x) => (typeof x === 'string' ? R(x) : x));
  const P = (runs, o) => Object.assign({ k: 'p', r: toRuns(runs) }, o);
  /** « 7ème », « 1er » : le suffixe passe en exposant, comme dans les modèles. */
  function sup(text, o) {
    const out = [], re = /(\d)(er|ème)(?=[\s,.;:)»]|$)/g; let last = 0, m;
    while ((m = re.exec(text))) { out.push(R(text.slice(last, m.index + 1), o), R(m[2], Object.assign({ sup: 1 }, o))); last = m.index + m[0].length; }
    out.push(R(text.slice(last), o)); return out;
  }
  const GLYPH = ['❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽', '❾'];
  const WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const inWords = (n) => { n = Math.round(Number(n) || 0); return (WORDS[n] || String(n)) + ' (' + String(n).padStart(2, '0') + ')'; };

  function contractModel(d) {
    const k = K(), w = d.worker, j = d.job, e = d.employer, s = k.salaryTotals(d.salary), cdd = k.isCdd(j.type), projet = j.type === 'CDD_PROJET';
    const fem = w.sexe === 'F', civ = fem ? 'Madame' : (w.civilite || 'Monsieur'), nom = k.fullName(w);
    const fam = (k.FAMILLE[w.famille] || '') + (k.num(w.enfants) > 0 ? ', ' + String(Math.round(k.num(w.enfants))).padStart(2, '0') + ' enfant' + (k.num(w.enfants) > 1 ? 's' : '') : '');
    const blocks = [];
    const line = (label, value, o) => { value = str(value); const free = value ? Math.max(6, 46 - value.length) : 40, l = Math.round(free * 0.4); return P([label, U(value ? l : free), value ? B(value) : '', value ? U(free - l) : ''], Object.assign({ a: 'l', sa: 5 }, o)); };
    const item = (num, label, value) => { value = str(value); const free = Math.max(6, 42 - value.length), l = Math.round(free * 0.4); return P([BU(label), B(' : '), B(U(l)), B(' '), sup(value, { b: 1 }), B(U(free - l))], { num, li: 40, hang: 40, a: 'j', ln: 1.5, sa: 6 }); };

    blocks.push({ k: 'box', lines: [cdd ? 'CONTRAT DE TRAVAIL' : 'CONTRAT DE TRAVAIL', cdd ? 'A DUREE DETERMINEE' : 'A DUREE INDETERMINEE'] });
    if (projet) blocks.push(P([R('(pour la durée du projet « ' + str(j.projetNom) + ' »)', { i: 1 })], { a: 'c', sb: 6 }));
    blocks.push(P('Entre les Soussignés :', { a: 'l', sb: 40, sa: 8 }));
    const rep = str(e.representant), repM = rep.match(/^(monsieur|madame|mademoiselle|m\.|mme)\s+(.*)$/i);
    blocks.push(P([[e.prefixe, e.name].filter(Boolean).join(' '), e.siege ? ' dont le siège social est situé à ' + e.siege : '', rep ? ', représenté par ' : '', repM ? repM[1] + ' ' : '', rep ? B(repM ? repM[2] : rep) : '', rep && e.qualite ? ', en sa qualité de ' + e.qualite : ''], { a: cdd ? 'j' : 'l', ln: 1.15, sa: 8 }));
    blocks.push(P(['Désigné(e) ci-après ', R('« L’employeur »', { b: 1, sz: 13 })], { a: 'l', sb: 6, sa: 8, li: 4 }));
    blocks.push(P('Et,', { a: 'l', sa: 8 }), P(civ + ',', { a: 'l', sa: 8 }));
    blocks.push(line('Nom : ', str(w.nom).toUpperCase()), line('Prénoms : ', w.prenoms));
    blocks.push(line('Date et Lieu de Naissance : ', (frDate(w.naissance) || '') + (w.lieuNaissance ? ' à ' + w.lieuNaissance : '')), line('Nationalité : ', w.nationalite));
    blocks.push(line('Filiation : ', (cdd ? '' : (fem ? 'Fille de ' : 'Fils de ')) + (str(w.pere) || '…') + ' et ' + (str(w.mere) || '…'), { li: 14 }), line('Situation de Famille : ', fam), line('Domicilié (e) : ', w.domicile));
    blocks.push(P(['Désigné (e) ci-après ', B('« LE TRAVAILLEUR »')], { a: cdd ? 'l' : 'c', sb: 14, sa: 10 }));
    blocks.push(P(['Il a été conclu le Contrat de Travail aux clauses ci-dessous, conformément aux dispositions ', B('du décret N° 63-00-118 /MFPT/DTSS du 19 Février 1963 fixant les formes et modalités d’établissement du contrat du travail et de l’engagement à l’essai.')], { a: 'j', sa: 16 }));
    blocks.push(item('I.', 'EMPLOI TENU', j.emploi), item('II.', 'CLASSIFICATION PROFESSIONNELLE', j.classification), item('III.', 'DATE DE L’ENGAGEMENT', frDate(j.dateEngagement)));
    blocks.push(item('IV.', 'DUREE DU CONTRAT', projet ? 'Durée déterminée, pour la durée du projet « ' + str(j.projetNom) + ' »' : (cdd ? 'Durée Déterminée' : 'Durée Indéterminée')));

    // V. références (la clause d'entrée en vigueur est présentée en citation, comme dans le modèle)
    blocks.push(P([BU('REFERENCES AUX TEXTES REGISSANT LE CONTRAT'), B(' :')], { num: 'V.', li: 40, hang: 40, a: 'l', sa: 8, kn: 1, pb: 1 }));
    (d.clauses.references || []).filter((r) => str(r)).forEach((r, i) => {
      const m = str(r).match(/^(.*?)\s+(L’entrée en vigueur.*)$/);
      blocks.push(P(sup(m ? m[1] : str(r)), { num: (i + 1) + '.', numB: 1, li: 62, hang: 22, a: 'j', sa: m ? 6 : 8 }));
      if (m) blocks.push(P(['« ' + m[2].replace(/\.$/, '') + ' » ;'], { li: 62, a: 'j', sa: 8 }));
    });

    // VI. conditions particulières (rubriques ❶ ❷ … numérotées dans l'ordre)
    blocks.push(P([BU('CONDITIONS PARTICULIERES')], { num: 'VI.', li: 40, hang: 40, a: 'l', sb: 6, sa: 8, kn: 1 }));
    let n = 0; const glyph = () => GLYPH[n++] || String(n);
    const cond = (runs, o) => P(runs, Object.assign({ num: glyph(), li: 30, hang: 30, a: 'j', sa: 8 }, o));
    const essai = k.num(j.essaiMois) > 0 ? 'Le présent contrat est conclu avec une période d’essai de ' + inWords(j.essaiMois) + ' mois' + (j.essaiRenouvelable ? ', renouvelable tacitement' : '') + ', au cours de laquelle chacune des parties pourra y mettre fin conformément aux dispositions légales et réglementaires en vigueur.' : (cdd ? '' : 'Le présent contrat est conclu sans période d’essai.');
    const horaire = k.num(j.horaire) > 0 ? [B('L’horaire de travail'), ' est en principe de ' + k.num(j.horaire) + ' heures par semaine' + (k.num(j.horaire) === 40 ? ', soit 173,33 heures le mois' : '') + '.'] : null;
    if (essai) { blocks.push(cond(essai)); if (horaire) blocks.push(P(horaire, { li: 30, a: 'j', sa: 8 })); } else if (horaire) blocks.push(cond(horaire));
    blocks.push(cond([B('Lieu et Durée de travail : '), civ + U(4) + ' ', B(nom), U(4) + ' est amené(e) à assumer la fonction ' + (str(j.fonctionDetail) || str(j.emploi)) + (j.lieu ? ' à l’adresse suivante : ' + j.lieu : '') + '.']));
    str(d.clauses.mobilite).split(/(?<=\.)\s+(?=Les parties considèrent)/).filter(Boolean).forEach((t) => blocks.push(P(t, { li: 30, a: 'j', sa: 8 })));
    if (cdd) blocks.push(P(k.dureeText(d), { li: 30, a: 'j', sa: 8 }));
    blocks.push(cond([B('Régime des congés payés : '), str(d.clauses.conges)]));
    const prev = str(d.clauses.prevoyance), pm = prev.match(/^(.*?\bsur\s*:)\s*les risques professionnels,\s*la retraite,\s*(la maladie.*)$/i);
    if (pm) {
      blocks.push(cond([B('Prévoyance Sociale : '), pm[1]], { sa: 4 }));
      ['Les risques professionnels', 'Retraite,', pm[2].charAt(0).toUpperCase() + pm[2].slice(1)].forEach((t, i, a) => blocks.push(P(t, { num: '♦', numB: 0, li: 62, hang: 22, a: 'l', sa: i === a.length - 1 ? 8 : 2 })));
    } else blocks.push(cond([B('Prévoyance Sociale : '), prev]));
    const disc = str(d.clauses.discipline).split(/(?<=\.)\s+(?=De même)/);
    blocks.push(cond([B('Discipline – Secret Professionnel : '), disc[0]], { sa: disc[1] ? 6 : 8 }));
    if (disc[1]) blocks.push(P(disc.slice(1).join(' '), { li: 30, a: 'j', sa: 8 }));

    // VII. salaire — sans total (le « brut total » ne figure plus dans le contrat)
    blocks.push(P([BU('SALAIRE')], { num: 'VII.', li: 40, hang: 40, a: 'l', sb: 6, sa: 6, kn: 1, pb: 1 }));
    blocks.push(P('Le salaire brut mensuel est ainsi décomposé :', { li: 18, a: 'l', sa: 6, kn: 1 }));
    const rows = [['Salaire de base', s.base], ['Sursalaire', s.sursalaire]].concat(s.logement > 0 ? [['Indemnité de logement', s.logement]] : [], s.anciennete > 0 ? [['Prime d’ancienneté (' + k.num(d.salary.anciennetePct) + ' %)', s.anciennete]] : [], [['Indemnité de transport', s.transport]]);
    blocks.push({ k: 'tab', li: 32, widths: [220, 120], rows: rows.map(([l, v]) => [[R(l)], [B(money(v) + NB + 'FCFA')]]) });

    blocks.push(P([civ + U(3) + ' ', B(nom), U(4) + ' déclare formellement n’être lié(e) à aucun Employeur et être libre de tout engagement.'], { num: 'VIII.', li: 40, hang: 40, a: 'j', sb: 18, sa: 10 }));
    const copie = j.copieInspection ? ' et (copie adressée à l’Inspection régionale du travail et de la sécurité sociale de ' + str(j.lieuSignature) + ')' : '';
    blocks.push(P('Le présent contrat est établi à ' + str(j.lieuSignature) + ' en ' + inWords(j.exemplaires) + ' exemplaires originaux' + copie + '.', { li: 140, a: 'j', sb: 28, sa: 22, kn: 1 }));
    const date = str(j.lieuSignature) + ', le ' + k.longDate(j.dateContrat || j.dateEngagement);
    blocks.push(P(date, cdd ? { a: 'c', sa: 30, kn: 1 } : { li: 140, a: 'l', sa: 30, kn: 1 }));
    const repNom = rep.replace(/^(monsieur|madame|mademoiselle|m\.|mme)\s+/i, '');
    const sig = (title, name, notes) => [P([B(title)], { a: 'c', sa: 18, kn: 1 }), P(name || '………………………………', { a: 'c', sa: 4 })].concat((notes || []).map((x) => P(x, { a: 'c', sz: 9, sa: 0 })));
    blocks.push({ k: 'sign', cols: [sig(str(e.signataire) || 'L’employeur', cdd ? repNom : ''), sig('Le travailleur', cdd ? nom : '', ['(Signature précédée de la mention', '« Lu et Approuvé »)'])] });
    return { kind: 'contract', blocks, font: 'Times New Roman', sz: 11, margin: 2.5 };
  }

  /* ───────── Rendu HTML (aperçu + impression) ───────── */
  const CSS = '.cx-page{background:#fff;color:#000;box-sizing:border-box;width:595pt;max-width:none;margin:0 auto 14px;padding:70.9pt;box-shadow:0 1px 8px rgba(15,35,70,.22);page:contract;font-size:11pt;line-height:1.2;position:relative;min-height:842pt}.cx-page *{box-sizing:border-box}.cx-page .p{margin:0;word-wrap:break-word;overflow-wrap:anywhere;display:block}.cx-page .p.f{display:flex}.cx-page .p.f>.n{flex:0 0 auto}.cx-page .p.f>.t{flex:1 1 0;min-width:0}.cx-page .box{border:1.2pt solid #000;margin:0 auto 12pt;padding:8pt 30pt;text-align:center;font:700 14pt/1.3 Arial,Helvetica,sans-serif;width:max-content;max-width:100%}.cx-page table.t{border-collapse:collapse;border:0}.cx-page table.t td{padding:0 12pt 1pt 0;vertical-align:top}.cx-page table.sg{width:100%;border-collapse:collapse;table-layout:fixed}.cx-page table.sg td{vertical-align:top;padding:0 6pt}.cx-page sup{font-size:.65em;line-height:0}.cx-pn{position:absolute;top:6pt;right:10pt;font:9px Arial,sans-serif;color:#7a8699}' +
    '.cx-dmt{background:#fff;color:#000;margin:0 auto 14px;box-shadow:0 1px 8px rgba(15,35,70,.22);width:max-content;max-width:none;page:dmt}.cx-dmt table{border-collapse:collapse;table-layout:fixed;font-family:Cambria,"Times New Roman",serif}.cx-dmt td{padding:0;overflow:hidden;line-height:1.1;white-space:nowrap}' +
    '@media print{body.printing-doc #docPrint .cx-page,body.printing-doc #docPrint .cx-dmt{box-shadow:none;margin:0;width:auto;min-height:0;padding:0;break-after:page}body.printing-doc #docPrint .cx-pn{display:none}@page contract{size:A4;margin:2.5cm}@page dmt{size:A4;margin:5mm}}';
  const rz = (m) => (m.sz || 11);
  function runHtml(r) {
    let s = esc(r.t).replace(/\t/g, '<span style="display:inline-block;width:2em"></span>').replace(/\n/g, '<br>');
    if (r.sup) s = '<sup>' + s + '</sup>';
    const st = (r.b ? 'font-weight:700;' : '') + (r.i ? 'font-style:italic;' : '') + (r.u ? 'text-decoration:underline;' : '') + (r.sz ? 'font-size:' + r.sz + 'pt;' : '') + (r.f ? 'font-family:' + r.f + ';' : '');
    return st ? '<span style="' + st + '">' + s + '</span>' : s;
  }
  const JC = { j: 'justify', c: 'center', l: 'left', r: 'right' };
  function pHtml(b) {
    const st = 'text-align:' + (JC[b.a] || 'left') + ';margin-top:' + (b.sb || 0) + 'pt;margin-bottom:' + (b.sa == null ? 0 : b.sa) + 'pt;' + (b.ln ? 'line-height:' + (b.ln * 1.2).toFixed(2) + ';' : '') + (b.sz ? 'font-size:' + b.sz + 'pt;' : '');
    const inner = b.r.map(runHtml).join('') || '&nbsp;';
    if (b.num) return '<div class="p f" style="padding-left:' + ((b.li || 0) - (b.hang || 0)) + 'pt;' + st + '"><span class="n" style="width:' + (b.hang || 24) + 'pt;font-weight:' + (b.numB === 0 ? 400 : 700) + '">' + esc(b.num) + '</span><div class="t">' + inner + '</div></div>';
    return '<div class="p" style="padding-left:' + (b.li || 0) + 'pt;' + st + '">' + inner + '</div>';
  }
  function blockHtml(b) {
    if (b.k === 'box') return '<div class="box">' + b.lines.map(esc).join('<br>') + '</div>';
    if (b.k === 'tab') return '<div style="padding-left:' + (b.li || 0) + 'pt;margin-bottom:8pt"><table class="t">' + b.rows.map((r) => '<tr>' + r.map((c, i) => '<td style="width:' + (b.widths[i] || 100) + 'pt">' + c.map(runHtml).join('') + '</td>').join('') + '</tr>').join('') + '</table></div>';
    if (b.k === 'sign') return '<table class="sg"><tr>' + b.cols.map((c) => '<td>' + c.map(pHtml).join('') + '</td>').join('') + '</tr></table>';
    return pHtml(b);
  }
  /** Les pages suivent les sauts de page explicites du modèle ; le reste s'enchaîne comme dans Word. */
  function modelHtml(model) {
    const pages = [[]]; model.blocks.forEach((b) => { if (b.pb) pages.push([]); pages[pages.length - 1].push(b); });
    return pages.map((pg, i) => '<div class="cx-page" style="font-family:' + model.font + ',Times,serif"><span class="cx-pn">' + (i + 1) + ' / ' + pages.length + '</span>' + pg.map(blockHtml).join('') + '</div>').join('');
  }

  /* ───────── Écriture .docx ───────── */
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const tw = (pt) => Math.round(pt * 20);
  function runXml(r, model) {
    const f = r.f || model.font;
    const pr = '<w:rFonts w:ascii="' + f + '" w:hAnsi="' + f + '" w:cs="' + f + '"/>' + (r.b ? '<w:b/><w:bCs/>' : '') + (r.i ? '<w:i/><w:iCs/>' : '') + '<w:sz w:val="' + Math.round((r.sz || model.sz) * 2) + '"/><w:szCs w:val="' + Math.round((r.sz || model.sz) * 2) + '"/>' + (r.u ? '<w:u w:val="single"/>' : '') + (r.sup ? '<w:vertAlign w:val="superscript"/>' : '');
    return '<w:r><w:rPr>' + pr + '</w:rPr>' + r.t.split(/(\t|\n)/).map((x) => (x === '\t' ? '<w:tab/>' : x === '\n' ? '<w:br/>' : x === '' ? '' : '<w:t xml:space="preserve">' + esc(x) + '</w:t>')).join('') + '</w:r>';
  }
  function pXml(b, model, forceSz) {
    const jc = { j: 'both', c: 'center', l: 'left', r: 'right' }[b.a] || 'left';
    const left = tw(b.li || 0), hang = b.num ? tw(b.hang || 24) : 0;
    const runs = (b.num ? [R(b.num, { b: b.numB === 0 ? 0 : 1 }), R('\t', {})] : []).concat(b.r).map((r) => runXml(forceSz && !r.sz ? Object.assign({}, r, { sz: forceSz }) : (b.sz && !r.sz ? Object.assign({}, r, { sz: b.sz }) : r), model)).join('');
    return '<w:p><w:pPr>' + (b.kn ? '<w:keepNext/>' : '') + '<w:keepLines/>' + (b.pb ? '<w:pageBreakBefore/>' : '') + (b.num ? '<w:tabs><w:tab w:val="left" w:pos="' + left + '"/></w:tabs>' : '') +
      '<w:spacing w:before="' + tw(b.sb || 0) + '" w:after="' + tw(b.sa == null ? 0 : b.sa) + '" w:line="' + Math.round((b.ln || 1) * 240) + '" w:lineRule="auto"/>' + '<w:ind w:left="' + left + '"' + (b.num ? ' w:hanging="' + hang + '"' : '') + '/><w:jc w:val="' + jc + '"/></w:pPr>' + runs + '</w:p>';
  }
  const NOB = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => '<w:' + s + ' w:val="nil"/>').join('') + '</w:tblBorders>';
  function blockXml(b, model) {
    if (b.k === 'box') {
      const W = 5300, brd = ['top', 'left', 'bottom', 'right'].map((s) => '<w:' + s + ' w:val="single" w:sz="10" w:space="0" w:color="000000"/>').join('');
      return '<w:tbl><w:tblPr><w:tblW w:w="' + W + '" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>' + brd + '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="110" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="110" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="' + W + '"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="' + W + '" w:type="dxa"/></w:tcPr>' +
        b.lines.map((l) => pXml(P([R(l, { b: 1, sz: 14, f: 'Arial' })], { a: 'c', sa: 0 }), model)).join('') + '</w:tc></w:tr></w:tbl>' + pXml(P('', { sa: 0 }), model);
    }
    if (b.k === 'tab') {
      const ws = b.widths.map(tw), tot = ws.reduce((x, y) => x + y, 0);
      return '<w:tbl><w:tblPr><w:tblW w:w="' + tot + '" w:type="dxa"/><w:tblInd w:w="' + tw(b.li || 0) + '" w:type="dxa"/>' + NOB + '<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + ws.map((x) => '<w:gridCol w:w="' + x + '"/>').join('') + '</w:tblGrid>' +
        b.rows.map((r) => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + r.map((c, i) => '<w:tc><w:tcPr><w:tcW w:w="' + ws[i] + '" w:type="dxa"/></w:tcPr>' + pXml(P(c, { a: 'l', sa: 3, kn: 1 }), model) + '</w:tc>').join('') + '</w:tr>').join('') + '</w:tbl>' + pXml(P('', { sa: 4 }), model);
    }
    if (b.k === 'sign') {
      const half = tw((595 - model.margin * 56.7 * 2) / 2 - 8), tot = half * 2;
      return '<w:tbl><w:tblPr><w:tblW w:w="' + tot + '" w:type="dxa"/>' + NOB + '<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="' + half + '"/><w:gridCol w:w="' + half + '"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>' + b.cols.map((c) => '<w:tc><w:tcPr><w:tcW w:w="' + half + '" w:type="dxa"/></w:tcPr>' + c.map((x) => pXml(x, model)).join('') + '</w:tc>').join('') + '</w:tr></w:tbl>' + pXml(P('', { sa: 0 }), model);
    }
    return pXml(b, model);
  }
  function modelDocx(model, meta) {
    meta = meta || {}; const m = Math.round(model.margin * 566.93), f = model.font;
    const body = model.blocks.map((b) => blockXml(b, model)).join('') + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="' + m + '" w:right="' + m + '" w:bottom="' + m + '" w:left="' + m + '" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
    const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const files = {
      '[Content_Types].xml': H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
      '_rels/.rels': H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
      'word/_rels/document.xml.rels': H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>',
      'word/document.xml': H + '<w:document ' + NS + '><w:body>' + body + '</w:body></w:document>',
      'word/styles.xml': H + '<w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + f + '" w:hAnsi="' + f + '" w:cs="' + f + '" w:eastAsia="' + f + '"/><w:sz w:val="' + model.sz * 2 + '"/><w:szCs w:val="' + model.sz * 2 + '"/><w:lang w:val="fr-FR" w:eastAsia="fr-FR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/></w:style></w:styles>',
      'word/settings.xml': H + '<w:settings ' + NS + '><w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>',
      'docProps/core.xml': H + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(meta.title || 'Contrat de travail') + '</dc:title><dc:creator>Corinta Pay</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>',
      'docProps/app.xml': H + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Corinta Pay</Application></Properties>'
    };
    return zip(files);
  }

  /* ───────── DMT : valeurs ───────── */
  const serial = (iso) => { const p = String(iso || '').split('-').map(Number); return p.length === 3 && p[0] ? Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(1899, 11, 30)) / 864e5) : null; };
  const OBJ_ROW = { 'Embauchage': [16, 0], 'Licenciement': [16, 1], 'Expiration normale du contrat': [17], 'Démission': [18, 0], 'Mutation': [18, 1], 'Changement de catégorie professionnelle': [19], 'Modification du contrat de travail': [20], 'Changement de situation de famille': [21], 'Changement de résidence habituelle': [22], 'Changement d’emploi': [23, 0], 'Décès': [23, 1] };
  /** view = K.dmtView(contrat, entreprise) ; net = salaire net estimé (facultatif). Retourne { clé : {t, v, f?} }. */
  function dmtData(view, net) {
    const s = view.synced, x = view.extra, cdd = s.type === 'CDD', V = {};
    const T = (k, v) => { V[k] = { t: 's', v: str(v) }; }, D = (k, iso) => { const n = serial(iso); V[k] = n ? { t: 'd', v: n, text: frDate(iso) } : { t: 's', v: '' }; }, N = (k, v, o) => { V[k] = Object.assign({ t: 'n', v: Number(v) || 0 }, o); };
    T('nom', s.nom); T('prenoms', s.prenoms); T('sexe', s.sexe); D('naissance', s.naissance); T('lieuNaissance', s.lieuNaissance); T('pays', s.pays); T('nationalite', s.nationalite);
    T('pere', s.pere); T('mere', s.mere); T('ethnie', x.ethnie); T('adresse', s.adresse); T('cni', x.cni); T('cniLieu', x.cniLieu); D('cniDate', x.cniDate); T('cniPar', x.cniPar); T('ccpf', x.ccpf); T('agrom', x.agrom);
    T('famille', s.famille); if (s.epouses) N('epouses', s.epouses); else T('epouses', ''); T('nomsEpouses', s.nomsEpouses); N('enfants', s.enfants); T('nomsEnfants', s.nomsEnfants);
    D('dateEntree', s.dateEntree); T('declEmbauche', x.declEmbauche); T('profession', s.profession); T('emploi', s.emploi); T('convention', s.convention); T('categorie', s.categorie); D('dateContrat', s.dateContrat);
    T('visaApprobation', x.visaApprobation); T('visaEnregistrement', x.visaEnregistrement); T('raisonSociale', [s.raisonSociale, s.adresseEtablissement].filter(Boolean).join(', ')); T('activite', s.activite);
    if (cdd) { D('dateDebut', s.dateDebut); D('dateFin', s.dateFin); T('duree', ''); } else { T('dateDebut', ''); T('dateFin', ''); T('duree', 'CDI'); }
    T('precedent', x.precedentEmployeur); T('residence', x.art107Lieu || s.residence); D('art107Date', x.art107Date);
    T('militaireClasse', x.militaireClasse); T('militaireService', x.militaireService); T('militaireArmee', x.militaireArmee); T('militaireGrade', x.militaireGrade);
    N('tauxHoraire', s.base / 173.33, { nf: '#,##0.00' }); N('base', s.base, { f: 'Y27*AA27' }); N('sursalaire', s.sursalaire); N('logement', s.logement);
    N('ancPct', (s.anciennetePct || 0) / 100, { nf: Number.isInteger(s.anciennetePct || 0) ? '0%' : '0.0%' }); N('anciennete', s.ancienneteMontant);
    N('brut', s.brut, { f: 'AC27+AC29+AC31+AC33' }); N('transport', s.transport); if (net > 0) N('net', net); else T('net', '');
    T('numero', 'N° ' + (str(x.numero) || '………………………………….')); T('dateDmt', 'du ' + (frDate(x.date) || '……………………..'));
    T('salaireTexte', '1) - Le salaire du travailleur sera celui fixé pour la Catégorie ' + (s.categorie || '………') + ' de la ' + (s.convention || '……………………………………'));
    const hs = { 40: 'h40', 42: 'h42', 44: 'h44', 48: 'h48' }; Object.keys(hs).forEach((h) => T(hs[h], Number(h) === s.horaire ? h + ' HEURES' : ''));
    const mat = str(x.matricule).toUpperCase().padEnd(6, ' ').slice(0, 6).split(''); mat.forEach((ch, i) => T('m' + i, ch.trim()));
    T('cachet', [s.raisonSociale, s.adresseEtablissement].filter(Boolean).join('\n'));
    V._objet = OBJ_ROW[x.objet] || null;
    return V;
  }

  /* ───────── DMT : mise en page (modèle Excel) ───────── */
  const L = () => root.CorintaDmtLayout;
  const colName = (c) => { let s = ''; while (c > 0) { s = String.fromCharCode(65 + ((c - 1) % 26)) + s; c = Math.floor((c - 1) / 26); } return s; };
  const addr = (r, c) => colName(c) + r;
  const parseA = (a) => { const m = a.match(/^([A-Z]+)(\d+)$/); return [+m[2], m[1].split('').reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0)]; };
  const OVERRIDE = { salaireTexte: { w: 1, v: 'top', ind: 0 }, cachet: { w: 1, v: 'top' }, adresse: {}, raisonSociale: {} };
  /** Fusionne le modèle (cellules fixes + libellés) et les données : retourne la liste des cellules finales. */
  function dmtCells(V) {
    const lay = L(), byAddr = new Map(), key = lay.data;
    lay.cells.forEach(([r, c, v, s]) => byAddr.set(addr(r, c), { r, c, v, s: lay.styles[s], kind: v == null ? null : (typeof v === 'number' ? 'n' : 's') }));
    Object.keys(key).forEach((a) => {
      const d = V[key[a]]; if (!d) return; const [r, c] = parseA(a), base = byAddr.get(a) || { r, c, s: {} }, st = Object.assign({}, base.s, OVERRIDE[key[a]] || {}, d.nf ? { nf: d.nf } : {});
      if (d.t === 's' && !OVERRIDE[key[a]] && d.v) st.sh = 1;
      byAddr.set(a, { r, c, s: st, kind: d.v === '' ? null : d.t, v: d.v, f: d.f, text: d.text });
    });
    // Mentions de l'objet (lignes 16 à 23) : en gras uniquement la mention valable (la partie choisie quand deux mentions partagent la ligne), comme dans le modèle
    const sel = V._objet || [];
    for (let row = 16; row <= 23; row++) {
      const cur = byAddr.get('B' + row); if (!cur || typeof cur.v !== 'string') continue;
      const parts = cur.v.replace(/^\s*-\s*/, '').trim().split(/\s+-\s+/), on = sel[0] === row;
      cur.s = Object.assign({}, cur.s, { b: 0 }); delete cur.s.b;
      if (parts.length > 1) cur.rich = parts.map((p, i) => ({ t: ' - ' + p, b: on && sel[1] === i ? 1 : 0 }));
      else if (on) cur.s = Object.assign({}, cur.s, { b: 1 });
    }
    return [...byAddr.values()].sort((p, q) => p.r - q.r || p.c - q.c);
  }

  /* aperçu HTML de la DMT : deux pages A4 (colonnes A–V puis W–AC), comme l'impression Excel */
  const BD = { thin: '1px solid #000', medium: '2px solid #000', thick: '3px solid #000', double: '3px double #000', dotted: '1px dotted #000', hair: '1px dotted #555', dashed: '1px dashed #000' };
  function dmtHtml(V) {
    const lay = L(), cells = dmtCells(V), grid = new Map(); cells.forEach((c) => grid.set(c.r + ':' + c.c, c));
    const anchors = new Map(), covered = new Set();
    lay.merges.forEach((m) => { const [a, z] = m.split(':'), [r1, c1] = parseA(a), [r2, c2] = parseA(z); anchors.set(r1 + ':' + c1, { cs: c2 - c1 + 1, rs: r2 - r1 + 1, c2 }); for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(r + ':' + c); });
    const px = (c) => Math.round((lay.cols[c] || 8.43) * 7 + 5), maxRow = 85;
    const page = (c1, c2) => {
      let w = 0; for (let c = c1; c <= c2; c++) w += px(c);
      let h = '<div class="cx-dmt"><table style="width:' + w + 'px"><colgroup>' + Array.from({ length: c2 - c1 + 1 }, (_, i) => '<col style="width:' + px(c1 + i) + 'px">').join('') + '</colgroup>';
      for (let r = 1; r <= maxRow; r++) {
        h += '<tr style="height:' + Math.round((lay.rows[r] || 12.75) * 1.333) + 'px">'; 
        for (let c = c1; c <= c2; c++) {
          const k = r + ':' + c; if (covered.has(k)) continue;
          const cell = grid.get(k) || { s: {} }, an = anchors.get(k), s = cell.s || {}; let cs = an ? Math.min(an.cs, c2 - c + 1) : 1;
          let ovW = 0;   // comme dans Excel, un libellé déborde visuellement sur les cellules voisines vides (les bordures restent en place)
          if (!an && cell.kind === 's' && cell.v && !s.w && s.h !== 'center' && s.h !== 'right') {
            ovW = px(c); for (let cc = c + 1; cc <= c2; cc++) { const kk = r + ':' + cc, nx = grid.get(kk); if (covered.has(kk) || anchors.has(kk) || (nx && (nx.kind || nx.rich))) break; ovW += px(cc); }
          }
          let text = '', size = s.z || 10;
          if (cell.rich) text = cell.rich.map((x) => '<span style="font-weight:' + (x.b ? 700 : 400) + '">' + esc(x.t) + '</span>').join('');
          else if (cell.kind === 'd') text = esc(cell.text || '');
          else if (cell.kind === 'n') { const nn = Number(cell.v) || 0; text = s.nf === '0%' || s.nf === '0.0%' ? (nn * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %' : nn === 0 && /_-\*|#,##0/.test(s.nf || '') && s.nf !== '#,##0.00' ? '-' : nn.toLocaleString('fr-FR', { maximumFractionDigits: s.nf === '#,##0.00' || !Number.isInteger(nn) ? 2 : 0, minimumFractionDigits: s.nf === '#,##0.00' ? 2 : 0 }); }
          else if (cell.kind === 's') text = esc(cell.v).replace(/\n/g, '<br>');
          if (s.sh && cell.kind === 's') { let wpx = 0; const sp = an ? an.c2 : c; for (let cc = c; cc <= sp; cc++) wpx += px(cc); const need = (String(cell.v).replace(/[….]+/g, (m) => '.'.repeat(Math.ceil(m.length * 0.4))).length * size * 0.56 * 1.333) + 8; if (need > wpx) size = Math.max(5, size * wpx / need); }
          const st = 'font-size:' + size.toFixed(1) + 'pt;' + (s.b ? 'font-weight:700;' : '') + (s.i ? 'font-style:italic;' : '') + (s.u ? 'text-decoration:underline;' : '') + (s.fill ? 'background:#' + s.fill + ';' : '') + (s.fc ? 'color:#' + s.fc + ';' : '') + 'text-align:' + (cell.kind === 'n' ? 'right' : s.h === 'center' ? 'center' : s.h === 'right' ? 'right' : 'left') + ';vertical-align:' + (s.v === 'center' ? 'middle' : s.v === 'bottom' ? 'bottom' : 'top') + ';' + (s.w ? 'white-space:normal;' : '') + (s.ind ? 'padding:0 ' + Math.min(s.ind * 6, 8) + 'px;' : '') +
            [['l', 'left'], ['r', 'right'], ['t', 'top'], ['d', 'bottom']].map(([k2, n]) => (s[k2] && BD[s[k2]] ? 'border-' + n + ':' + BD[s[k2]] + ';' : '')).join('');
          h += '<td' + (cs > 1 ? ' colspan="' + cs + '"' : '') + (an && an.rs > 1 ? ' rowspan="' + an.rs + '"' : '') + ' style="' + st + (ovW ? 'overflow:visible;' : '') + '">' + (ovW ? '<div style="width:' + (ovW - 2) + 'px;overflow:hidden">' + text + '</div>' : text) + '</td>';
        }
        h += '</tr>';
      }
      return h + '</table></div>';
    };
    return page(1, lay.page.colBreak) + page(lay.page.colBreak + 1, 29);
  }

  /* ───────── DMT : classeur .xlsx ───────── */
  function xlsxStyles() {
    const fonts = ['<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], numFmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const idx = (arr, x) => { let i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; }, cache = new Map();
    const BI = { thin: 'thin', medium: 'medium', thick: 'thick', double: 'double', dotted: 'dotted', hair: 'hair', dashed: 'dashed' };
    function xf(s) {
      s = s || {}; const key = JSON.stringify(s); if (cache.has(key)) return cache.get(key);
      const font = idx(fonts, '<font>' + (s.b ? '<b/>' : '') + (s.i ? '<i/>' : '') + (s.u ? '<u/>' : '') + '<sz val="' + (s.z || 10) + '"/><color rgb="FF' + (s.fc || '000000') + '"/><name val="Cambria"/><family val="1"/></font>');
      const fill = s.fill ? idx(fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + s.fill + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
      const side = (n, v) => (v && BI[v] ? '<' + n + ' style="' + BI[v] + '"><color rgb="FF000000"/></' + n + '>' : '<' + n + '/>');
      const border = (s.l || s.r || s.t || s.d) ? idx(borders, '<border>' + side('left', s.l) + side('right', s.r) + side('top', s.t) + side('bottom', s.d) + '<diagonal/></border>') : 0;
      let nf = s.nf === 'mm-dd-yy' ? 'dd/mm/yyyy' : s.nf, nid = 0;
      if (nf === '#,##0') nid = 3; else if (nf === '0%') nid = 9; else if (nf === '#,##0.00') nid = 4; else if (nf) nid = 164 + idx(numFmts, '<numFmt numFmtId="@" formatCode="' + esc(nf) + '"/>');
      const al = '<alignment horizontal="' + (s.h || 'left') + '" vertical="' + (s.v || 'center') + '"' + (s.w ? ' wrapText="1"' : '') + (s.sh ? ' shrinkToFit="1"' : '') + (s.ind ? ' indent="' + Math.round(s.ind) + '"' : '') + '/>';
      const id = idx(xfs, '<xf numFmtId="' + nid + '" fontId="' + font + '" fillId="' + fill + '" borderId="' + border + '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + al + '</xf>');
      cache.set(key, id); return id;
    }
    function xml() { return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.map((x, i) => x.replace('"@"', '"' + (164 + i) + '"')).join('') + '</numFmts>' : '') + '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="' + borders.length + '">' + borders.join('') + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'; }
    return { xf, xml };
  }
  function dmtXlsx(V, meta) {
    const lay = L(), cells = dmtCells(V), st = xlsxStyles(), byRow = new Map();
    cells.forEach((c) => { if (!byRow.has(c.r)) byRow.set(c.r, []); byRow.get(c.r).push(c); });
    const cellXml = (c) => {
      const a = addr(c.r, c.c), s = st.xf(c.s), at = ' r="' + a + '" s="' + s + '"';
      if (c.f) return '<c' + at + '><f>' + esc(c.f) + '</f><v>' + c.v + '</v></c>';
      if (c.rich) return '<c' + at + ' t="inlineStr"><is>' + c.rich.map((x) => '<r><rPr>' + (x.b ? '<b/>' : '') + '<sz val="' + (c.s.z || 10) + '"/><color rgb="FF000000"/><rFont val="Cambria"/><family val="1"/></rPr><t xml:space="preserve">' + esc(x.t) + '</t></r>').join('') + '</is></c>';
      if (c.kind === 'n' || c.kind === 'd') return '<c' + at + '><v>' + c.v + '</v></c>';
      if (c.kind === 's' && c.v !== '') return '<c' + at + ' t="inlineStr"><is><t xml:space="preserve">' + esc(c.v) + '</t></is></c>';
      return '<c' + at + '/>';
    };
    const sheetData = [...byRow.keys()].sort((a, b) => a - b).map((r) => '<row r="' + r + '"' + (lay.rows[r] ? ' ht="' + lay.rows[r] + '" customHeight="1"' : '') + '>' + byRow.get(r).map(cellXml).join('') + '</row>').join('');
    const cols = Object.keys(lay.cols).map(Number).sort((a, b) => a - b).map((i) => '<col min="' + i + '" max="' + i + '" width="' + lay.cols[i] + '" customWidth="1"/>').join('');
    const pg = lay.page, mg = pg.margin.toFixed(6), H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const sheet = H + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:AC85"/><sheetViews><sheetView showGridLines="0" tabSelected="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="12.75"/><cols>' + cols + '</cols><sheetData>' + sheetData + '</sheetData><mergeCells count="' + lay.merges.length + '">' + lay.merges.map((m) => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="' + mg + '" right="' + mg + '" top="' + mg + '" bottom="' + mg + '" header="' + mg + '" footer="' + mg + '"/><pageSetup paperSize="' + pg.paper + '" scale="' + pg.scale + '" orientation="portrait"/><colBreaks count="1" manualBreakCount="1"><brk id="' + pg.colBreak + '" max="1048575" man="1"/></colBreaks></worksheet>';
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return zip({
      '[Content_Types].xml': H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': H + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + REL + '"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="DMT" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">DMT!$A$1:$AC$85</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
      'xl/_rels/workbook.xml.rels': H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + REL + '/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': st.xml(),
      'xl/worksheets/sheet1.xml': sheet
    });
  }

  /* ───────── Noms de fichiers ───────── */
  function baseName(worker) {
    const clean = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ'’]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join('');
    return clean(worker.nom) + clean(worker.prenoms) || 'Travailleur';
  }
  const fileName = (kind, d) => (kind === 'dmt' ? 'DMT_' : 'Contrat_') + baseName(d.worker) + (kind === 'dmt' ? '.xlsx' : '.docx');
  const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

  const api = { zip, crc32, contractModel, modelHtml, modelDocx, dmtData, dmtCells, dmtHtml, dmtXlsx, fileName, MIME, CSS, serial };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaContractsExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
