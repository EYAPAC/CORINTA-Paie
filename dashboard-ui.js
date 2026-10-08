/*
 * Corinta Pay — câblage des DEUX niveaux de tableau de bord et de la barre supérieure globale.
 *
 *   1. Tableau de bord GÉNÉRAL  (menu « Tableau de bord ») : toutes les entreprises ensemble.
 *   2. Tableau de bord d'UNE ENTREPRISE : onglet « Tableau de bord » À L'INTÉRIEUR du dossier
 *      (Entreprise → clic sur un dossier). Il n'y a pas de redirection vers le tableau général.
 *
 * Chargé APRÈS les scripts en ligne de index.html : il réutilise les fonctions et données
 * existantes (ORG, activeCompany, readHistoryStore, openPayslipRecord, exportPayslipXlsx…)
 * sans les dupliquer, et n'altère aucune règle de paie. Les calculs sont dans dashboard.js.
 */
(function () {
  'use strict';
  const D = window.CorintaDash;
  if (!D) { console.error('dashboard.js non chargé'); return; }

  const $ = (id) => document.getElementById(id);
  const PERIOD_RE = /^[0-9]{4}-[0-9]{2}$/;
  /* période choisie par l'utilisateur (communes aux deux niveaux) ; sinon dernière période avec bulletins */
  const state = { period: '', range: '6', from: '', to: '', metric: 'gross' };

  /* ───────── Données ───────── */
  const todayISO = () => new Date().toLocaleDateString('sv-SE');
  const company = () => activeCompany();
  const allRecords = () => readHistoryStore().map((x, i) => Object.assign({}, x, { _index: i }));
  function latestPeriod(recs) {
    const p = recs.filter((r) => PERIOD_RE.test(r.period || '')).map((r) => r.period).sort();
    return p.length ? p[p.length - 1] : todayISO().slice(0, 7);
  }
  const effPeriod = (recs) => (PERIOD_RE.test(state.period) ? state.period : latestPeriod(recs));
  const common = (recs) => ({ records: recs, period: effPeriod(recs), range: { kind: state.range, from: state.from, to: state.to }, today: todayISO(), taxRemittance: S.taxRemittance || 'monthly', metric: state.metric });
  function generalModel() {
    const recs = allRecords();
    return D.buildGlobalModel(Object.assign(common(recs), { companies: ORG.items, period: effPeriod(recs) }));
  }
  function companyModel() {
    const c = company(), recs = allRecords().filter((r) => r.companyId === c.id);
    return D.buildModel(Object.assign(common(recs), { company: c }));
  }

  /* ───────── Visibilité ───────── */
  const generalVisible = () => !$('dashboard').classList.contains('hidden');
  const folderVisible = () => !$('companies').classList.contains('hidden') && !$('folderDetailPage').classList.contains('hidden');
  const companyDashVisible = () => folderVisible() && !$('companyPanelDashboard').classList.contains('hidden');
  const refreshVisible = () => { if (generalVisible()) renderGeneral(); else if (companyDashVisible()) renderCompany(); else syncGlobalBar(); };

  /* ───────── Squelettes (même structure, identifiants préfixés) ───────── */
  const controls = (p) => '<div style="display:grid;gap:8px;justify-items:end"><div class="cp-chip-group" id="' + p + 'Metric" role="group" aria-label="Indicateur"></div><div class="cp-chip-group" id="' + p + 'Range" role="group" aria-label="Plage de mois"></div><div id="' + p + 'Custom" class="hidden" style="display:flex;gap:6px;align-items:center"><label class="cp-select"><input id="' + p + 'From" type="month" aria-label="Du mois"></label><span class="cp-sub">à</span><label class="cp-select"><input id="' + p + 'To" type="month" aria-label="Au mois"></label></div></div>';
  const chartCard = (p) => '<article class="cp-card"><div class="cp-card-head"><div><h2>Évolution de la masse salariale</h2><p class="cp-sub" id="' + p + 'ChartSub"></p></div>' + controls(p) + '</div><div id="' + p + 'Chart"></div></article>';
  const donutCard = (p) => '<article class="cp-card"><div class="cp-card-head"><div><h2>Répartition des charges</h2><p class="cp-sub" id="' + p + 'DonutSub"></p></div></div><div id="' + p + 'Donut"></div></article>';
  const shortcutsCard = (p) => '<article class="cp-card"><div class="cp-card-head"><h2>Raccourcis</h2></div><div id="' + p + 'Shortcuts"></div></article>';
  const alertsCard = (p) => '<article class="cp-card" id="' + p + 'AlertsCard"><div class="cp-card-head"><h2>Informations importantes</h2></div><div id="' + p + 'Alerts"></div><p class="cp-sub" style="margin-top:10px">Échéances : repères indicatifs (jour du mois suivant, modifiables dans Paramétrage). À confirmer auprès des organismes.</p></article>';

  function buildGeneralSkeleton() {
    $('dashboard').innerHTML =
      '<div class="cp-hello"><span class="eyebrow">TABLEAU DE BORD GÉNÉRAL</span><h1 id="dbHello">Bonjour 👋</h1><p id="dbSub"></p></div>' +
      '<div id="dbKpis" class="cp-kpis"></div>' +
      '<div class="cp-row2">' + chartCard('db') + donutCard('db') + shortcutsCard('db') + '</div>' +
      '<div class="cp-row3"><article class="cp-card"><div class="cp-card-head"><div><h2>Dossiers d’entreprise</h2><p class="cp-sub">Ouvrez un dossier pour accéder à son propre tableau de bord.</p></div><button type="button" class="cp-link" data-act="view:companies">Gérer les entreprises →</button></div><div id="dbCompanies"></div></article>' +
      '<div class="cp-stack">' + alertsCard('db') + '</div></div>' +
      '<footer class="cp-foot"><span id="dbFootL"></span><span id="dbFootR"></span></footer>';
  }
  function buildCompanySkeleton() {
    const host = $('companyPanelDashboard');
    let root = $('cdRoot');
    if (!root) { root = document.createElement('div'); root.id = 'cdRoot'; root.className = 'cp-dash'; host.insertBefore(root, host.firstChild); }
    root.innerHTML =
      '<p class="cp-sub" id="cdSub" style="margin:0 0 12px"></p>' +
      '<div id="cdKpis" class="cp-kpis"></div>' +
      '<article class="cp-card"><div class="cp-card-head"><div><h2>Cycle de paie</h2><p class="cp-sub" id="cdCycleSub"></p></div></div><div id="cdCycle"></div></article>' +
      '<div class="cp-row2 two">' + chartCard('cd') + donutCard('cd') + '</div>' +
      '<div class="cp-row3"><article class="cp-card"><div class="cp-card-head"><div><h2>Salariés</h2><p class="cp-sub" id="cdTableSub"></p></div><button type="button" class="cp-link" data-act="panel:payslips">Tous les bulletins →</button></div><div id="cdTable"></div></article>' +
      '<div class="cp-stack">' + alertsCard('cd') + shortcutsCard('cd') + '</div></div>';
  }

  /* ───────── Rendu ───────── */
  const chip = (label, pressed, attrs) => '<button type="button" class="cp-chip" aria-pressed="' + pressed + '" ' + attrs + '>' + safe(label) + '</button>';
  function fillCommon(p, m, shortcutsKind) {
    $(p + 'Metric').innerHTML = Object.keys(D.SERIES).map((k) => chip(D.SERIES[k].short, state.metric === k, 'data-metric="' + k + '"')).join('');
    $(p + 'Range').innerHTML = [['6', '6 mois'], ['12', '12 mois'], ['custom', 'Personnalisée']].map(([k, l]) => chip(l, state.range === k, 'data-range="' + k + '"')).join('');
    $(p + 'Custom').classList.toggle('hidden', state.range !== 'custom');
    if (state.range === 'custom') { $(p + 'From').value = m.rangeFrom; $(p + 'To').value = m.rangeTo; }
    $(p + 'ChartSub').textContent = m.series.label + ' · ' + D.monthLabel(m.rangeFrom) + ' à ' + D.monthLabel(m.rangeTo);
    $(p + 'Chart').innerHTML = D.renderChart(m);
    $(p + 'DonutSub').textContent = 'Coût employeur · ' + D.monthLabel(m.period);
    $(p + 'Donut').innerHTML = D.renderDonut(m);
    $(p + 'Shortcuts').innerHTML = D.renderShortcuts(shortcutsKind);
    $(p + 'Alerts').innerHTML = D.renderAlerts(m);
  }
  const fail = (target, err) => { console.error('Tableau de bord', err); $(target).innerHTML = '<div class="cp-error" role="alert">Le tableau de bord n’a pas pu être calculé : ' + safe((err && err.message) || err) + '. Vos données ne sont pas modifiées.</div>'; };
  const userName = () => (S.userName || '').trim();

  function renderGeneral() {
    try {
      const g = generalModel(), un = userName();
      $('dbHello').textContent = 'Bonjour' + (un ? ' ' + un : '') + ' 👋';
      $('dbSub').textContent = 'Voici un aperçu de l’activité paie de l’ensemble de vos entreprises pour ' + D.monthLabel(g.period) + '.';
      $('dbKpis').innerHTML = D.renderGlobalKpis(g);
      fillCommon('db', g, 'general');
      $('dbCompanies').innerHTML = D.renderCompanyTable(g);
      $('dbFootL').textContent = 'Corinta Pay · ' + (($('appVersion') || {}).textContent || '') + ' · Paie · Conformité';
      $('dbFootR').textContent = 'Données enregistrées sur cet appareil';
      $('dashboard').querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = D.icon(el.dataset.icon); });
    } catch (err) { fail('dbKpis', err); }
    syncGlobalBar();
  }

  function renderCompany() {
    if (!$('cdRoot')) return;
    try {
      const m = companyModel(), c = company();
      $('cdSub').textContent = 'Aperçu de l’activité paie de ' + (c.name || c.employer) + ' pour ' + D.monthLabel(m.period) + '.';
      $('cdKpis').innerHTML = D.renderKpis(m);
      $('cdCycleSub').textContent = D.monthLabel(m.period) + ' · ' + c.name;
      $('cdCycle').innerHTML = D.renderCycle(m);
      fillCommon('cd', m, 'company');
      $('cdTableSub').textContent = m.employeeCount ? m.employeeCount + ' salarié' + (m.employeeCount > 1 ? 's' : '') + ' · bulletins de ' + D.monthLabel(m.period) + ' · classés par statut' : D.monthLabel(m.period);
      $('cdTable').innerHTML = D.renderEmployeeTable(m, 8);
      $('cdRoot').querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = D.icon(el.dataset.icon); });
    } catch (err) { fail('cdKpis', err); }
    syncGlobalBar();
  }

  /* ───────── Barre supérieure globale ───────── */
  function syncGlobalBar() {
    const sel = $('gCompany'); if (!sel) return;
    const c = company(), onGeneral = generalVisible(), onFolder = companyDashVisible();
    sel.innerHTML = ORG.items.map((x) => '<option value="' + safe(x.id) + '"' + (x.id === c.id ? ' selected' : '') + '>' + safe(x.name) + '</option>').join('');
    const un = userName();
    $('gUser').textContent = un || 'Administrateur';
    $('gAvatar').textContent = (un || 'A').trim().slice(0, 1).toUpperCase();
    $('gCompanyWrap').classList.toggle('hidden', onGeneral);          // le tableau général concerne toutes les entreprises
    $('gPeriodWrap').classList.toggle('hidden', !(onGeneral || onFolder));
    if (onGeneral || onFolder) { const recs = allRecords(); $('gPeriod').value = onGeneral ? effPeriod(recs) : effPeriod(recs.filter((r) => r.companyId === c.id)); }
    try {
      const m = onGeneral ? generalModel() : companyModel(), n = m.alerts.filter((a) => a.level !== 'info').length, b = $('gBellCount');
      b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('hidden', n === 0);
      $('gBell').setAttribute('aria-label', n ? n + ' alerte' + (n > 1 ? 's' : '') + ' à traiter' : 'Aucune alerte');
    } catch (e) { console.error('Alertes', e); }
  }

  /* ───────── Actions ───────── */
  /** Ouvre le dossier d'une entreprise : on reste DANS le dossier, sur l'onglet voulu (tableau de bord par défaut). */
  function openCompany(id, panel) {
    keepFolder = true;
    try { activateView('companies'); } finally { keepFolder = false; }
    setActiveCompany(id, true);
    ACTIVE_FOLDER_PAGE = true;
    renderCompanyFolders();
    showCompanyPanel(panel || 'dashboard');
  }
  const openPanel = (panel) => openCompany(company().id, panel);
  function withRecord(index, fn) {
    const h = readHistoryStore(), x = h[index];
    if (!x) { toast('Bulletin introuvable'); return; }
    const keepFields = employeeFields(), keepName = $('companyName').value, keepEmp = ACTIVE_EMPLOYEE;
    try {
      ACTIVE_EMPLOYEE = x.employeeId || '';
      $('companyName').value = x.companyName || (company().employer || '');
      restorePayrollFields(x.fields || {}, true);
      fn(x);
    } finally {
      ACTIVE_EMPLOYEE = keepEmp; $('companyName').value = keepName; restorePayrollFields(keepFields, true);
    }
  }
  function act(a, el) {
    if (!a) return;
    const cid = (el && el.dataset.company) || '';
    if (a === 'new-payslip') { activateView('pay'); $('new').click(); return; }
    if (a.indexOf('panel:') === 0) { if (cid) openCompany(cid, a.slice(6)); else openPanel(a.slice(6)); return; }
    if (a.indexOf('view:') === 0) { activateView(a.slice(5)); return; }
    if (a === 'open-company') { openCompany(el.dataset.id, 'dashboard'); return; }
    if (a === 'create-company') { activateView('companies'); const f = $('newFolderName'); if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); } return; }
    if (a === 'export-report') { $('exportPayslipList').click(); return; }
    if (a === 'backup') { $('exportData').click(); return; }
    if (a === 'import-backup') { $('importDataBtn').click(); return; }
    if (a === 'employee') { loadEmployee(el.dataset.id); return; }
    const i = el ? Number(el.dataset.i) : -1;
    if (a === 'view') { openPayslipRecord(i); return; }
    if (a === 'download') {
      try { withRecord(i, () => exportPayslipXlsx()); } catch (err) { alert('Le téléchargement a échoué : ' + ((err && err.message) || err)); }
      return;
    }
    if (a === 'done') {
      const c = ORG.items.find((x) => x.id === cid) || company(), p = el.dataset.period, k = el.dataset.key;
      c.obligations = c.obligations || {};
      (el.dataset.mode === 'quarterly' ? window.CorintaLegal.quarterMonths(p) : [p]).forEach((mo) => { c.obligations[mo] = c.obligations[mo] || {}; c.obligations[mo][k] = true; });
      persistOrg(); toast('Échéance marquée comme faite'); refreshVisible(); return;
    }
  }
  function setStatus(index, value) {
    if (D.STATUSES.indexOf(value) < 0) return;
    const h = readHistoryStore(); if (!h[index]) return;
    h[index].status = value;
    if (!writeStore('paieHistory', h)) return;
    queueCloudSync(); toast('Statut mis à jour : ' + value); refreshVisible();
    if (!$('history').classList.contains('hidden')) history();
  }

  /* ───────── Recherche globale (salariés et bulletins de l'entreprise active) ───────── */
  function search() {
    const q = $('gSearch').value.trim().toLocaleLowerCase('fr'), box = $('gResults');
    if (!q) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const rows = [], inScope = (c) => generalVisible() || c.id === company().id;
    ORG.items.filter(inScope).forEach((c) => {
      c.employees.forEach((e) => {
        const mat = String(e.mat || (e.fields && e.fields.mat) || '');
        if ((e.name || '').toLocaleLowerCase('fr').includes(q) || mat.toLocaleLowerCase('fr').includes(q)) rows.push('<button type="button" data-sr="emp" data-company="' + safe(c.id) + '" data-id="' + safe(e.id) + '"><span class="cp-tag">SALARIÉ</span><span><b>' + safe(e.name) + '</b><small>' + safe(c.name) + ' · ' + safe(mat || '—') + ' · ' + safe(e.job || '—') + '</small></span></button>');
      });
    });
    allRecords().filter((r) => ORG.items.some((c) => c.id === r.companyId && inScope(c))).forEach((r) => {
      if ((r.name || '').toLocaleLowerCase('fr').includes(q) || String(r.period || '').includes(q) || D.monthLabel(r.period).toLocaleLowerCase('fr').includes(q)) rows.push('<button type="button" data-sr="rec" data-id="' + r._index + '"><span class="cp-tag">BULLETIN</span><span><b>' + safe(r.name) + ' · ' + safe(D.monthLabel(r.period)) + '</b><small>' + safe(r.companyName || '') + ' · Net à payer : ' + safe(r.net || '—') + '</small></span></button>');
    });
    box.innerHTML = rows.slice(0, 12).join('') || '<div class="cp-empty" style="margin:6px"><b>Aucun résultat</b><span>' + (generalVisible() ? 'Dans toutes les entreprises' : 'Dans ' + safe(company().name)) + '</span></div>';
    box.classList.remove('hidden');
  }

  /* ───────── Raccordement ───────── */
  function bindDashboard(root, prefix) {
    root.addEventListener('click', (e) => {
      const m = e.target.closest('[data-metric]'); if (m) { state.metric = m.dataset.metric; refreshVisible(); return; }
      const r = e.target.closest('[data-range]'); if (r) { state.range = r.dataset.range; if (state.range === 'custom' && !state.from) { const base = effPeriod(allRecords()); state.to = base; state.from = D.addMonths(base, -5); } refreshVisible(); return; }
      const b = e.target.closest('[data-act]'); if (b && b.tagName !== 'SELECT') act(b.dataset.act, b);
    });
    root.addEventListener('change', (e) => {
      if (e.target.matches('select[data-act="status"]')) { setStatus(Number(e.target.dataset.i), e.target.value); return; }
      if (e.target.id === prefix + 'From' || e.target.id === prefix + 'To') { state.from = $(prefix + 'From').value; state.to = $(prefix + 'To').value; if (state.from && state.to) refreshVisible(); }
    });
  }
  function bind() {
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = D.icon(el.dataset.icon); });
    bindDashboard($('dashboard'), 'db');
    bindDashboard($('cdRoot'), 'cd');

    $('gCompany').addEventListener('change', () => { setActiveCompany($('gCompany').value, true); refreshVisible(); });
    $('gPeriod').addEventListener('change', () => { if (PERIOD_RE.test($('gPeriod').value)) { state.period = $('gPeriod').value; refreshVisible(); } });
    $('gBell').addEventListener('click', () => {
      if (!generalVisible() && !companyDashVisible()) activateView('dashboard');
      const card = $(generalVisible() ? 'dbAlertsCard' : 'cdAlertsCard'); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('gSearch').addEventListener('input', search);
    $('gSearch').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('gSearch').value = ''; search(); } });
    $('gResults').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sr]'); if (!b) return;
      $('gSearch').value = ''; search();
      if (b.dataset.sr === 'emp') { if (b.dataset.company !== company().id) setActiveCompany(b.dataset.company, true); loadEmployee(b.dataset.id); } else openPayslipRecord(Number(b.dataset.id));
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.cp-search')) $('gResults').classList.add('hidden'); });

    /* réglages : nom affiché et jours d'échéance */
    $('saveDashSettings').addEventListener('click', () => {
      S.userName = $('userName').value.trim();
      S.taxRemittance = $('taxRemittance').value === 'quarterly' ? 'quarterly' : 'monthly';
      save(); refreshVisible();
    });
  }
  function fillDashSettings() {
    $('userName').value = S.userName || '';
    $('taxRemittance').value = S.taxRemittance === 'quarterly' ? 'quarterly' : 'monthly';
  }

  /* ───────── Intégration à la navigation existante ───────── */
  const baseActivate = activateView;
  let keepFolder = false; // vrai uniquement quand on ouvre un dossier précis (openCompany)
  activateView = function (v) {
    if (v === 'companies' && !keepFolder) ACTIVE_FOLDER_PAGE = false; // le menu « Entreprise » montre toujours la liste des dossiers
    baseActivate(v);
    if (v === 'dashboard') renderGeneral(); else syncGlobalBar();
    if (v === 'config') fillDashSettings();
  };
  const baseSetActive = setActiveCompany;
  setActiveCompany = function () { baseSetActive.apply(this, arguments); refreshVisible(); };
  /* Ouvrir un onglet du dossier (ou le dossier lui-même) : le tableau de bord de l'entreprise se met à jour. */
  const basePanel = showCompanyPanel;
  showCompanyPanel = function (name) { basePanel(name); if (name === 'dashboard') renderCompany(); else syncGlobalBar(); };
  const baseFolders = renderCompanyFolders;
  renderCompanyFolders = function () { const r = baseFolders.apply(this, arguments); if (companyDashVisible()) renderCompany(); else syncGlobalBar(); return r; };
  /* Après chaque enregistrement ou suppression de bulletin, le tableau affiché se rafraîchit. */
  ['saveToFolder', 'deletePayslip'].forEach((name) => {
    const base = window[name]; if (typeof base !== 'function') return;
    window[name] = function () { const r = base.apply(this, arguments); refreshVisible(); return r; };
  });

  buildGeneralSkeleton();
  buildCompanySkeleton();
  bind();
  activateView('dashboard');
})();
