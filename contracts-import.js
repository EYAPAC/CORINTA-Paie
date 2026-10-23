/*
 * Corinta Pay — extraction automatique des informations d'un contrat depuis un fichier Word (.docx) ou Excel (.xlsx / .csv).
 * Module pur (sans DOM, testé sous Node). Le fichier est lu dans le navigateur : rien n'est envoyé sur un serveur.
 *
 * Principe : le fichier est transformé en « blocs » (paragraphes, lignes de tableau, lignes de feuille). On y repère :
 *   1) des paires « libellé : valeur » (y compris plusieurs par ligne et les champs soulignés « ____ valeur ____ »),
 *   2) des libellés et valeurs dans des cellules voisines (tableaux Word, feuilles Excel),
 *   3) un tableau à en-têtes (Excel : une ligne par travailleur),
 *   4) quelques phrases types des modèles de contrat (employeur, période d'essai, lieu et date de signature…).
 * Les valeurs reconnues sont proposées à l'utilisateur, qui les vérifie avant de les appliquer au contrat.
 */
(function (root) {
  'use strict';

  /* ───────── Lecture des fichiers → blocs ───────── */
  const decodeXml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
  function paraText(xml) {
    return decodeXml(String(xml).replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n').replace(/<(?!\/?w:t[ >])[^>]+>/g, '').replace(/<\/?w:t[^>]*>/g, ''));
  }
  /** Contenu de word/document.xml → [{type:'p', text} | {type:'row', cells:[…]}] dans l'ordre du document. */
  function docxXmlToBlocks(xml) {
    const out = [], re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g; let m;
    while ((m = re.exec(String(xml)))) {
      if (m[0].startsWith('<w:tbl>')) {
        (m[0].match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).forEach((tr) => {
          const cells = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((tc) => (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(paraText).join(' ').replace(/\s+/g, ' ').trim());
          if (cells.some(Boolean)) out.push({ type: 'row', cells });
        });
      } else { const t = paraText(m[0]).replace(/[  ]+/g, ' ').trim(); if (t) out.push({ type: 'p', text: t }); }
    }
    return out;
  }
  /** Lignes d'un tableur (tableau de tableaux de valeurs) → blocs. */
  function rowsToBlocks(rows) {
    return (rows || []).map((r) => ({ type: 'row', cells: Array.from(r || [], (c) => (c == null ? '' : String(c).trim())) })).filter((b) => b.cells.some(Boolean));
  }
  /** CSV / texte → lignes (séparateur ; , ou tabulation, guillemets gérés). */
  function csvToRows(text) {
    const first = String(text).split(/\r?\n/).find((l) => l.trim()) || '', sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    return String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map((l) => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; });
  }

  /* ───────── Normalisation ───────── */
  const FROM = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ’‘´`', TO = 'aaaaaaceeeeiiiinooooouuuuyyoAAAAAACEEEEIIIINOOOOOUUUUY\'\'\'\'';
  const fold = (s) => { let o = ''; for (const ch of String(s)) { const i = FROM.indexOf(ch); o += i >= 0 ? TO[i] : ch; } return o.toLowerCase(); };
  const clean = (s) => String(s == null ? '' : s).replace(/_{2,}/g, ' ').replace(/\.{3,}/g, ' ').replace(/[ \s]+/g, ' ').replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, '').trim();
  const NUM_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12 };
  const MONTHS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
  const pad = (n) => String(n).padStart(2, '0');

  function parseDate(v) {
    const s = fold(clean(v)); if (!s) return '';
    let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4}|\d{2})\b/.exec(s); if (m) { const y = m[3].length === 2 ? (Number(m[3]) > 40 ? '19' : '20') + m[3] : m[3]; return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
    m = /(\d{1,2})\s*(?:er)?\s+([a-z]+)\s+(\d{4})/.exec(s); if (m && MONTHS[m[2]]) return m[3] + '-' + pad(MONTHS[m[2]]) + '-' + pad(m[1]);
    m = /^\s*(\d{5})(?:\.\d+)?\s*$/.exec(s); if (m && Number(m[1]) > 20000 && Number(m[1]) < 70000) return new Date(Date.UTC(1899, 11, 30) + Number(m[1]) * 864e5).toISOString().slice(0, 10);   // date Excel
    return '';
  }
  const parseMoney = (v) => { const s = String(v == null ? '' : v).replace(/[ \s]/g, ''); const m = /-?\d+(?:[.,]\d+)?/.exec(s.replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1')); return m ? Math.round(Number(m[0].replace(',', '.'))) : null; };
  const parseCount = (v) => { const s = fold(clean(v)); if (/\bsans\b|aucun|neant|^0+$/.test(s)) return 0; const d = /(\d+)/.exec(s); if (d) return Number(d[1]); for (const w of Object.keys(NUM_WORDS)) if (new RegExp('\\b' + w + '\\b').test(s)) return NUM_WORDS[w]; return null; };

  /* ───────── Libellés reconnus ───────── */
  const SPEC = [
    ['worker.nomComplet', ['nom et prenoms', 'nom et prenom', 'nom complet', 'prenoms et nom', 'nom prenoms', 'nom du travailleur et prenoms']],
    ['worker.nom', ['nom', 'nom de famille', 'nom du travailleur', 'nom du salarie', 'nom de l\'employe']],
    ['worker.prenoms', ['prenoms', 'prenom', 'prenom(s)', 'prenoms du travailleur']],
    ['worker.sexe', ['sexe', 'genre']], ['worker.civilite', ['civilite']],
    ['worker.naissanceLieu', ['date et lieu de naissance', 'date et lieu de naissance du travailleur']],
    ['worker.naissance', ['date de naissance', 'ne(e) le', 'ne le', 'nee le', 'naissance']], ['worker.lieuNaissance', ['lieu de naissance']],
    ['worker.pays', ['pays de naissance', 'pays']], ['worker.nationalite', ['nationalite']],
    ['worker.filiation', ['filiation', 'fils (fille) de', 'fils/fille de', 'fils de', 'fille de', 'parents']],
    ['worker.pere', ['pere', 'nom du pere']], ['worker.mere', ['mere', 'nom de la mere']],
    ['worker.famille', ['situation de famille', 'situation matrimoniale', 'statut matrimonial', 'etat civil']],
    ['worker.enfants', ['nombre d\'enfants a charge', 'nombre d\'enfants', 'enfants a charge', 'enfants']],
    ['worker.domicile', ['domicilie(e)', 'domicilie', 'domicile', 'adresse du travailleur', 'adresse (tres precise)', 'adresse', 'residence']],
    ['worker.nomsEpouses', ['nom des epouses']], ['worker.nomsEnfants', ['noms des enfants a charge', 'noms des enfants']],
    ['job.emploi', ['emploi tenu', 'emploi dans l\'etablissement', 'intitule du poste', 'poste occupe', 'emploi', 'poste', 'fonction', 'profession']],
    ['job.classification', ['classification professionnelle', 'categorie professionnelle', 'classification', 'categorie', 'echelon']],
    ['job.convention', ['convention collective', 'convention']],
    ['job.dateEngagement', ['date de l\'engagement', 'date d\'engagement', 'date d\'embauche', 'date d\'entree dans l\'etablissement', 'date d\'entree', 'date de debut', 'debut du contrat', 'date de prise de fonction', 'date de recrutement']],
    ['job.duree', ['duree du contrat', 'type de contrat', 'nature du contrat', 'duree']],
    ['job.dateFin', ['date de fin de contrat', 'date de fin', 'fin du contrat', 'echeance du contrat', 'terme du contrat']],
    ['job.essai', ['periode d\'essai', 'duree de la periode d\'essai']],
    ['job.horaire', ['horaire hebdomadaire', 'horaire de travail', 'horaire', 'duree hebdomadaire', 'heures par semaine']],
    ['job.lieu', ['lieu de travail', 'lieu d\'affectation', 'affectation']],
    ['job.dateContrat', ['date du contrat', 'date de signature', 'date d\'etablissement du contrat']],
    ['salary.base', ['salaire de base mensuel', 'salaire mensuel de base', 'salaire de base', 'salaire categoriel', 'salaire base', 'base']],
    ['salary.sursalaire', ['sursalaire', 'sur-salaire', 'sur salaire']],
    ['salary.transport', ['indemnite de transport', 'prime de transport', 'indemnite transport', 'transport']],
    ['salary.logement', ['indemnite de logement', 'prime de logement', 'logement']],
    ['salary.anciennete', ['prime d\'anciennete', 'taux d\'anciennete', 'anciennete']],
    ['employer.name', ['nom de l\'employeur', 'raison sociale', 'employeur', 'entreprise', 'societe']],
    ['employer.siege', ['siege social', 'adresse de l\'employeur', 'adresse de l\'entreprise', 'siege']],
    ['employer.representant', ['represente par', 'representant legal', 'representant']],
    ['employer.qualite', ['en sa qualite de', 'qualite du representant', 'qualite']],
    ['employer.activite', ['activite de l\'etablissement', 'secteur d\'activite', 'activite']],
    ['dmt.cni', ['carte d\'identite n°', 'carte d\'identite numero', 'carte d\'identite', 'piece d\'identite', 'cni']], ['dmt.ccpf', ['n° d\'immatriculation a la c.c.p.f. - a.t.', 'immatriculation css', 'n° css', 'numero css', 'c.c.p.f.']],
    ['dmt.agrom', ['n° d\'immatriculation a l\'a.g.r.o.m.', 'immatriculation ipres', 'n° ipres', 'numero ipres', 'a.g.r.o.m.', 'ipres']], ['dmt.ethnie', ['groupe ethnique']]
  ];
  const NAMES = { 'worker.nom': 'Nom', 'worker.prenoms': 'Prénoms', 'worker.sexe': 'Sexe', 'worker.civilite': 'Civilité', 'worker.naissance': 'Date de naissance', 'worker.lieuNaissance': 'Lieu de naissance', 'worker.pays': 'Pays de naissance', 'worker.nationalite': 'Nationalité', 'worker.pere': 'Père', 'worker.mere': 'Mère', 'worker.famille': 'Situation de famille', 'worker.enfants': 'Enfants à charge', 'worker.domicile': 'Domicile', 'worker.nomsEpouses': 'Nom des épouses', 'worker.nomsEnfants': 'Noms des enfants', 'job.emploi': 'Emploi tenu', 'job.classification': 'Classification', 'job.convention': 'Convention collective', 'job.dateEngagement': 'Date d’engagement', 'job.type': 'Durée du contrat', 'job.dateFin': 'Date de fin (CDD)', 'job.essaiMois': 'Période d’essai (mois)', 'job.essaiRenouvelable': 'Essai renouvelable', 'job.horaire': 'Horaire hebdomadaire', 'job.lieu': 'Lieu de travail', 'job.lieuSignature': 'Contrat établi à', 'job.dateContrat': 'Date du contrat', 'job.exemplaires': 'Exemplaires', 'salary.base': 'Salaire de base', 'salary.sursalaire': 'Sursalaire', 'salary.transport': 'Indemnité de transport', 'salary.logement': 'Indemnité de logement', 'salary.anciennetePct': 'Ancienneté (%)', 'employer.name': 'Employeur', 'employer.siege': 'Siège social', 'employer.representant': 'Représentant', 'employer.qualite': 'Qualité du représentant', 'employer.activite': 'Activité', 'dmt.cni': 'Carte d’identité n°', 'dmt.ccpf': 'N° CSS (C.C.P.F.)', 'dmt.agrom': 'N° IPRES (A.G.R.O.M.)', 'dmt.ethnie': 'Groupe ethnique' };

  const ALIAS = new Map(); SPEC.forEach(([key, list]) => list.forEach((a) => { if (!ALIAS.has(a)) ALIAS.set(a, key); }));
  const ALIASES_DESC = [...ALIAS.keys()].sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
  const LABEL_RE = new RegExp('(?:^|[\\s;,(\\-–—.])(' + ALIASES_DESC.map(esc).join('|') + ')\\s*(?:\\([^)]{0,18}\\))?\\s*:', 'g');

  /* ───────── Interprétation des valeurs ───────── */
  function put(f, path, v) { if (v === '' || v == null || (typeof v === 'number' && !Number.isFinite(v))) return; if (f[path] === undefined) f[path] = v; }
  function assign(f, key, raw) {
    const v = clean(raw); if (!v) return;
    const fv = fold(v);
    switch (key) {
      case 'worker.nomComplet': { const w = v.split(/\s+/); const up = w.filter((x) => x.length > 1 && x === x.toUpperCase() && /[A-ZÀ-Ý]/.test(x)); if (up.length && up.length < w.length) { put(f, 'worker.nom', up.join(' ')); put(f, 'worker.prenoms', w.filter((x) => !up.includes(x)).join(' ')); } else if (w.length > 1) { put(f, 'worker.prenoms', w.slice(0, -1).join(' ')); put(f, 'worker.nom', w[w.length - 1]); } else put(f, 'worker.nom', v); return; }
      case 'worker.nom': put(f, key, v); return;
      case 'worker.naissanceLieu': case 'worker.naissance': { const d = parseDate(v); if (d) put(f, 'worker.naissance', d); const m = /(?:^|\s)(?:à|a|au)\s+([^\d]{2,40})$/i.exec(v); if (m) put(f, 'worker.lieuNaissance', clean(m[1])); else if (!d && key === 'worker.naissanceLieu') put(f, 'worker.lieuNaissance', v); return; }
      case 'worker.sexe': put(f, key, /^(f|fem|femme)/.test(fv) ? 'F' : /^(m|masc|homme)/.test(fv) ? 'M' : ''); return;
      case 'worker.civilite': { const c = /madame|mme/.test(fv) ? 'Madame' : /mademoiselle|mlle/.test(fv) ? 'Mademoiselle' : /monsieur|mr|m\./.test(fv) ? 'Monsieur' : ''; put(f, key, c); if (c && c !== 'Monsieur') put(f, 'worker.sexe', 'F'); else if (c) put(f, 'worker.sexe', 'M'); return; }
      case 'worker.filiation': { const m = /^(?:fils|fille)?\s*(?:de\s+|d')?(.+?)\s+et\s+(?:de\s+|d')?(.+)$/i.exec(v); if (m) { put(f, 'worker.pere', clean(m[1])); put(f, 'worker.mere', clean(m[2])); } return; }
      case 'worker.famille': { const k = /celibat/.test(fv) ? 'celibataire' : /divorc/.test(fv) ? 'divorce' : /veuf|veuve/.test(fv) ? 'veuf' : /mari/.test(fv) ? 'marie' : ''; put(f, key, k); const n = /(\d+|[a-z]+)\s+enfants?/.exec(fv); if (/sans enfant/.test(fv)) put(f, 'worker.enfants', 0); else if (n) { const c = parseCount(n[1]); if (c != null) put(f, 'worker.enfants', c); } return; }
      case 'worker.enfants': { const c = parseCount(v); if (c != null) put(f, key, c); return; }
      case 'worker.pays': case 'worker.nationalite': case 'worker.lieuNaissance': case 'worker.pere': case 'worker.mere': case 'worker.domicile': case 'worker.nomsEpouses': case 'worker.nomsEnfants': put(f, key, v); return;
      case 'job.dateEngagement': case 'job.dateContrat': case 'job.dateFin': put(f, key, parseDate(v)); return;
      case 'job.duree': { const t = /indetermin|\bcdi\b/.test(fv) ? 'CDI' : /determin|\bcdd\b/.test(fv) ? 'CDD' : ''; put(f, 'job.type', t); const m = /du\s+(.+?)\s+au\s+(.+)$/.exec(fv); if (t === 'CDD' && m) { put(f, 'job.dateEngagement', parseDate(m[1])); put(f, 'job.dateFin', parseDate(m[2])); } return; }
      case 'job.essai': { const c = /\bsans\b|aucun|neant|pas de/.test(fv) ? 0 : parseCount(v); if (c != null) { put(f, 'job.essaiMois', c); if (/renouvelable/.test(fv)) put(f, 'job.essaiRenouvelable', true); } return; }
      case 'job.horaire': { const m = /\b(\d{2})(?:[.,]\d+)?\b/.exec(fv); if (m && Number(m[1]) >= 20 && Number(m[1]) <= 60) put(f, key, Number(m[1])); return; }
      case 'salary.base': case 'salary.sursalaire': case 'salary.transport': case 'salary.logement': { const n = parseMoney(v); if (n != null && n >= 0) put(f, key, n); return; }
      case 'salary.anciennete': { const n = parseMoney(v.replace(',', '.')); if (n == null) return; if (/%/.test(v) || n <= 50) put(f, 'salary.anciennetePct', n); else put(f, 'salary.ancienneteMontant', n); return; }
      case 'dmt.cni': case 'dmt.ccpf': case 'dmt.agrom': case 'dmt.ethnie': put(f, key, v); return;
      default: put(f, key, v);
    }
  }

  /* ───────── Analyse d'une ligne / d'un paragraphe ───────── */
  function scanLine(line, f, unknown) {
    const text = String(line), folded = fold(text); let found = 0; const hits = []; LABEL_RE.lastIndex = 0; let m;
    while ((m = LABEL_RE.exec(folded))) { hits.push({ key: ALIAS.get(m[1]), start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].length }); LABEL_RE.lastIndex = m.index + m[0].length - 1; }
    hits.forEach((h, i) => { const val = text.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : text.length); if (clean(val)) { assign(f, h.key, val); found++; } });
    return found;
  }
  const SENTENCES = [
    [/^(?:le |la |l[’'])?(.+?)\s+dont le si[eè]ge(?: social)? est (?:situ[ée]e?|sis(?:e)?)\s+(?:[àa]|au)\s+(.+?),?\s+repr[ée]sent[ée]e?\s+par\s+(.+?),?\s+en sa qualit[ée] d[e’']\s*(.+?)\.?$/i, (f, m) => { put(f, 'employer.name', clean(m[1])); put(f, 'employer.siege', clean(m[2])); put(f, 'employer.representant', clean(m[3])); put(f, 'employer.qualite', clean(m[4])); }],
    [/p[ée]riode d[’']essai de\s+(.+?)\s+mois/i, (f, m, t) => { const c = parseCount(m[1]); if (c != null) put(f, 'job.essaiMois', c); if (/renouvelable/i.test(t)) put(f, 'job.essaiRenouvelable', true); }],
    [/sans p[ée]riode d[’']essai/i, (f) => put(f, 'job.essaiMois', 0)],
    [/en\s+\S+\s*\((\d+)\)\s+exemplaires/i, (f, m) => put(f, 'job.exemplaires', Number(m[1]))],
    [/horaire de travail est en principe de\s+(\d{2})\s+heures/i, (f, m) => put(f, 'job.horaire', Number(m[1]))],
    [/assumer la fonction\s+(.+?)(?:\s+[àa] l[’']adresse suivante\s*:\s*(.+?))?\.?$/i, (f, m) => { put(f, 'job.emploi', clean(m[1])); if (m[2]) put(f, 'job.lieu', clean(m[2])); }],
    [/^([A-ZÀ-Ý][A-Za-zÀ-ÿ' -]{1,28}),\s*le\s+(\d{1,2}\s*(?:er)?\s+[A-Za-zÀ-ÿ]+\s+\d{4}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})\s*$/, (f, m) => { put(f, 'job.lieuSignature', clean(m[1])); put(f, 'job.dateContrat', parseDate(m[2])); }],
    [/^(monsieur|madame|mademoiselle)\s*,?\s*$/i, (f, m) => assign(f, 'worker.civilite', m[1])]
  ];
  function scanSentences(text, f) { SENTENCES.forEach(([re, fn]) => { const m = re.exec(text); if (m) fn(f, m, text); }); }
  const labelOnly = (cell) => { const k = clean(fold(cell)).replace(/\s*[:：]\s*$/, ''); return ALIAS.get(k) || ALIAS.get(k.replace(/\s*\([^)]*\)\s*$/, '')) || null; };
  const NUM_LINE = /^(.{3,40}?)\s{2,}|\t+([\d\s.,]+)\s*(?:fcfa|f cfa|cfa|f)?\s*$/i;

  /** Blocs → candidats [{ name, fields, unknown }] (plusieurs si un tableau Excel liste plusieurs travailleurs). */
  function extract(blocks) {
    const rows = blocks.filter((b) => b.type === 'row'), candidates = [];
    // tableau à en-têtes : ≥ 3 colonnes reconnues sur une ligne, valeurs sur les lignes suivantes
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]; if (b.type !== 'row') continue;
      const cols = b.cells.map((c, ci) => ({ ci, key: labelOnly(c) })).filter((x) => x.key);
      if (cols.length >= 3 && new Set(cols.map((c) => c.key)).size === cols.length && !b.cells.some((c) => /:/.test(c))) {
        for (let j = i + 1; j < blocks.length && blocks[j].type === 'row'; j++) {
          const r = blocks[j]; if (r.cells.filter((c) => labelOnly(c)).length >= 2) break;
          const f = {}; cols.forEach((c) => assign(f, c.key, r.cells[c.ci]));
          if (Object.keys(f).length) candidates.push({ name: [f['worker.prenoms'], f['worker.nom']].filter(Boolean).join(' ') || 'Ligne ' + (j + 1), fields: f, unknown: [] });
        }
        if (candidates.length) return finish(candidates);
      }
    }
    // document « libellé : valeur » (contrat Word, formulaire, feuille à deux colonnes)
    const f = {}, unknown = [];
    blocks.forEach((b) => {
      if (b.type === 'p') { const found = scanLine(b.text, f, unknown); scanSentences(b.text, f); if (!found) { const m = /^(.{3,45}?)\s+(\d[\d\s.,]*)\s*(?:fcfa|f cfa|cfa|f)?\s*$/i.exec(b.text); if (m) { const k = ALIAS.get(fold(clean(m[1])).replace(/^(?:[ivx]+|\d+)[.)]\s*/, '')); if (k) assign(f, k, m[2]); } } }
      else {
        const cells = b.cells; let i = 0;
        while (i < cells.length) {
          const c = cells[i]; if (!c) { i++; continue; }
          const inline = scanLine(c, f, unknown);
          if (!inline) { const k = labelOnly(c); if (k) { let j = i + 1; while (j < cells.length && !cells[j]) j++; if (j < cells.length && !labelOnly(cells[j])) { assign(f, k, cells[j]); i = j; } } else scanSentences(c, f); }
          i++;
        }
      }
    });
    if (f['job.ancienneteMontant'] !== undefined) { if (f['salary.base'] > 0 && f['salary.anciennetePct'] === undefined) f['salary.anciennetePct'] = Math.round((f['job.ancienneteMontant'] / f['salary.base']) * 10000) / 100; delete f['job.ancienneteMontant']; }
    if (f['salary.ancienneteMontant'] !== undefined) { if (f['salary.base'] > 0 && f['salary.anciennetePct'] === undefined) f['salary.anciennetePct'] = Math.round((f['salary.ancienneteMontant'] / f['salary.base']) * 10000) / 100; delete f['salary.ancienneteMontant']; }
    if (Object.keys(f).length) candidates.push({ name: [f['worker.prenoms'], f['worker.nom']].filter(Boolean).join(' ') || 'Fichier', fields: f, unknown });
    return finish(candidates);
  }
  function finish(candidates) {
    candidates.forEach((c) => {
      const f = c.fields;
      c.items = Object.keys(f).map((path) => ({ path, label: NAMES[path] || path, value: f[path] }));
    });
    return candidates;
  }

  /* ───────── Application au contrat ───────── */
  function setPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; return a[k]; }, o); t[last] = v; }
  /** Applique les valeurs retenues (liste de chemins) au contrat ; renvoie les chemins réellement appliqués. */
  function apply(contract, fields, only) {
    const applied = [];
    Object.keys(fields).forEach((p) => { if (only && !only.includes(p)) return; setPath(contract, p, fields[p]); applied.push(p); });
    return applied;
  }

  const api = { docxXmlToBlocks, rowsToBlocks, csvToRows, extract, apply, parseDate, parseMoney, NAMES, fold, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaContractsImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
