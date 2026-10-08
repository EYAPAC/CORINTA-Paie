/*
 * CORINTA Paie — câblage du tableau de bord et de la barre supérieure globale.
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
  const state = { companyId: '', period: '', range: '6', from: '', to: '', metric: 'gross' };
  let lastModel = null;

  /* ───────── Données ───────── */
  const todayISO = () => new Date().toLocaleDateString('sv-SE');
  const company = () => activeCompany();
  const allRecords = () => readHistoryStore().map((x, i) => Object.assign({}, x, { _index: i }));
  function defaultPeriod(c, recs) {
    const own = recs.filter((r) => r.companyId === c.id && /^[0-9]{4}-[0-9]{2}$/.test(r.period || '')).map((r) => r.period).sort();
    return own.length ? own[own.length - 1] : todayISO().slice(0, 7);
  }
  function currentPeriod(c, recs) {
    if (state.companyId !== c.id || !/^[0-9]{4}-[0-9]{2}$/.test(state.period)) { state.companyId = c.id; state.period = defaultPeriod(c, recs); }
    return state.period;
  }
  function buildCurrentModel() {
    const c = company(), recs = allRecords();
    return D.buildModel({ company: c, records: recs, period: currentPeriod(c, recs), range: { kind: state.range, from: state.from, to: state.to }, today: todayISO(), deadlineDays: S.deadlineDays || {}, metric: state.metric });
  }

  /* ───────── Barre supérieure globale ───────── */
  function userName() { return (S.userName || '').trim(); }
  function syncGlobalBar() {
    const sel = $('gCompany'); if (!sel) return;
    const c = company();
    sel.innerHTML = ORG.items.map((x) => '<option value="' + safe(x.id) + '"' + (x.id === c.id ? ' selected' : '') + '>' + safe(x.name) + '</option>').join('');
    const un = userName();
    $('gUser').textContent = un || 'Administrateur';
    $('gAvatar').textContent = (un || 'A').trim().slice(0, 1).toUpperCase();
    const onDash = !$('dashboard').classList.contains('hidden');
    $('gPeriodWrap').classList.toggle('hidden', !onDash);
    if (onDash) $('gPeriod').value = state.period;
    try {
      const m = lastModel && lastModel.company.id === c.id ? lastModel : buildCurrentModel(), n = m.alerts.filter((a) => a.level !== 'info').length, b = $('gBellCount');
      b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('hidden', n === 0);
      $('gBell').setAttribute('aria-label', n ? n + ' alerte' + (n > 1 ? 's' : '') + ' à traiter' : 'Aucune alerte');
    } catch (e) { console.error('Alertes', e); }
  }

  /* ───────── Tableau de bord ───────── */
  const chip = (label, pressed, attrs) => '<button type="button" class="cp-chip" aria-pressed="' + pressed + '" ' + attrs + '>' + safe(label) + '</button>';
  function renderDashboard() {
    const root = $('dashboard'); if (!root) return;
    try {
      const m = lastModel = buildCurrentModel(), c = company();
      const un = userName();
      $('dbHello').textContent = 'Bonjour' + (un ? ' ' + un : '') + ' 👋';
      $('dbSub').textContent = 'Voici un aperçu de l’activité paie de ' + (c.name || c.employer) + ' pour ' + D.monthLabel(m.period) + '.';
      $('dbKpis').innerHTML = D.renderKpis(m);
      $('dbCycleSub').textContent = D.monthLabel(m.period) + ' · ' + c.name;
      $('dbCycle').innerHTML = D.renderCycle(m);
      $('dbMetric').innerHTML = Object.keys(D.SERIES).map((k) => chip(D.SERIES[k].short, state.metric === k, 'data-metric="' + k + '"')).join('');
      $('dbRange').innerHTML = [['6', '6 mois'], ['12', '12 mois'], ['custom', 'Personnalisée']].map(([k, l]) => chip(l, state.range === k, 'data-range="' + k + '"')).join('');
      $('dbCustom').classList.toggle('hidden', state.range !== 'custom');
      if (state.range === 'custom') { $('dbFrom').value = m.rangeFrom; $('dbTo').value = m.rangeTo; }
      $('dbChartSub').textContent = m.series.label + ' · ' + D.monthLabel(m.rangeFrom) + ' à ' + D.monthLabel(m.rangeTo);
      $('dbChart').innerHTML = D.renderChart(m);
      $('dbDonutSub').textContent = 'Coût employeur · ' + D.monthLabel(m.period);
      $('dbDonut').innerHTML = D.renderDonut(m);
      $('dbShortcuts').innerHTML = D.renderShortcuts();
      $('dbTable').innerHTML = D.renderTable(m);
      $('dbAlerts').innerHTML = D.renderAlerts(m);
      $('dbFootL').textContent = 'CORINTA Paie · ' + (($('appVersion') || {}).textContent || '') + ' · Paie · Conformité';
      $('dbFootR').textContent = 'Données enregistrées sur cet appareil';
      root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = D.icon(el.dataset.icon); });
    } catch (err) {
      console.error('Tableau de bord', err);
      $('dbKpis').innerHTML = '<div class="cp-error" role="alert">Le tableau de bord n’a pas pu être calculé : ' + safe((err && err.message) || err) + '. Vos données ne sont pas modifiées.</div>';
    }
    syncGlobalBar();
  }

  /* ───────── Actions ───────── */
  function openFolderPanel(panel) {
    activateView('companies');
    ACTIVE_FOLDER_PAGE = true;
    renderCompanyFolders();
    showCompanyPanel(panel);
  }
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
    if (a === 'new-payslip') { activateView('pay'); $('new').click(); return; }
    if (a.indexOf('panel:') === 0) { openFolderPanel(a.slice(6)); return; }
    if (a.indexOf('view:') === 0) { activateView(a.slice(5)); return; }
    if (a === 'export-report') { $('exportPayslipList').click(); return; }
    if (a === 'import-backup') { $('importDataBtn').click(); return; }
    const i = el ? Number(el.dataset.i) : -1;
    if (a === 'view') { openPayslipRecord(i); return; }
    if (a === 'print') { openPayslipRecord(i); setTimeout(() => window.print(), 350); return; }
    if (a === 'download') {
      try { withRecord(i, () => exportPayslipXlsx()); } catch (err) { alert('Le téléchargement a échoué : ' + ((err && err.message) || err)); }
      return;
    }
    if (a === 'done') {
      const c = company(), p = el.dataset.period, k = el.dataset.key;
      c.obligations = c.obligations || {}; c.obligations[p] = c.obligations[p] || {}; c.obligations[p][k] = true;
      persistOrg(); toast('Échéance marquée comme faite'); renderDashboard(); return;
    }
  }
  function setStatus(index, value) {
    if (D.STATUSES.indexOf(value) < 0) return;
    const h = readHistoryStore(); if (!h[index]) return;
    h[index].status = value;
    if (!writeStore('paieHistory', h)) return;
    queueCloudSync(); toast('Statut mis à jour : ' + value); renderDashboard();
    if (!$('history').classList.contains('hidden')) history();
  }

  /* ───────── Recherche globale (salariés et bulletins de l'entreprise active) ───────── */
  function search() {
    const q = $('gSearch').value.trim().toLocaleLowerCase('fr'), box = $('gResults');
    if (!q) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const c = company(), rows = [];
    c.employees.forEach((e) => {
      const mat = String(e.mat || (e.fields && e.fields.mat) || '');
      if ((e.name || '').toLocaleLowerCase('fr').includes(q) || mat.toLocaleLowerCase('fr').includes(q)) rows.push('<button type="button" data-sr="emp" data-id="' + safe(e.id) + '"><span class="cp-tag">SALARIÉ</span><span><b>' + safe(e.name) + '</b><small>' + safe(mat || '—') + ' · ' + safe(e.job || '—') + '</small></span></button>');
    });
    allRecords().filter((r) => r.companyId === c.id).forEach((r) => {
      if ((r.name || '').toLocaleLowerCase('fr').includes(q) || String(r.period || '').includes(q) || D.monthLabel(r.period).toLocaleLowerCase('fr').includes(q)) rows.push('<button type="button" data-sr="rec" data-id="' + r._index + '"><span class="cp-tag">BULLETIN</span><span><b>' + safe(r.name) + ' · ' + safe(D.monthLabel(r.period)) + '</b><small>Net à payer : ' + safe(r.net || '—') + '</small></span></button>');
    });
    box.innerHTML = rows.slice(0, 12).join('') || '<div class="cp-empty" style="margin:6px"><b>Aucun résultat</b><span>Dans ' + safe(c.name) + '</span></div>';
    box.classList.remove('hidden');
  }

  /* ───────── Raccordement ───────── */
  function bind() {
    document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = D.icon(el.dataset.icon); });

    $('dashboard').addEventListener('click', (e) => {
      const m = e.target.closest('[data-metric]'); if (m) { state.metric = m.dataset.metric; renderDashboard(); return; }
      const r = e.target.closest('[data-range]'); if (r) { state.range = r.dataset.range; if (state.range === 'custom' && !state.from) { state.to = state.period; state.from = D.addMonths(state.period, -5); } renderDashboard(); return; }
      const b = e.target.closest('[data-act]'); if (b && b.tagName !== 'SELECT') act(b.dataset.act, b);
    });
    $('dashboard').addEventListener('change', (e) => {
      if (e.target.matches('select[data-act="status"]')) { setStatus(Number(e.target.dataset.i), e.target.value); return; }
      if (e.target.id === 'dbFrom' || e.target.id === 'dbTo') { state.from = $('dbFrom').value; state.to = $('dbTo').value; if (state.from && state.to) renderDashboard(); }
    });
    $('gCompany').addEventListener('change', () => { setActiveCompany($('gCompany').value, true); state.companyId = ''; if (!$('dashboard').classList.contains('hidden')) renderDashboard(); else syncGlobalBar(); });
    $('gPeriod').addEventListener('change', () => { if (/^[0-9]{4}-[0-9]{2}$/.test($('gPeriod').value)) { state.period = $('gPeriod').value; state.companyId = company().id; renderDashboard(); } });
    $('gBell').addEventListener('click', () => { activateView('dashboard'); const c = $('dbAlertsCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $('gSearch').addEventListener('input', search);
    $('gSearch').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('gSearch').value = ''; search(); } });
    $('gResults').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sr]'); if (!b) return;
      $('gSearch').value = ''; search();
      if (b.dataset.sr === 'emp') loadEmployee(b.dataset.id); else openPayslipRecord(Number(b.dataset.id));
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.cp-search')) $('gResults').classList.add('hidden'); });

    /* réglages : nom affiché et jours d'échéance */
    $('saveDashSettings').addEventListener('click', () => {
      S.userName = $('userName').value.trim();
      const day = (id, def) => { const v = Math.round(Number($(id).value)); return v >= 1 && v <= 31 ? v : def; };
      S.deadlineDays = { ipres: day('ddIpres', 15), css: day('ddCss', 15), impots: day('ddImpots', 15) };
      save(); renderDashboard();
    });
  }
  function fillDashSettings() {
    $('userName').value = S.userName || '';
    const d = S.deadlineDays || {};
    $('ddIpres').value = d.ipres || 15; $('ddCss').value = d.css || 15; $('ddImpots').value = d.impots || 15;
  }

  /* ───────── Intégration à la navigation existante ───────── */
  const baseActivate = activateView;
  activateView = function (v) {
    baseActivate(v);
    if (v === 'dashboard') renderDashboard(); else syncGlobalBar();
    if (v === 'config') fillDashSettings();
  };
  const baseSetActive = setActiveCompany;
  setActiveCompany = function () { baseSetActive.apply(this, arguments); state.companyId = ''; syncGlobalBar(); if (!$('dashboard').classList.contains('hidden')) renderDashboard(); };
  /* Ouvrir un dossier entreprise mène désormais à son tableau de bord ; les onglets du dossier
     (salariés, bulletins, charges) restent accessibles par les raccourcis et alertes. */
  const baseOpenFolder = openCompanyFolder;
  window.openCompanyFolderPage = baseOpenFolder;
  openCompanyFolder = function (id) { setActiveCompany(id, true); ACTIVE_FOLDER_PAGE = false; activateView('dashboard'); };
  /* Après chaque enregistrement ou suppression de bulletin, le tableau de bord se rafraîchit s'il est affiché. */
  ['saveToFolder', 'deletePayslip'].forEach((name) => {
    const base = window[name]; if (typeof base !== 'function') return;
    window[name] = function () { const r = base.apply(this, arguments); lastModel = null; if (!$('dashboard').classList.contains('hidden')) renderDashboard(); else syncGlobalBar(); return r; };
  });

  bind();
  activateView('dashboard');
})();
