/*
 * Corinta Pay — gestion des contrats de travail et DMT (interface du dossier d'entreprise).
 *
 * Menu du dossier › Contrats :
 *   • Élaboration de contrat : formulaire du contrat (modèle CDI/CDD) puis onglet DMT. Les informations saisies dans le contrat
 *     sont reprises automatiquement dans la DMT (lecture seule) ; la DMT ne demande que les compléments (immatriculations,
 *     pièce d'identité, visas, situation militaire…).
 *   • Gestion des contrats : liste, filtres, alertes (fin d'essai, échéance de CDD, DMT à établir), statuts, impression.
 *
 * Données : company.contracts (dans le dossier de l'entreprise : isolation par entreprise, sauvegarde et synchronisation
 * identiques aux autres données). Règles pures : contracts-core.js (testées).
 */
(function () {
  'use strict';
  const IM = window.CorintaContractsImport;
  const K = window.CorintaContracts, WS = window.CorintaWS, D = window.CorintaDash;
  if (!K || !IM || !WS || !D || typeof WS.registerModule !== 'function') { console.error('contracts.js : modules requis introuvables'); return; }

  const $ = (id) => document.getElementById(id);
  const esc = D.esc, icon = D.icon;
  const todayISO = () => new Date().toLocaleDateString('sv-SE');
  const str = (v) => (v == null ? '' : String(v).trim());
  const frDate = (iso) => { const p = String(iso || '').split('-'); return p.length === 3 && p[0] ? p[2] + '/' + p[1] + '/' + p[0] : ''; };
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const longDate = (iso) => { const p = String(iso || '').split('-').map(Number); return p.length === 3 && p[0] ? String(p[2]).padStart(2, '0') + ' ' + MOIS[p[1] - 1][0].toUpperCase() + MOIS[p[1] - 1].slice(1) + ' ' + p[0] : ''; };
  const money = (v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0)).replace(/ | /g, ' ');
  const WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'];
  const inWords = (n) => { n = Math.round(Number(n) || 0); return (WORDS[n] || String(n)) + ' (' + String(n).padStart(2, '0') + ')'; };

  /* ───────── État de l'écran (par entreprise) ───────── */
  const view = { imp: null, imported: new Set(), afterImport: false, companyId: '', draft: null, tab: 'contract', q: '', fStatus: '', fType: '', msg: '', timer: 0, derivedTimer: 0, dirty: false };
  const company = () => ORG.items.find((c) => c.id === WS.state.companyId);
  const contractsOf = (c) => (Array.isArray(c.contracts) ? c.contracts : (c.contracts = []));
  function ensureView() {
    const c = company();
    if (view.companyId !== (c && c.id)) { Object.assign(view, { imp: null, imported: new Set(), afterImport: false, companyId: c && c.id, draft: null, tab: 'contract', q: '', fStatus: '', fType: '', msg: '', dirty: false }); }
    if (!view.draft && c) view.draft = K.blankContract(c, todayISO());
    return c;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = v; }

  /* ───────── Import Word / Excel : lecture du fichier (dans le navigateur, rien n'est envoyé) ───────── */
  async function xlsxAllRows(ab) {
    const z = await unzipEntries(ab); let strings = [];
    if (z['xl/sharedStrings.xml']) strings = [...xmlDoc(z['xl/sharedStrings.xml']).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((x) => x.textContent).join(''));
    const keys = Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
    if (!keys.length) throw Error('Aucune feuille de calcul dans ce fichier Excel.');
    const rows = [];
    keys.forEach((k) => [...xmlDoc(z[k]).getElementsByTagName('row')].forEach((row) => {
      const vals = [];
      [...row.getElementsByTagName('c')].forEach((c) => {
        const ref = c.getAttribute('r') || 'A1', letters = ref.match(/^[A-Z]+/)[0]; let col = 0; for (const ch of letters) col = col * 26 + ch.charCodeAt(0) - 64;
        let v = (c.getElementsByTagName('v')[0] || {}).textContent || ''; const type = c.getAttribute('t');
        if (type === 's') v = strings[Number(v)] || ''; else if (type === 'inlineStr') v = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
        vals[col - 1] = v;
      });
      rows.push(vals);
    }));
    return rows;
  }
  async function readFileBlocks(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (file.size > 6 * 1024 * 1024) throw Error('Fichier trop volumineux (6 Mo maximum).');
    if (ext === 'docx' || ext === 'docm') { const z = await unzipEntries(await file.arrayBuffer()); if (!z['word/document.xml']) throw Error('Document Word illisible.'); return IM.docxXmlToBlocks(z['word/document.xml']); }
    if (ext === 'xlsx' || ext === 'xlsm') return IM.rowsToBlocks(await xlsxAllRows(await file.arrayBuffer()));
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return IM.rowsToBlocks(IM.csvToRows(await file.text()));
    if (ext === 'doc' || ext === 'xls') throw Error('L’ancien format .' + ext + ' n’est pas lu : ouvrez le fichier puis enregistrez-le au format .' + ext + 'x, et réimportez-le.');
    if (ext === 'pdf') throw Error('Un PDF n’est pas lu automatiquement : importez le Word ou l’Excel d’origine.');
    throw Error('Format non pris en charge : utilisez un fichier Word (.docx) ou Excel (.xlsx).');
  }
  async function handleFile(file) {
    if (!file) return;
    view.imp = { fileName: file.name, candidates: [], pick: 0, off: new Set(), error: '', busy: true }; render();
    try {
      const blocks = await readFileBlocks(file), cands = IM.extract(blocks);
      view.imp.busy = false;
      if (!cands.length) view.imp.error = 'Aucune information de contrat reconnue dans « ' + file.name + ' ». Vérifiez que le fichier contient des libellés comme « Nom », « Prénoms », « Emploi », « Date d’engagement », « Salaire de base »… ou remplissez le formulaire manuellement.';
      else view.imp.candidates = cands;
    } catch (e) { view.imp.busy = false; view.imp.error = (e && e.message) || String(e); }
    render();
  }
  const isDate = (p) => /date|naissance$/i.test(p) && !/lieu/i.test(p);
  function importHTML() {
    const imp = view.imp;
    const head = '<article class="cp-card ws-form"><div class="cp-card-head"><div><h2>Source des informations</h2><p class="cp-sub">Remplissez le formulaire à la main, ou importez un fichier Word (.docx) ou Excel (.xlsx) : le logiciel en extrait les informations du contrat, vous complétez ce qui manque. Le fichier est lu sur votre ordinateur, il n’est envoyé nulle part.</p></div></div>' +
      '<div class="ct-bar"><button type="button" class="cp-btn" data-ct="imp-manual">✎ Remplir manuellement</button><button type="button" class="cp-btn primary" data-ct="imp-pick">' + icon('upload') + 'Importer un fichier Word ou Excel</button><input id="ctFile" type="file" accept=".docx,.docm,.xlsx,.xlsm,.csv,.tsv,.txt" hidden></div>' +
      '<div id="ctDrop" class="ct-drop" tabindex="0">Glissez-déposez ici un contrat Word, une fiche Excel ou un tableau de recrutement</div>';
    if (!imp) return head + '</article>';
    if (imp.busy) return head + '<p class="cp-sub" role="status">Lecture de « ' + esc(imp.fileName) + ' »…</p></article>';
    if (imp.error) return head + '<p class="ct-issues err" role="alert" style="margin-top:10px">' + esc(imp.error) + '</p></article>';
    const cand = imp.candidates[imp.pick] || imp.candidates[0], n = cand.items.length;
    const field = (it) => {
      const id = 'ctImp_' + it.path.replace(/\./g, '_'), v = it.value;
      const ENUM = { 'job.type': Object.entries(K.TYPE_LABEL), 'worker.sexe': [['M', 'Masculin'], ['F', 'Féminin']], 'worker.famille': Object.entries(K.FAMILLE), 'worker.civilite': [['Monsieur', 'Monsieur'], ['Madame', 'Madame'], ['Mademoiselle', 'Mademoiselle']] };
      if (ENUM[it.path]) return '<select id="' + id + '" data-imp-val="' + esc(it.path) + '" aria-label="' + esc(it.label) + '">' + ENUM[it.path].map(([k, l]) => '<option value="' + esc(k) + '"' + (String(v) === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>';
      if (typeof v === 'boolean') return '<input id="' + id + '" type="checkbox" data-imp-val="' + esc(it.path) + '"' + (v ? ' checked' : '') + ' aria-label="' + esc(it.label) + '">';
      if (typeof v === 'number') return '<input id="' + id + '" type="number" data-imp-val="' + esc(it.path) + '" value="' + v + '" aria-label="' + esc(it.label) + '">';
      if (isDate(it.path)) return '<input id="' + id + '" type="date" data-imp-val="' + esc(it.path) + '" value="' + esc(v) + '" aria-label="' + esc(it.label) + '">';
      return '<input id="' + id + '" type="text" data-imp-val="' + esc(it.path) + '" value="' + esc(v) + '" aria-label="' + esc(it.label) + '">';
    };
    return head + '<div class="ct-imp"><p class="cp-sub"><b>' + esc(imp.fileName) + '</b> · ' + n + ' information' + (n > 1 ? 's' : '') + ' reconnue' + (n > 1 ? 's' : '') + '. Vérifiez, corrigez si besoin, décochez ce que vous ne voulez pas reprendre.</p>' +
      (imp.candidates.length > 1 ? '<div class="ws-field"><label for="ctImpPick">Travailleur à reprendre (' + imp.candidates.length + ' lignes dans le fichier)</label><select id="ctImpPick">' + imp.candidates.map((c, i) => '<option value="' + i + '"' + (i === imp.pick ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' : '') +
      '<div class="ct-imp-grid">' + cand.items.map((it) => '<label class="ct-imp-row"><input type="checkbox" data-imp-chk="' + esc(it.path) + '"' + (imp.off.has(it.path) ? '' : ' checked') + ' aria-label="Reprendre : ' + esc(it.label) + '"><span>' + esc(it.label) + '</span>' + field(it) + '</label>').join('') + '</div>' +
      '<div class="ct-bar"><button type="button" class="cp-btn primary" data-ct="imp-apply">' + icon('check') + 'Appliquer au contrat</button><button type="button" class="cp-btn" data-ct="imp-cancel">Annuler</button></div></div></article>';
  }
  function applyImport() {
    const imp = view.imp; if (!imp || !imp.candidates.length) return;
    const cand = imp.candidates[imp.pick] || imp.candidates[0], d = view.draft, only = cand.items.map((i) => i.path).filter((p) => !imp.off.has(p));
    if (!only.length) { toast('Aucune information sélectionnée.'); return; }
    const newNom = String(cand.fields['worker.nom'] || '').toUpperCase(), curNom = String(d.worker.nom || '').toUpperCase();
    if (curNom && newNom && curNom !== newNom && !confirm('Le contrat en cours concerne ' + d.worker.nom + '. Remplacer ses informations par celles de ' + cand.fields['worker.nom'] + ' ?')) return;
    const applied = IM.apply(d, cand.fields, only);
    if (applied.includes('job.type')) { const keep = d.job.type; d.job.type = 'CDI'; K.switchType(d, keep); }
    if (d.worker.famille === 'marie' && !d.worker.epouses) d.worker.epouses = 1;
    view.imported = new Set(applied); view.afterImport = true; view.imp = null; view.net = null;
    commit(); setMsg(applied.length + ' informations importées : complétez les champs signalés.'); toast(applied.length + ' informations importées dans le contrat'); render(); setTimeout(updateDerived, 30);
  }

  /* ───────── Enregistrement ───────── */
  function commit(opts) {
    const c = company(), d = view.draft; if (!c || !d) return false;
    if (!str(d.worker.nom) || !str(d.worker.prenoms)) { setMsg('Saisissez le nom et les prénoms : l’enregistrement est alors automatique.', true); return false; }
    const list = contractsOf(c);
    d.updatedAt = todayISO(); if (!d.createdAt) d.createdAt = d.updatedAt;
    if (!d.number) d.number = K.nextNumber(list, d.updatedAt);
    const i = list.findIndex((x) => x.id === d.id); if (i >= 0) list[i] = clone(d); else list.unshift(clone(d));
    c.profile = Object.assign({}, c.profile, { siege: d.employer.siege, representant: d.employer.representant, qualite: d.employer.qualite, activite: d.employer.activite, signataire: d.employer.signataire, ville: d.job.lieuSignature });
    persistOrg(); view.dirty = false;
    setMsg('Enregistré · ' + new Date().toLocaleTimeString('fr-FR') + ' · ' + d.number); refreshMeta();
    return true;
  }
  function setMsg(text, bad) { view.msg = text; const el = $('ctStatus'); if (el) { el.textContent = text; el.style.color = bad ? '#8a5300' : ''; } }
  const queueCommit = () => { clearTimeout(view.timer); view.timer = setTimeout(() => commit(), 450); };

  /* ───────── Calcul du net estimé avec le moteur de paie (sans toucher à la saisie en cours) ───────── */
  function payFields(d) {
    const w = d.worker, s = d.salary, t = K.salaryTotals(s), married = w.famille === 'marie';
    const spouse = !married ? 'single' : (w.sexe === 'F' ? (w.conjointRevenus ? 'husband-income' : 'husband-no-income') : (w.conjointRevenus ? 'wife-income' : 'wife-no-income'));
    const rub = [];
    if (t.logement > 0) rub.push({ name: 'Indemnité de logement', type: 'g', value: t.logement });
    if (t.anciennete > 0) rub.push({ name: 'Prime d’ancienneté', type: 'g', value: t.anciennete });
    return { name: K.fullName(w), job: d.job.emploi, hire: K.iso(d.job.dateEngagement), period: (K.iso(d.job.dateEngagement) || todayISO()).slice(0, 7), base: String(t.base), extra: String(t.sursalaire), transport: String(t.transport), days: '30', children: String(Math.max(0, Math.round(K.num(w.enfants)))), trimfStatus: spouse, married: married ? '1' : '0', extraRubrics: rub };
  }
  function estimateNet(d) {
    try {
      const keep = employeeFields(), keepName = $('companyName').value, keepEmp = ACTIVE_EMPLOYEE;
      try { restorePayrollFields(payFields(d), true); return { net: Math.round(window.payrollSnapshot.net), ded: Math.round(window.payrollSnapshot.totalDeductions) }; }
      finally { ACTIVE_EMPLOYEE = keepEmp; $('companyName').value = keepName; restorePayrollFields(keep, true); }
    } catch (e) { console.error('Estimation du net', e); return null; }
  }
  function prepareBulletin() {
    const d = view.draft, v = K.validate(d); if (!commit()) return;
    if (!v.valid) { setMsg('Complétez le contrat avant de préparer le bulletin.', true); render(); return; }
    ACTIVE_EMPLOYEE = ''; restorePayrollFields(payFields(d), false);
    $('companyName').value = d.employer.name || $('companyName').value;
    activateView('pay'); toast('Bulletin préparé depuis le contrat ' + d.number + ' : vérifiez puis enregistrez');
  }

  /* ───────── Documents (modèles fournis) : aperçu, impression, Word et Excel viennent du même modèle (contracts-export.js) ───────── */
  const X = () => window.CorintaContractsExport;

  /* Aperçu et impression (zone dédiée : aucune fenêtre externe, compatible avec la politique de sécurité du site) */
  function ensureDocUi() {
    if ($('ctPreview')) return;
    const st = document.createElement('style'); st.id = 'ctDocCss'; st.textContent = X().CSS + '#docPrint{display:none}@media print{body.printing-doc > *:not(#docPrint){display:none!important}body.printing-doc #docPrint{display:block!important}}';
    document.head.appendChild(st);
    const m = document.createElement('div'); m.id = 'ctPreview'; m.className = 'modal hidden'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Aperçu du document');
    m.innerHTML = '<div class="modal-card" style="width:min(940px,96vw);max-height:94vh;display:flex;flex-direction:column;gap:10px"><div class="modal-actions" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><b id="ctPreviewTitle">Aperçu</b><span style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="btn primary" data-ctp="dl" id="ctPreviewDl">Télécharger</button><button type="button" class="btn" data-ctp="print">Imprimer / PDF</button><button type="button" class="btn" data-ctp="close">Fermer</button></span></div><div id="ctPreviewBody" style="overflow:auto;background:#e8edf5;padding:12px;border-radius:10px"></div></div>';
    document.body.appendChild(m);
    const pr = document.createElement('div'); pr.id = 'docPrint'; document.body.appendChild(pr);
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.closest('[data-ctp=close]')) m.classList.add('hidden');
      if (e.target.closest('[data-ctp=print]')) printHtml($('ctPreviewBody').innerHTML, $('ctPreviewTitle').textContent);
      if (e.target.closest('[data-ctp=dl]') && view.previewCtx) downloadDoc(view.previewCtx.kind, view.previewCtx.d);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') m.classList.add('hidden'); });
  }
  function showDoc(html, title, ctx) {
    ensureDocUi(); view.previewCtx = ctx || null;
    $('ctPreviewTitle').textContent = title; $('ctPreviewBody').innerHTML = html; $('ctPreview').classList.remove('hidden');
    const dl = $('ctPreviewDl'); dl.hidden = !ctx; if (ctx) dl.textContent = ctx.kind === 'dmt' ? 'Télécharger Excel (.xlsx)' : 'Télécharger Word (.docx)';
  }
  function printHtml(html, title) {
    ensureDocUi(); const pr = $('docPrint'), t = document.title; pr.innerHTML = html; document.title = title;
    const done = () => { window.removeEventListener('afterprint', done); document.body.classList.remove('printing-doc'); document.title = t; pr.innerHTML = ''; };
    window.addEventListener('afterprint', done); setTimeout(() => { document.title = t; }, 60000);
    document.body.classList.add('printing-doc'); setTimeout(() => window.print(), 50);
  }
  const netOf = (d) => (estimateNet(d) || {}).net || 0;
  function docFor(kind, d) {
    const co = company(), name = (K.fullName(d.worker) || 'travailleur').replace(/[^\p{L}\p{N}]+/gu, '-'), x = X();
    if (kind === 'dmt') return { html: x.dmtHtml(x.dmtData(K.dmtView(d, co), netOf(d))), title: 'DMT-' + name };
    return { html: x.modelHtml(x.contractModel(d)), title: 'Contrat-' + (d.number || 'brouillon') + '-' + name };
  }
  function checked(d) {
    const v = K.validate(d);
    if (!v.valid) { setMsg(v.errors[0], true); toast(v.errors[0]); if (WS.state.module === 'contract-new') render(); return false; }
    return true;
  }
  function openDoc(kind, d, print) {
    if (!checked(d)) return;
    const x = docFor(kind, d); if (print) printHtml(x.html, x.title); else showDoc(x.html, (kind === 'dmt' ? 'DMT · ' : 'Contrat · ') + K.fullName(d.worker), { kind, d });
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a'), url = URL.createObjectURL(blob); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  /** Contrat → .docx (Word) ; DMT → .xlsx (Excel). Même modèle de données que l'aperçu. */
  function downloadDoc(kind, d) {
    if (!checked(d)) return;
    try {
      const x = X(), name = x.fileName(kind, d);
      const bytes = kind === 'dmt' ? x.dmtXlsx(x.dmtData(K.dmtView(d, company()), netOf(d))) : x.modelDocx(x.contractModel(d), { title: 'Contrat de travail ' + K.fullName(d.worker) });
      saveBlob(new Blob([bytes], { type: x.MIME[kind === 'dmt' ? 'xlsx' : 'docx'] }), name); toast(name + ' téléchargé');
    } catch (err) { console.error('Export du document', err); toast('Export impossible : ' + (err && err.message ? err.message : err)); }
  }

  /* ───────── Formulaires ───────── */
  const fld = (path, label, o) => {
    o = o || {}; const d = view.draft, v = getPath(d, path), type = o.type || 'text', id = 'ct_' + path.replace(/\./g, '_'), ro = o.readonly ? ' readonly' : '';
    const REQ = ['worker.nom', 'worker.prenoms', 'job.emploi', 'job.dateEngagement', 'salary.base'], miss = view.afterImport && REQ.includes(path) && (v == null || v === '' || v === 0);
    const cls = 'ws-field' + (o.wide ? ' wide' : '') + (view.imported.has(path) ? ' imp' : '') + (miss ? ' need' : ''), attrs = ' data-ct-f="' + path + '"' + (o.redraw ? ' data-ct-r="1"' : '') + (o.title ? ' title="' + esc(o.title) + '"' : '');
    if (type === 'select') return '<div class="' + cls + '"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '"' + attrs + '>' + o.options.map(([k, l]) => '<option value="' + esc(k) + '"' + (String(v) === String(k) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>';
    if (type === 'textarea') return '<div class="' + cls + ' wide"><label for="' + id + '">' + esc(label) + '</label><textarea id="' + id + '" rows="' + (o.rows || 3) + '"' + attrs + '>' + esc(Array.isArray(v) ? v.join('\n') : v) + '</textarea></div>';
    if (type === 'checkbox') return '<label class="ws-check"><input type="checkbox" id="' + id + '"' + attrs + (v ? ' checked' : '') + '> ' + esc(label) + '</label>';
    return '<div class="' + cls + '"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" type="' + type + '"' + (type === 'number' ? ' min="0" step="any"' : '') + attrs + ' value="' + esc(v == null ? '' : v) + '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + ro + '></div>';
  };
  const card = (title, sub, body) => '<article class="cp-card ws-form"><h2>' + esc(title) + '</h2>' + (sub ? '<p class="cp-sub">' + sub + '</p>' : '') + '<div class="ws-grid-fields">' + body + '</div></article>';

  function issuesHTML(d) {
    const v = K.validate(d);
    return (v.errors.length ? '<ul class="ct-issues err">' + v.errors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '<p class="ct-ok">✔ Informations essentielles complètes.</p>') + (v.warnings.length ? '<ul class="ct-issues">' + v.warnings.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '');
  }
  function derivedHTML(d) {
    const t = K.salaryTotals(d.salary), te = K.trialEnd(d), n = view.net;
    return '<div class="ct-derived"><div><span>Brut mensuel du contrat (transport compris)</span><b>' + money(t.brutContrat) + ' FCFA</b></div><div><span>Brut DMT (hors transport)</span><b>' + money(t.brutDmt) + ' FCFA</b></div><div><span>Taux horaire (base ÷ 173,33)</span><b>' + money(t.tauxHoraire) + ' FCFA</b></div><div><span>Net estimé (moteur de paie)</span><b>' + (n ? money(n.net) + ' FCFA' : '—') + '</b></div>' + (te ? '<div><span>Fin de la période d’essai</span><b>' + frDate(te) + '</b></div>' : '') + '</div>';
  }
  function updateDerived() {
    const d = view.draft; if (!d || WS.state.module !== 'contract-new') return;
    const n = K.salaryTotals(d.salary).base > 0 ? estimateNet(d) : null; view.net = n;
    const a = $('ctDerived'), b = $('ctIssues'); if (a) a.innerHTML = derivedHTML(d); if (b) b.innerHTML = issuesHTML(d); refreshMeta();
  }

  function contractTab(d) {
    const W = (p, l, o) => fld('worker.' + p, l, o), J = (p, l, o) => fld('job.' + p, l, o), E = (p, l, o) => fld('employer.' + p, l, o), S = (p, l, o) => fld('salary.' + p, l, o);
    const married = d.worker.famille === 'marie';
    return card('Employeur', 'Repris du profil de l’entreprise ; enregistré pour les prochains contrats.',
      E('prefixe', 'Présentation (ex. L’entreprise, Le Cabinet)', { placeholder: 'L’entreprise' }) + E('name', 'Raison sociale de l’employeur') + E('siege', 'Siège social', { placeholder: 'Dakar, Immeuble…' }) + E('representant', 'Représenté par', { placeholder: 'Madame … / Monsieur …' }) + E('qualite', 'En sa qualité de') + E('signataire', 'Signataire du contrat', { title: 'Texte affiché au-dessus de la signature' }) + E('activite', 'Activité de l’établissement (DMT)')) +
      card('Travailleur', 'Ces informations sont reprises automatiquement dans la DMT.',
        W('civilite', 'Civilité', { type: 'select', options: [['Monsieur', 'Monsieur'], ['Madame', 'Madame'], ['Mademoiselle', 'Mademoiselle']] }) + W('sexe', 'Sexe', { type: 'select', options: [['M', 'Masculin'], ['F', 'Féminin']], redraw: true }) + W('nom', 'Nom') + W('prenoms', 'Prénoms') +
        W('naissance', 'Date de naissance', { type: 'date' }) + W('lieuNaissance', 'Lieu de naissance') + W('pays', 'Pays de naissance') + W('nationalite', 'Nationalité') + W('pere', 'Père (fils/fille de)') + W('mere', 'Mère') + W('domicile', 'Domicile / adresse précise', { wide: true }) +
        W('famille', 'Situation de famille', { type: 'select', redraw: true, options: Object.entries(K.FAMILLE) }) + W('enfants', 'Enfants à charge', { type: 'number' }) +
        (married ? W('conjointRevenus', 'Le conjoint a un revenu professionnel (IR et TRIMF du bulletin)', { type: 'checkbox' }) : '')) +
      card('Emploi et durée', d.job.type === 'CDD_PROJET' ? 'Modèle CDD du cabinet, adapté à un contrat conclu pour la durée d’un projet : le contrat prend fin à l’achèvement du projet.' : (K.isCdd(d.job.type) ? 'Modèle : contrat de travail à durée déterminée (CDD).' : 'Modèle : contrat de travail à durée indéterminée (CDI).'),
        J('emploi', 'I. Emploi tenu') + J('classification', 'II. Classification professionnelle', { placeholder: '7ème B de la convention du commerce' }) + J('convention', 'Convention collective') + J('dateEngagement', 'III. Date de l’engagement', { type: 'date' }) +
        J('type', 'IV. Type de contrat', { type: 'select', redraw: true, options: Object.entries(K.TYPE_LABEL) }) + (d.job.type === 'CDD_PROJET' ? J('projetNom', 'Nom du projet', { placeholder: 'Intitulé du projet' }) + J('projetObjet', 'Objet du projet (mission, résultats attendus)', { wide: true }) : '') +
        (K.isCdd(d.job.type) ? J('dateFin', d.job.type === 'CDD_PROJET' ? 'Fin prévisionnelle du projet' : 'Date de fin du CDD', { type: 'date' }) + J('fonctionDetail', 'Fonction exercée (détail, zone d’affectation)', { wide: true, placeholder: 'Coordonnateur régional de l’antenne … dans la Région de …' }) : '') +
        J('essaiMois', 'Période d’essai (mois, 0 = aucune)', { type: 'number' }) + J('essaiRenouvelable', 'Renouvelable tacitement', { type: 'checkbox' }) + J('horaire', 'Horaire hebdomadaire (heures)', { type: 'number' }) + J('lieu', 'Lieu de travail (adresse)') + J('lieuSignature', 'Contrat établi à') + J('dateContrat', 'Date du contrat', { type: 'date', title: 'Par défaut : date de l’engagement' }) + J('exemplaires', 'Nombre d’exemplaires', { type: 'number' }) + (K.isCdd(d.job.type) ? J('copieInspection', 'Copie adressée à l’Inspection régionale du travail', { type: 'checkbox' }) : '')) +
      card('VII. Salaire', 'Montants mensuels bruts en FCFA.',
        S('base', 'Salaire de base') + S('sursalaire', 'Sursalaire') + S('logement', 'Indemnité de logement') + S('anciennetePct', 'Ancienneté (%)', { type: 'number' }) + S('transport', 'Indemnité de transport') + '<div class="wide" id="ctDerived">' + derivedHTML(d) + '</div>') +
      '<details class="cp-card ws-form"><summary><b>Clauses du contrat</b> (reprises du modèle, modifiables)</summary><div class="ws-grid-fields">' +
      fld('clauses.references', 'V. Références aux textes (une par ligne)', { type: 'textarea', rows: 6 }) + fld('clauses.conges', 'Régime des congés payés', { type: 'textarea' }) + fld('clauses.prevoyance', 'Prévoyance sociale', { type: 'textarea' }) + fld('clauses.discipline', 'Discipline – secret professionnel', { type: 'textarea', rows: 5 }) + fld('clauses.mobilite', 'Lieu de travail – mobilité', { type: 'textarea' }) + (K.isCdd(d.job.type) ? fld('clauses.duree', 'Clause de durée (variables : {duree} {debut} {fin} {projet} {objet} {finPrevue})', { type: 'textarea', rows: 4 }) : '') +
      '</div><p class="cp-sub">Les références juridiques sont celles de votre modèle (Code du travail de 1997) : vérifiez-les si le nouveau Code du travail (loi n° 15/2026) s’applique à ce contrat.</p></details>';
  }

  function dmtTab(d) {
    const co = company(), v = K.dmtView(d, co), s = v.synced, miss = K.dmtMissing(d, co);
    const ro = (l, val) => '<div class="ct-ro"><span>' + esc(l) + '</span><b>' + (esc(str(val)) || '—') + '</b></div>';
    const X = (p, l, o) => fld('dmt.' + p, l, Object.assign({}, o));
    const synced = '<article class="cp-card ws-form"><div class="cp-card-head"><div><h2>Repris du contrat</h2><p class="cp-sub">Synchronisé automatiquement : pour modifier une de ces informations, changez-la dans le contrat.</p></div><button type="button" class="cp-btn sm" data-ct="tab:contract">Modifier dans le contrat</button></div><div class="ct-ro-grid">' +
      ro('Nom', s.nom) + ro('Prénoms', s.prenoms) + ro('Sexe', s.sexe) + ro('Né(e) le', frDate(s.naissance)) + ro('À', s.lieuNaissance) + ro('Nationalité', s.nationalite) + ro('Père', s.pere) + ro('Mère', s.mere) + ro('Adresse', s.adresse) +
      ro('Situation de famille', s.famille) + ro('Enfants à charge', s.enfants) + ro('Date d’entrée', frDate(s.dateEntree)) + ro('Emploi', s.emploi) + ro('Catégorie', s.categorie) + ro('Convention collective', s.convention) + ro('Date du contrat', frDate(s.dateContrat)) +
      ro('Employeur', s.raisonSociale) + ro('Adresse de l’établissement', s.adresseEtablissement) + ro('Durée', s.type === 'CDD' ? 'CDD du ' + frDate(s.dateDebut) + ' au ' + frDate(s.dateFin) : 'CDI') + ro('Horaire', s.horaire + ' h / semaine') +
      ro('Base', money(s.base)) + ro('Sursalaire', money(s.sursalaire)) + ro('Logement', money(s.logement)) + ro('Ancienneté', s.anciennetePct + ' % (' + money(s.ancienneteMontant) + ')') + ro('Salaire brut (hors transport)', money(s.brut)) + ro('Prime de transport', money(s.transport)) + '</div></article>';
    const extras = card('À compléter pour la DMT', 'Seules les informations propres à la DMT sont à saisir ici.',
      X('numero', 'N° de la déclaration') + X('date', 'Date de la déclaration', { type: 'date' }) + X('matricule', 'N° d’immatriculation au fichier central (6 caractères A à F)', { placeholder: 'ABCDEF' }) +
      X('objet', 'Objet de la déclaration', { type: 'select', options: K.OBJETS.map((o) => [o, o]) }) + X('ethnie', 'Groupe ethnique') + X('cni', 'Carte d’identité n°') + X('cniLieu', 'Délivrée à') + X('cniDate', 'Délivrée le', { type: 'date' }) + X('cniPar', 'Par') +
      X('ccpf', 'N° d’immatriculation à la C.C.P.F. – A.T. (CSS)') + X('agrom', 'N° d’immatriculation à l’A.G.R.O.M. (IPRES)') + fld('worker.nomsEpouses', 'Nom des épouses', {}) + fld('worker.nomsEnfants', 'Noms des enfants à charge', {}) +
      X('declEmbauche', 'N° et date de la déclaration d’embauche') + X('profession', 'Profession (par défaut : emploi)', { placeholder: str(d.job.emploi) }) + X('activite', 'Activité de l’établissement', { placeholder: str(d.employer.activite) }) +
      X('visaApprobation', 'N° et date du visa d’approbation (Inspecteur du Travail)') + X('visaEnregistrement', 'N° et date du visa d’enregistrement (main-d’œuvre)') + X('precedentEmployeur', 'Nom et adresse du précédent employeur') +
      X('art107Lieu', 'Art. 107 : lieu de résidence habituelle') + X('art107Date', 'Art. 107 : date d’entrée au Sénégal', { type: 'date' }) +
      X('militaireClasse', 'Situation militaire : classe de recrutement') + X('militaireService', 'Service militaire effectué ?') + X('militaireArmee', 'Armée d’appartenance') + X('militaireGrade', 'Grade dans la réserve'));
    return '<div class="ct-missing" id="ctMissing">' + (miss.length ? '<b>Informations encore à compléter (recommandé) :</b> ' + miss.map(esc).join(' · ') : '✔ Les informations usuelles de la DMT sont renseignées.') + '</div>' + synced + extras;
  }

  const subText = (c, d) => esc(c.name) + ' · ' + (contractsOf(c).some((x) => x.id === d.id) ? esc(d.number) : 'nouveau contrat (enregistrement automatique dès le nom et les prénoms saisis)');
  const pickOptions = (c, d) => '<option value="">Nouveau contrat</option>' + contractsOf(c).map((x) => '<option value="' + esc(x.id) + '"' + (x.id === d.id ? ' selected' : '') + '>' + esc((x.number || 'Brouillon') + ' · ' + K.fullName(x.worker)) + '</option>').join('');
  function refreshMeta() {
    const c = company(), d = view.draft; if (!c || !d || WS.state.module !== 'contract-new') return;
    const s = $('ctSub'); if (s) s.innerHTML = subText(c, d);
    const p = $('ctPick'); if (p) p.innerHTML = pickOptions(c, d);
    const m = $('ctMissing'); if (m) { const miss = K.dmtMissing(d, c); m.innerHTML = miss.length ? '<b>Informations encore à compléter (recommandé) :</b> ' + miss.map(esc).join(' · ') : '✔ Les informations usuelles de la DMT sont renseignées.'; }
  }
  function elaborationHTML(c) {
    const d = view.draft, list = contractsOf(c), saved = list.some((x) => x.id === d.id), dmtOk = d.dmt && d.dmt.status === 'établie';
    const picker = '<div class="ws-field"><label for="ctPick">Contrat</label><select id="ctPick" data-ct-pick="1">' + pickOptions(c, d) + '</select></div>';
    return '<div class="ws-page-head"><div><h1>Élaboration de contrat</h1><p id="ctSub">' + subText(c, d) + '</p></div><div class="ws-tools">' + picker +
      '<div class="ws-field"><label for="ctStatusSel">Statut</label><select id="ctStatusSel" data-ct-f="status">' + K.STATUS.map((s) => '<option' + (d.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div></div></div>' +
      '<div class="ct-tabs" role="tablist"><button type="button" role="tab" aria-selected="' + (view.tab === 'contract') + '" data-ct="tab:contract">1. Contrat de travail</button><button type="button" role="tab" aria-selected="' + (view.tab === 'dmt') + '" data-ct="tab:dmt">2. DMT' + (dmtOk ? ' ✔' : '') + '</button><span id="ctStatus" class="cp-sub" role="status">' + esc(view.msg) + '</span></div>' +
      '<div class="ct-bar">' + (view.tab === 'contract'
        ? '<button type="button" class="cp-btn primary" data-ct="save">' + icon('check') + 'Enregistrer</button><button type="button" class="cp-btn" data-ct="preview:contract">' + icon('eye') + 'Aperçu du contrat</button><button type="button" class="cp-btn" data-ct="download:contract">' + icon('download') + 'Télécharger Word (.docx)</button><button type="button" class="cp-btn" data-ct="print:contract">' + icon('printer') + 'Imprimer / PDF</button><button type="button" class="cp-btn" data-ct="tab:dmt">Créer la DMT →</button><button type="button" class="cp-btn" data-ct="bulletin">' + icon('file2') + 'Préparer le bulletin de paie</button>'
        : '<button type="button" class="cp-btn primary" data-ct="save">' + icon('check') + 'Enregistrer</button><button type="button" class="cp-btn" data-ct="preview:dmt">' + icon('eye') + 'Aperçu de la DMT</button><button type="button" class="cp-btn" data-ct="download:dmt">' + icon('download') + 'Télécharger Excel (.xlsx)</button><button type="button" class="cp-btn" data-ct="print:dmt">' + icon('printer') + 'Imprimer / PDF</button><button type="button" class="cp-btn" data-ct="dmt-done">' + (dmtOk ? 'DMT établie ✔ (rouvrir)' : 'Marquer la DMT comme établie') + '</button><button type="button" class="cp-btn" data-ct="tab:contract">← Retour au contrat</button>') + '</div>' +
      (view.tab === 'contract' ? importHTML() : '') + '<div id="ctIssues">' + issuesHTML(d) + '</div>' + (view.tab === 'contract' ? contractTab(d) : dmtTab(d));
  }

  /* ───────── Gestion des contrats ───────── */
  const DMT_LABEL = (c) => (!c.dmt ? ['Non créée', 'neutral'] : c.dmt.status === 'établie' ? ['Établie', 'success'] : ['À compléter', 'warning']);
  const STATUS_TONE = { 'brouillon': 'neutral', 'signé': 'info', 'en cours': 'success', 'terminé': 'neutral' };
  function listHTML(c) {
    const all = contractsOf(c).map((x) => K.normalize(x, c)), q = view.q.trim().toLocaleLowerCase('fr');
    const rows = all.filter((x) => (!view.fStatus || x.status === view.fStatus) && (!view.fType || x.job.type === view.fType) && (!q || (K.fullName(x.worker) + ' ' + x.job.emploi + ' ' + x.number).toLocaleLowerCase('fr').includes(q)))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const alerts = K.alertsOf(all, todayISO()).filter((a) => a.level !== 'info' || all.length <= 12);
    const kpi = (l, v) => '<div class="ws-sum"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>';
    const act = (a, ic, label, id) => '<button type="button" class="cp-act' + (a === 'del' ? ' danger' : '') + '" title="' + esc(label) + '" aria-label="' + esc(label) + '" data-ct="' + a + ':' + esc(id) + '">' + icon(ic) + '</button>';
    const body = rows.map((x) => {
      const dm = DMT_LABEL(x), te = K.trialEnd(x), end = K.isCdd(x.job.type) ? (x.job.type === 'CDD_PROJET' ? 'Fin du projet' + (x.job.projetNom ? ' « ' + x.job.projetNom + ' »' : '') + (x.job.dateFin ? ' : ' + frDate(x.job.dateFin) : '') : frDate(x.job.dateFin)) : (te ? 'Essai jusqu’au ' + frDate(te) : '—');
      return '<tr><td class="nw">' + esc(x.number || '—') + '</td><td><button type="button" class="cp-person cp-person-btn" data-ct="edit:' + esc(x.id) + '" title="Ouvrir le contrat pour le modifier"><span class="cp-avatar">' + esc(D.initials(K.fullName(x.worker))) + '</span><div><b>' + esc(K.fullName(x.worker) || '—') + '</b><span>' + esc(x.job.emploi || '—') + '</span></div></button></td><td>' + esc(K.TYPE_SHORT[x.job.type] || x.job.type) + '</td><td class="nw">' + esc(frDate(x.job.dateEngagement) || '—') + '</td><td>' + esc(end) + '</td>' +
        '<td><select class="ct-mini" aria-label="Statut du contrat de ' + esc(K.fullName(x.worker)) + '" data-ct-status="' + esc(x.id) + '">' + K.STATUS.map((s) => '<option' + (x.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></td><td><span class="cp-badge ' + dm[1] + '">' + dm[0] + '</span></td>' +
        '<td><div class="cp-actions">' + act('edit', 'eye', 'Ouvrir / modifier le contrat', x.id) + act('dl-contract', 'download', 'Télécharger le contrat (Word)', x.id) + act('print-contract', 'printer', 'Imprimer le contrat (PDF)', x.id) + act('dmt', 'file', 'Créer ou ouvrir la DMT', x.id) + act('dup', 'plus', 'Dupliquer comme modèle', x.id) + act('del', 'trash', 'Supprimer le contrat', x.id) + '</div></td></tr>';
    }).join('');
    return '<div class="ws-page-head"><div><h1>Gestion des contrats</h1><p>' + esc(c.name) + ' · ' + all.length + ' contrat' + (all.length > 1 ? 's' : '') + '</p></div><div class="ws-tools"><button type="button" class="cp-btn primary" data-ct="new">' + icon('plus') + 'Nouveau contrat</button></div></div>' +
      '<div class="ws-sums">' + kpi('Contrats', String(all.length)) + kpi('En cours', String(all.filter((x) => x.status === 'en cours').length)) + kpi('Brouillons', String(all.filter((x) => x.status === 'brouillon').length)) + kpi('DMT à établir', String(all.filter((x) => x.status !== 'terminé' && !(x.dmt && x.dmt.status === 'établie')).length)) + '</div>' +
      (alerts.length ? '<article class="cp-card"><div class="cp-card-head"><h2>Alertes</h2></div><ul class="cp-alerts">' + alerts.map((a) => '<li class="cp-alert ' + (a.level === 'info' ? 'info' : a.level === 'late' ? 'danger' : 'warn') + '"><span class="ico">' + icon(a.level === 'info' ? 'clock' : 'alert') + '</span><button type="button" class="main-act" data-ct="edit:' + esc(a.id) + '">' + esc(a.text) + '</button><span></span></li>').join('') + '</ul></article>' : '') +
      '<div class="ws-tools ws-filters"><div class="ws-field"><label for="ctQ">Rechercher</label><input id="ctQ" type="search" placeholder="Nom, emploi ou n°" value="' + esc(view.q) + '" autocomplete="off"></div><div class="ws-field"><label for="ctFS">Statut</label><select id="ctFS"><option value="">Tous</option>' + K.STATUS.map((s) => '<option' + (view.fStatus === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div><div class="ws-field"><label for="ctFT">Type</label><select id="ctFT"><option value="">Tous</option>' + Object.entries(K.TYPE_SHORT).map(([k, l]) => '<option value="' + k + '"' + (view.fType === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div></div>' +
      '<article class="cp-card">' + (rows.length ? '<div class="cp-table-wrap"><table class="cp-table" style="min-width:900px"><thead><tr><th>N°</th><th>Travailleur</th><th>Type</th><th>Engagement</th><th>Échéance</th><th>Statut</th><th>DMT</th><th>Actions</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<div class="cp-empty"><b>' + (all.length ? 'Aucun contrat pour ce filtre' : 'Aucun contrat enregistré') + '</b><span>' + (all.length ? 'Modifiez la recherche ou les filtres.' : 'Utilisez « Nouveau contrat » : la DMT se prépare ensuite automatiquement à partir du contrat.') + '</span></div>') + '</article>';
  }

  /* ───────── Actions ───────── */
  function openDraft(id, tab) {
    const c = company(), x = contractsOf(c).find((k) => k.id === id); if (!x) return;
    view.imp = null; view.imported = new Set(); view.afterImport = false; view.draft = K.normalize(clone(x), c); view.tab = tab || 'contract'; view.msg = ''; view.net = null; WS.go('contract-new'); setTimeout(updateDerived, 30);
  }
  function newDraft() { const c = company(); view.imp = null; view.imported = new Set(); view.afterImport = false; view.draft = K.blankContract(c, todayISO()); view.tab = 'contract'; view.msg = ''; view.net = null; WS.go('contract-new'); }
  function click(e) {
    const mod = WS.state.module; if (mod !== 'contract-new' && mod !== 'contract-list') return false;
    const b = e.target.closest('[data-ct]'); if (!b) return false;
    const [a, arg] = b.dataset.ct.split(/:(.*)/s), c = company(), list = c ? contractsOf(c) : [];
    if (a === 'tab') { commit(); view.tab = arg; render(); setTimeout(updateDerived, 30); }
    else if (a === 'save') { if (commit()) { toast('Contrat enregistré'); render(); } else toast(view.msg); }
    else if (a === 'preview' || a === 'print') { commit(); openDoc(arg, view.draft, a === 'print'); }
    else if (a === 'download') { commit(); downloadDoc(arg, view.draft); }
    else if (a === 'dmt-done') { const d = view.draft; d.dmt = Object.assign({}, d.dmt || {}); d.dmt.status = d.dmt.status === 'établie' ? 'brouillon' : 'établie'; commit(); toast(d.dmt.status === 'établie' ? 'DMT marquée comme établie' : 'DMT rouverte'); render(); }
    else if (a === 'bulletin') prepareBulletin();
    else if (a === 'imp-pick') { const f = $('ctFile'); if (f) f.click(); }
    else if (a === 'imp-manual') { view.imp = null; render(); const x = document.querySelector('[data-ct-f="worker.nom"]'); if (x) { x.scrollIntoView({ block: 'center' }); x.focus(); } }
    else if (a === 'imp-apply') applyImport();
    else if (a === 'imp-cancel') { view.imp = null; render(); }
    else if (a === 'new') newDraft();
    else if (a === 'edit') openDraft(arg, 'contract');
    else if (a === 'dmt') openDraft(arg, 'dmt');
    else if (a === 'dl-contract') { const x = list.find((k) => k.id === arg); if (x) downloadDoc('contract', K.normalize(clone(x), c)); }
    else if (a === 'print-contract') { const x = list.find((k) => k.id === arg); if (x) openDoc('contract', K.normalize(clone(x), c), true); }
    else if (a === 'dup') { const x = list.find((k) => k.id === arg); if (x) { const n = K.normalize(clone(x), c); Object.assign(n, { id: K.blankContract(c, '').id, number: '', status: 'brouillon', dmt: null, createdAt: todayISO() }); Object.assign(n.worker, { nom: '', prenoms: '', naissance: '', lieuNaissance: '', pere: '', mere: '', domicile: '', nomsEpouses: '', nomsEnfants: '' }); n.job.dateEngagement = ''; n.job.dateContrat = ''; n.job.dateFin = ''; view.draft = n; view.tab = 'contract'; view.msg = 'Modèle dupliqué : renseignez le nouveau travailleur.'; WS.go('contract-new'); } }
    else if (a === 'del') { const x = list.find((k) => k.id === arg); if (x && confirm('Supprimer définitivement le contrat ' + (x.number || '') + ' de ' + K.fullName(x.worker) + ' ?')) { c.contracts = list.filter((k) => k.id !== arg); persistOrg(); if (view.draft && view.draft.id === arg) view.draft = null; toast('Contrat supprimé'); render(); } }
    else return false;
    return true;
  }
  function change(e) {
    const t = e.target, mod = WS.state.module;
    if (mod === 'contract-list') {
      if (t.dataset.ctStatus) { const c = company(), x = contractsOf(c).find((k) => k.id === t.dataset.ctStatus); if (x && K.STATUS.includes(t.value)) { x.status = t.value; x.updatedAt = todayISO(); persistOrg(); toast('Statut du contrat : ' + t.value); render(); } return true; }
      if (t.id === 'ctFS') { view.fStatus = t.value; render(); return true; } if (t.id === 'ctFT') { view.fType = t.value; render(); return true; }
      return false;
    }
    if (mod !== 'contract-new') return false;
    if (t.id === 'ctFile') { const f = t.files && t.files[0]; t.value = ''; handleFile(f); return true; }
    if (t.id === 'ctImpPick' && view.imp) { view.imp.pick = Number(t.value) || 0; view.imp.off = new Set(); render(); return true; }
    if (t.dataset.impChk && view.imp) { if (t.checked) view.imp.off.delete(t.dataset.impChk); else view.imp.off.add(t.dataset.impChk); return true; }
    if (t.dataset.impVal && view.imp) { const c = view.imp.candidates[view.imp.pick], it = c.items.find((i) => i.path === t.dataset.impVal); if (it) { it.value = typeof it.value === 'boolean' ? t.checked : typeof it.value === 'number' ? Number(t.value) || 0 : t.value; c.fields[it.path] = it.value; } return true; }
    if (t.dataset.ctPick !== undefined) { if (t.value) openDraft(t.value, view.tab); else newDraft(); return true; }
    if (t.dataset.ctF) { applyField(t); if (t.dataset.ctR) render(); setTimeout(updateDerived, 30); return true; }
    return false;
  }
  function applyField(t) {
    const p = t.dataset.ctF; let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'number') v = v === '' ? 0 : Number(v);
    if (p === 'clauses.references') v = String(v).split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (p.indexOf('dmt.') === 0 && !view.draft.dmt) view.draft.dmt = {};
    if (p === 'job.type') K.switchType(view.draft, v); else setPath(view.draft, p, v);
    view.dirty = true; queueCommit();
  }
  function input(e) {
    const t = e.target, mod = WS.state.module;
    if (mod === 'contract-list' && t.id === 'ctQ') { view.q = t.value; render(); const f = $('ctQ'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } return true; }
    if (mod === 'contract-new' && t.dataset.impVal) return true;
    if (mod === 'contract-new' && t.dataset.ctF && t.tagName !== 'SELECT' && t.type !== 'checkbox') { applyField(t); clearTimeout(view.derivedTimer); view.derivedTimer = setTimeout(updateDerived, 500); return true; }
    return false;
  }
  const render = () => WS.render();
  document.addEventListener('dragover', (e) => { const z = e.target.closest && e.target.closest('#ctDrop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('#ctDrop'); if (z) z.classList.remove('over'); });
  document.addEventListener('drop', (e) => { const z = e.target.closest && e.target.closest('#ctDrop'); if (!z) return; e.preventDefault(); z.classList.remove('over'); handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'ctDrop') { e.preventDefault(); const f = $('ctFile'); if (f) f.click(); } });

  WS.registerModule('contract-new', { render: (c) => { ensureView(); return elaborationHTML(c); }, click, change, input, after: () => { if (!view.net) setTimeout(updateDerived, 30); } });
  WS.registerModule('contract-list', { render: (c) => { ensureView(); return listHTML(c); }, click, change, input });
  window.CorintaContractsUI = { newDraft, openDraft, prepareBulletin, view };
})();
