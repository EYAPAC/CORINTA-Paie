/*
 * Corinta Pay — espace de travail d'un dossier d'entreprise.
 *
 * Ouvrir un dossier d'entreprise affiche cet espace (menu bleu, barre supérieure, tableau de bord et rubriques :
 * Employés, Paie, Déclarations sociales, Documents, Paramètres). Il remplace l'ancienne page du dossier et
 * reprend les composants et couleurs du modèle fourni. Toutes les données viennent des salariés et bulletins
 * déjà enregistrés (ORG, paieHistory) ; aucune donnée n'est inventée.
 *
 * Chargé après dashboard-ui.js : réutilise window.CorintaUI (actions) et les fonctions globales de l'application.
 */
(function () {
  'use strict';
  const D = window.CorintaDash, UI = window.CorintaUI;
  if (!D || !UI) { console.error('workspace.js : dashboard.js / dashboard-ui.js requis'); return; }

  const $ = (id) => document.getElementById(id);
  const esc = D.esc, icon = D.icon;
  const PERIOD_RE = /^[0-9]{4}-[0-9]{2}$/;
  const st = { open: false, companyId: '', module: 'dashboard', decl: 'social', period: '', range: '6', from: '', to: '', metric: 'gross', q: '', fPeriod: '', fStatus: '', sq: '', sort: 'recent', sel: new Set(), returnTo: null };
  const MODULE_OF = { dashboard: 'dashboard', employees: 'payslips', payslips: 'payslips', pay: 'payslips', social: 'charges', taxes: 'charges', charges: 'charges', declarations: 'declarations', deadlines: 'declarations', documents: 'documents', settings: 'settings', params: 'params' };
  const DECL_OF = { social: 'social', taxes: 'taxes', charges: 'social' };
  const cur = (html) => html.split('FCFA').join('F CFA'); // le modèle écrit « F CFA »

  /* ───────── Données ───────── */
  const todayISO = () => new Date().toLocaleDateString('sv-SE');
  const allRecords = () => readHistoryStore().map((x, i) => Object.assign({}, x, { _index: i }));
  const company = () => ORG.items.find((c) => c.id === st.companyId);
  const latest = (recs) => { const p = recs.filter((r) => PERIOD_RE.test(r.period || '')).map((r) => r.period).sort(); return p.length ? p[p.length - 1] : todayISO().slice(0, 7); };
  function modelFor(c, recs) {
    const period = PERIOD_RE.test(st.period) ? st.period : latest(recs);
    return D.buildModel({ company: c, records: recs, period, range: { kind: st.range, from: st.from, to: st.to }, today: todayISO(), taxRemittance: S.taxRemittance || 'monthly', metric: st.metric });
  }
  const userName = () => (S.userName || '').trim();
  const frDate = (iso) => { const p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; };
  function trendOf(points) {
    const v = points.filter((p) => p.value !== null);
    if (v.length < 2) return null;
    const a = v[v.length - 2].value, b = v[v.length - 1].value;
    return a > 0 ? ((b - a) / a) * 100 : null;
  }
  const pct1 = (x) => Math.abs(x).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';

  /* ───────── Squelette ───────── (le menu latéral est celui de l'application : voir shell.js) */
  function build() {
    const el = document.createElement('div');
    el.id = 'ws'; el.className = 'hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Dossier de l’entreprise');
    el.innerHTML =
      '<section class="ws-main"><header class="ws-top"><div class="ws-search" role="search">' + icon('search') + '<input id="wsSearch" type="search" placeholder="Rechercher un employé, une opération, un bulletin…" aria-label="Rechercher un employé ou un bulletin de cette entreprise" autocomplete="off"><div id="wsResults" class="cp-results hidden"></div></div><div class="cp-spacer"></div>' +
      '<button type="button" class="cp-icon-btn" id="wsBell" aria-label="Alertes">' + icon('bell') + '<span class="cp-badge-dot hidden" id="wsBellCount">0</span></button>' +
      '<div style="position:relative"><button type="button" class="ws-user" id="wsUser" aria-haspopup="menu" aria-expanded="false"><span class="cp-avatar" id="wsAvatar">A</span><div><b id="wsUserName">Administrateur</b><small>Administrateur</small></div>' + icon('chevron').replace('<svg', '<svg style="width:14px;height:14px;transform:rotate(90deg)"') + '</button>' +
      '<div class="ws-menu hidden" id="wsMenu" role="menu"><button type="button" role="menuitem" data-act="view:config">Paramètres de paie</button><button type="button" role="menuitem" data-act="ws-general">Tableau de bord général</button></div></div></header>' +
      '<div class="ws-content" id="wsContent" tabindex="-1"></div></section>';
    document.body.appendChild(el);
    return el;
  }

  /* ───────── Rubrique : tableau de bord ───────── */
  const chip = (label, pressed, attrs) => '<button type="button" class="cp-chip" aria-pressed="' + pressed + '" ' + attrs + '>' + esc(label) + '</button>';
  function alertsHTML(m) {
    if (!m.alerts.length) return '<div class="cp-empty"><b>Rien à signaler</b><span>' + (m.hasAnyRecord ? 'Aucune échéance proche ni anomalie détectée.' : 'Les alertes apparaîtront dès les premiers bulletins.') + '</span></div>';
    return '<ul class="cp-alerts">' + m.alerts.map((a) => {
      const k = a.text.indexOf(' : '), head = k > 0 && k < 24 ? '<b>' + esc(a.text.slice(0, k + 2)) + '</b>' + esc(a.text.slice(k + 2)) : esc(a.text);
      return '<li class="cp-alert ' + a.level + '"><span class="ico">' + icon(a.level === 'info' ? 'clock' : 'alert') + '</span><button type="button" class="main-act" data-act="' + esc(a.action) + '">' + head + '</button>' + (a.done ? '<button type="button" class="cp-btn sm" data-act="done" data-key="' + esc(a.done.key) + '" data-period="' + esc(a.done.period) + '" data-mode="' + esc(a.done.mode) + '">Marquer fait</button>' : '<span></span>') + '</li>';
    }).join('') + '</ul>';
  }
  function shortcutsHTML() {
    const t = [['new-payslip', 'file2', 't-blue', 'Créer un bulletin'], ['module:social', 'building2', 't-teal', 'Déclarer les charges sociales'], ['module:payslips', 'file', 't-violet', 'Consulter les bulletins'], ['export-report', 'download', 't-orange', 'Exporter un rapport']];
    return '<div class="ws-shortcuts">' + t.map(([a, i, c, l]) => '<button type="button" class="ws-shortcut" data-act="' + a + '"><span class="ico ' + c + '">' + icon(i) + '</span>' + esc(l) + '</button>').join('') + '</div>';
  }
  function dashboardHTML(m, c) {
    const un = userName(), tr = trendOf(m.series.points);
    const trend = tr === null ? '' : '<div class="ws-trend' + (tr < 0 ? ' down' : '') + '"><b>' + (Math.abs(tr) < 0.05 ? '= Stable' : (tr > 0 ? '↑ +' : '↓ −') + pct1(tr)) + '</b><small>par rapport au mois précédent</small></div>';
    const ctrl = '<div class="ws-chart-ctrl"><div class="cp-chip-group" role="group" aria-label="Indicateur">' + Object.keys(D.SERIES).map((k) => chip(D.SERIES[k].short, st.metric === k, 'data-metric="' + k + '"')).join('') + '</div><div class="cp-chip-group" role="group" aria-label="Plage de mois">' + [['6', '6 mois'], ['12', '12 mois'], ['custom', 'Personnalisée']].map(([k, l]) => chip(l, st.range === k, 'data-range="' + k + '"')).join('') + '</div>' +
      (st.range === 'custom' ? '<label class="cp-select"><input id="wsFrom" type="month" value="' + esc(m.rangeFrom) + '" aria-label="Du mois"></label><span class="cp-sub">à</span><label class="cp-select"><input id="wsTo" type="month" value="' + esc(m.rangeTo) + '" aria-label="Au mois"></label>' : '') + '</div>';
    return '<div class="ws-dash"><div class="ws-hello"><div><h1>Bonjour' + (un ? ' ' + esc(un) : '') + ' 👋</h1><p>Voici un aperçu de l’activité paie de ' + esc(c.name) + ' pour ' + esc(D.monthLabel(m.period)) + '.</p></div><label class="ws-period">' + icon('calendar') + '<input id="wsPeriod" type="month" value="' + esc(m.period) + '" aria-label="Période de paie"></label></div>' +
      '<div class="ws-grid4">' + cur(D.renderKpis(m)) + '</div>' +
      '<div class="ws-row2"><article class="cp-card"><div class="cp-card-head"><div><h2>Évolution de la masse salariale</h2><p class="cp-sub">' + esc(m.series.label) + '</p></div>' + trend + '</div>' + ctrl + '<div id="wsChart">' + D.renderChart(m) + '</div></article>' +
      '<article class="cp-card"><div class="cp-card-head"><h2>Répartition des charges</h2></div><div id="wsDonut">' + cur(D.renderDonut(m)) + '</div></article>' +
      '<article class="cp-card"><div class="cp-card-head"><h2>Raccourcis</h2></div>' + shortcutsHTML() + '</article></div>' +
      '<div class="ws-row3"><article class="cp-card"><div class="cp-card-head"><h2>Derniers bulletins de paie</h2><button type="button" class="cp-link" data-act="module:payslips">Voir tout →</button></div>' + cur(D.renderEmployeeTable(m, 8)) + '</article>' +
      '<div class="ws-stack"><article class="cp-card" id="wsAlertsCard"><div class="cp-card-head"><h2>' + icon('bulb').replace('<svg', '<svg width="22" height="22" style="vertical-align:-5px;margin-right:8px;color:#f4bd3c"') + 'Informations importantes</h2></div>' + alertsHTML(m) +
      '<p style="margin:12px 0 0"><button type="button" class="cp-link" data-act="module:deadlines">Voir le calendrier des échéances →</button></p></article>' +
      '<article class="cp-card ws-help"><div class="ws-help-head">' + icon('shield') + '<h2>Besoin d’aide ?</h2></div><p>Notre équipe est là pour vous accompagner.</p><button type="button" class="cp-btn primary" data-act="support">' + icon('headset') + 'Contacter le support</button></article></div></div>' +
      '<footer class="ws-foot"><span><b>Corinta Pay</b> · ' + esc(((document.getElementById('appVersion') || {}).textContent || '').replace('Version ', 'v')) + ' | Paie • RH • Conformité</span><span><i class="dot"></i>Données enregistrées sur cet appareil</span></footer></div>';
  }

  /* ───────── Classement Année › Mois (bulletins, déclarations, charges, documents) ─────────
     Les dossiers sont calculés à partir des bulletins enregistrés : aucune donnée n'est dupliquée.
     À l'ouverture d'une rubrique, le dossier du mois courant (dernier mois traité) est ouvert ; le fil d'Ariane remonte à l'année puis à la liste des années.
     « Vue à plat » affiche l'ancienne page (tous les bulletins / cumul de toutes les périodes). */
  st.nav = { payslips: {}, declarations: {}, charges: {}, documents: {} };
  const resetNav = (mod) => { if (st.nav[mod]) st.nav[mod] = {}; };
  const yearOf = (p) => String(p).slice(0, 4);
  const monthName = (p) => D.monthLabel(p).split(' ')[0];
  const thisMonth = () => todayISO().slice(0, 7);
  const plural = (n, w) => n + ' ' + w + (n > 1 && !/s$/.test(w) ? 's' : '');
  function level(key, recs) {
    const n = st.nav[key];
    if (n.flat) return { lv: 'flat' };
    if (n.m) return { lv: 'month', y: yearOf(n.m), m: n.m };
    if (n.y) return { lv: 'year', y: n.y };
    if (n.root) return { lv: 'root' };
    const p = latest(recs); n.m = p; n.y = yearOf(p);
    return { lv: 'month', y: n.y, m: p };
  }
  function byPeriod(recs) { const o = {}; recs.forEach((r) => { if (PERIOD_RE.test(r.period || '')) (o[r.period] = o[r.period] || []).push(r); }); return o; }
  /* Dès décembre, le dossier de l'année suivante est créé automatiquement (il s'ouvre sur janvier, prêt pour les premiers bulletins). */
  const nextYear = () => String(Number(yearOf(thisMonth())) + 1);
  const newYearOpen = () => thisMonth().slice(5) === '12';
  const yearList = (per) => { const s = new Set(Object.keys(per).map(yearOf)); s.add(yearOf(thisMonth())); if (newYearOpen()) s.add(nextYear()); return [...s].sort().reverse(); };
  const yearEmpty = (y) => (y > yearOf(thisMonth()) ? 'Nouvelle année · prête pour janvier' : 'Aucun bulletin');
  function monthList(per, y) {
    const s = new Set(Object.keys(per).filter((p) => yearOf(p) === y));
    if (y === nextYear() && newYearOpen()) s.add(y + '-01');
    if (y === yearOf(thisMonth())) for (let k = 1; k <= Number(thisMonth().slice(5)); k++) s.add(y + '-' + String(k).padStart(2, '0')); // mois sans bulletin : visibles seulement pour l'année en cours
    return [...s].sort().reverse();
  }
  function navBar(key, rootLabel, lv) {
    const b = (nav, t) => '<button type="button" class="ws-crumb" data-nav="' + nav + '">' + esc(t) + '</button>', sep = '<span aria-hidden="true">›</span>';
    let h = lv.lv === 'root' ? '<b>' + esc(rootLabel) + '</b>' : b('root|' + key, rootLabel);
    if (lv.lv === 'flat') h += sep + '<b>Vue à plat</b>';
    else {
      if (lv.y) h += sep + (lv.lv === 'year' ? '<b>' + esc(lv.y) + '</b>' : b('year|' + key + '|' + lv.y, lv.y));
      if (lv.m) h += sep + '<b>' + esc(monthName(lv.m)) + '</b>';
    }
    return '<div class="ws-navbar"><nav class="ws-crumbs" aria-label="Fil d’Ariane">' + icon('folder') + h + '</nav><button type="button" class="cp-btn sm" data-nav="' + (lv.lv === 'flat' ? 'root|' + key : 'flat|' + key) + '">' + (lv.lv === 'flat' ? 'Vue par dossiers' : 'Vue à plat') + '</button></div>';
  }
  const folder = (nav, title, lines, o) => '<button type="button" class="ws-folder' + (o && o.empty ? ' empty' : '') + '" data-nav="' + nav + '"><span class="ico">' + icon('folder') + '</span><span class="body"><b>' + esc(title) + '</b>' + lines.map((l) => '<span>' + l + '</span>').join('') + '</span>' + ((o && o.badge) || '') + '</button>';
  const badgeOf = (txt, tone) => '<span class="cp-badge ' + tone + '">' + esc(txt) + '</span>';
  /* Liste des dossiers (années ou mois) ; yearCard / monthCard fabriquent les cartes selon la rubrique. */
  function folderGrid(key, lv, per, yearCard, monthCard) {
    if (lv.lv === 'root') return '<div class="ws-folders">' + yearList(per).map((y) => yearCard(y, Object.keys(per).filter((p) => yearOf(p) === y).map((p) => per[p]))).join('') + '</div>';
    return '<div class="ws-folders">' + monthList(per, lv.y).map((p) => monthCard(p, per[p] || [])).join('') + '</div>';
  }
  const flatten = (lists) => lists.reduce((a, l) => a.concat(l), []);
  const netOf = (rs) => rs.reduce((s, r) => s + D.recNet(r), 0), grossOf = (rs) => rs.reduce((s, r) => s + D.recGross(r), 0);
  const paidOf = (rs) => rs.filter((r) => D.recStatus(r) === 'Payé').length;
  const pageHead = (title, sub, tools) => '<div class="ws-page-head"><div><h1>' + esc(title) + '</h1><p>' + esc(sub) + '</p></div>' + (tools ? '<div class="ws-tools">' + tools + '</div>' : '') + '</div>';
  const emptyYear = (y) => '<div class="cp-empty"><b>Aucun bulletin en ' + esc(y) + '</b><span>Les dossiers se créent tout seuls à l’enregistrement des bulletins.</span></div>';

  /* Totaux de charges d'une liste de bulletins (même logique que le cumul du dossier ; null = détail indisponible). */
  function sumCharges(rs) {
    const o = { ir: 0, trimf: 0, ipresE: 0, ipresP: 0, cssE: 0, cssP: 0 }, k = { tax: 0, ipres: 0, css: 0 }, has = (v) => v !== undefined && v !== null && v !== '', n = (v) => Number(v) || 0;
    rs.forEach((x) => {
      const t = x.totals || {}, f = x.fields || {};
      if (has(t.irAmount) || has(t.trimfAmount) || has(f.ir) || has(f.trimf)) { k.tax++; o.ir += has(t.irAmount) ? n(t.irAmount) : n(f.ir); o.trimf += has(t.trimfAmount) ? n(t.trimfAmount) : n(f.trimf); }
      if (has(t.ipresEmployee) || has(t.ipresEmployer)) { k.ipres++; o.ipresE += n(t.ipresEmployee); o.ipresP += n(t.ipresEmployer); }
      if (has(t.cssEmployee) || has(t.cssEmployer)) { k.css++; o.cssE += n(t.cssEmployee); o.cssP += n(t.cssEmployer); }
    });
    const none = !rs.length;
    return { n: rs.length, known: k, ir: k.tax || none ? o.ir : null, trimf: k.tax || none ? o.trimf : null, taxes: k.tax || none ? o.ir + o.trimf : null, ipresE: k.ipres || none ? o.ipresE : null, ipresP: k.ipres || none ? o.ipresP : null, ipres: k.ipres || none ? o.ipresE + o.ipresP : null, cssE: k.css || none ? o.cssE : null, cssP: k.css || none ? o.cssP : null, css: k.css || none ? o.cssE + o.cssP : null };
  }
  const mny = (v) => (v === null ? '—' : D.money(v));

  /* Échéances légales d'un mois (CSS art. 93, CGI art. 185) et état de suivi. */
  function obligationsOf(c, m, p) {
    const social = window.CorintaLegal.socialMode(m.employeeCount), tax = S.taxRemittance === 'quarterly' ? 'quarterly' : 'monthly', today = Date.parse(todayISO());
    return D.OBLIGATIONS.map((o) => {
      const mode = o.key === 'impots' ? tax : social, due = window.CorintaLegal.dueMonth(p, mode) + '-' + String(window.CorintaLegal.DUE_DAY).padStart(2, '0');
      return { o, mode, due, done: !!(c.obligations && c.obligations[p] && c.obligations[p][o.key]), days: Math.round((Date.parse(due) - today) / 864e5) };
    });
  }
  const stateTone = (s) => (s.done ? 'success' : s.days < 0 ? 'danger' : s.days <= 10 ? 'warning' : 'info');
  const stateText = (s) => (s.done ? 'Fait' : s.days < 0 ? 'Retard ' + Math.abs(s.days) + ' j' : 'J−' + s.days);

  /* ── Bulletins de paie ── */
  function payslipsHTML(c, recs) {
    const lv = level('payslips', recs), per = byPeriod(recs);
    if (lv.lv === 'month' || lv.lv === 'flat') return navBar('payslips', 'Bulletins de paie', lv) + payslipsTable(c, recs, lv);
    const tools = '<button type="button" class="cp-btn primary" data-act="new-payslip">' + icon('plus') + 'Créer un bulletin</button>';
    const yearCard = (y, lists) => { const rs = flatten(lists); return folder('year|payslips|' + y, y, rs.length ? [plural(rs.length, 'bulletin') + ' · ' + plural(lists.length, 'mois'), 'Net à payer : ' + esc(D.money(netOf(rs)))] : [yearEmpty(y)], { empty: !rs.length }); };
    const monthCard = (p, rs) => folder('month|payslips|' + p, monthName(p), rs.length ? [plural(rs.length, 'bulletin'), 'Brut ' + esc(D.money(grossOf(rs))), 'Net ' + esc(D.money(netOf(rs)))] : ['Aucun bulletin'], { empty: !rs.length, badge: rs.length ? badgeOf(paidOf(rs) + '/' + rs.length + ' payé' + (paidOf(rs) > 1 ? 's' : ''), paidOf(rs) === rs.length ? 'success' : 'neutral') : '' });
    const sub = lv.lv === 'root' ? 'Un dossier par année, puis un dossier par mois' : 'Année ' + lv.y + ' · un dossier par mois';
    return pageHead('Bulletins de paie', c.name + ' · ' + sub, tools) + navBar('payslips', 'Bulletins de paie', lv) + folderGrid('payslips', lv, per, yearCard, monthCard);
  }

  /* ── Déclarations sociales et fiscales ── */
  function declarationsHTML(c, m, recs) {
    const lv = level('declarations', recs), per = byPeriod(recs);
    if (lv.lv === 'flat') return navBar('declarations', 'Déclarations', lv) + declarationsFlat(c, m);
    if (lv.lv === 'month') return navBar('declarations', 'Déclarations', lv) + declarationsMonth(c, m, lv.m, per[lv.m] || []);
    const sumState = (p) => obligationsOf(c, m, p);
    const yearCard = (y, lists) => {
      const ps = Object.keys(per).filter((p) => yearOf(p) === y), todo = ps.reduce((s, p) => s + sumState(p).filter((x) => !x.done).length, 0), late = ps.some((p) => sumState(p).some((x) => !x.done && x.days < 0));
      return folder('year|declarations|' + y, y, ps.length ? [plural(ps.length, 'mois') + ' traité' + (ps.length > 1 ? 's' : ''), todo ? plural(todo, 'déclaration') + ' à faire' : 'Toutes les déclarations faites'] : [y > yearOf(thisMonth()) ? yearEmpty(y) : 'Aucune période traitée'], { empty: !ps.length, badge: ps.length ? badgeOf(todo ? (late ? 'En retard' : 'À faire') : 'À jour', todo ? (late ? 'danger' : 'warning') : 'success') : '' });
    };
    const monthCard = (p, rs) => {
      if (!rs.length) return folder('month|declarations|' + p, monthName(p), ['Aucun bulletin', 'Aucune déclaration à prévoir'], { empty: true });
      const s = sumState(p), done = s.filter((x) => x.done).length, late = s.some((x) => !x.done && x.days < 0);
      return folder('month|declarations|' + p, monthName(p), [done + '/' + s.length + ' déclarations faites', s.filter((x) => !x.done).length ? 'Prochaine : ' + esc(frDate(s.filter((x) => !x.done).sort((a, b) => a.due.localeCompare(b.due))[0].due)) : 'Rien à régler'], { badge: badgeOf(done === s.length ? 'À jour' : late ? 'En retard' : 'À faire', done === s.length ? 'success' : late ? 'danger' : 'warning') });
    };
    return pageHead('Déclarations sociales et fiscales', c.name + ' · ' + (lv.lv === 'root' ? 'Un dossier par année, puis par mois' : 'Année ' + lv.y), '<button type="button" class="cp-btn" data-act="module:charges">' + icon('coin') + 'Voir les charges et cotisations</button>') + navBar('declarations', 'Déclarations', lv) + folderGrid('declarations', lv, per, yearCard, monthCard);
  }
  function declarationsMonth(c, m, p, rs) {
    const head = pageHead('Déclarations · ' + D.monthLabel(p), c.name + ' · ' + plural(rs.length, 'bulletin') + ' du mois', '<button type="button" class="cp-btn" data-nav="month|charges|' + p + '">' + icon('coin') + 'Charges de ce mois</button>');
    if (!rs.length) return head + '<div class="cp-empty"><b>Aucun bulletin en ' + esc(D.monthLabel(p)) + '</b><span>Aucune déclaration n’est due tant qu’aucun bulletin n’est enregistré pour ce mois.</span></div>';
    const cs = sumCharges(rs), amount = { ipres: cs.ipres, css: cs.css, impots: cs.taxes };
    const cards = obligationsOf(c, m, p).map((s) => {
      const q = Math.ceil(Number(p.slice(5)) / 3), when = s.mode === 'quarterly' ? 'Trimestre T' + q + ' ' + yearOf(p) + ' · ' : '';
      return '<article class="cp-card ws-obl"><div class="ws-obl-head"><div><h2>' + esc(s.o.label) + '</h2><p class="cp-sub">' + esc(s.o.desc) + '</p></div>' + badgeOf(stateText(s), stateTone(s)) + '</div><div class="ws-obl-amount">' + esc(mny(amount[s.o.key])) + '<small>' + (s.o.key === 'impots' ? 'IR + TRIMF retenus' : 'parts salariale et patronale') + '</small></div><p class="cp-sub">' + esc(when) + 'à régler avant le ' + esc(frDate(s.due)) + '</p>' +
        (s.done ? '<p class="ws-done">' + icon('check') + ' Déclaration marquée comme faite</p>' : '<button type="button" class="cp-btn sm primary" data-act="done" data-key="' + esc(s.o.key) + '" data-period="' + esc(p) + '" data-mode="' + esc(s.mode) + '">Marquer fait</button>') + '</article>';
    }).join('');
    const note = (cs.known.tax < cs.n || cs.known.ipres < cs.n || cs.known.css < cs.n) ? '<p class="cp-sub">Certains bulletins anciens n’ont pas de détail de charges : leurs montants ne sont pas estimés (recalcul depuis Documents › Recalculer les bulletins archivés).</p>' : '';
    return head + '<div class="ws-cards3">' + cards + '</div>' + note;
  }

  /* ── Charges et cotisations ── */
  function chargesHTML(c, recs) {
    const lv = level('charges', recs), per = byPeriod(recs);
    if (lv.lv === 'flat') return navBar('charges', 'Charges', lv) + chargesFlat(c);
    if (lv.lv === 'month') return navBar('charges', 'Charges', lv) + chargesMonth(c, lv.m, per[lv.m] || []);
    const yearCard = (y, lists) => { const rs = flatten(lists), s = sumCharges(rs); return folder('year|charges|' + y, y, rs.length ? ['IPRES ' + esc(mny(s.ipres)), 'CSS ' + esc(mny(s.css)), 'Impôts (IR + TRIMF) ' + esc(mny(s.taxes))] : [yearEmpty(y)], { empty: !rs.length }); };
    const monthCard = (p, rs) => { const s = sumCharges(rs); return folder('month|charges|' + p, monthName(p), rs.length ? ['IPRES ' + esc(mny(s.ipres)), 'CSS ' + esc(mny(s.css)), 'Impôts ' + esc(mny(s.taxes))] : ['Aucun bulletin'], { empty: !rs.length }); };
    return pageHead('Charges et cotisations', c.name + ' · ' + (lv.lv === 'root' ? 'Un dossier par année, puis par mois' : 'Année ' + lv.y)) + navBar('charges', 'Charges', lv) + folderGrid('charges', lv, per, yearCard, monthCard);
  }
  function chargesMonth(c, p, rs) {
    const head = pageHead('Charges · ' + D.monthLabel(p), c.name + ' · ' + plural(rs.length, 'bulletin') + ' du mois', '<button type="button" class="cp-btn" data-nav="month|declarations|' + p + '">' + icon('file') + 'Déclarations de ce mois</button>');
    if (!rs.length) return head + '<div class="cp-empty"><b>Aucun bulletin en ' + esc(D.monthLabel(p)) + '</b><span>Les charges apparaissent dès qu’un bulletin est enregistré pour ce mois.</span></div>';
    const s = sumCharges(rs), metric = (l, v) => '<div class="ws-metric"><span>' + esc(l) + '</span><b>' + esc(mny(v)) + '</b></div>';
    const cov = (k) => '(' + k + '/' + s.n + ' avec détail)';
    return head + '<article class="cp-card"><div class="cp-card-head"><div><h2>Charges sociales</h2><p class="cp-sub">IPRES et CSS ' + cov(Math.min(s.known.ipres, s.known.css)) + '</p></div></div><div class="ws-cards3">' + metric('IPRES · part salariale', s.ipresE) + metric('IPRES · part patronale', s.ipresP) + metric('CSS · part patronale', s.cssP) + '</div></article>' +
      '<article class="cp-card"><div class="cp-card-head"><div><h2>Charges fiscales</h2><p class="cp-sub">Impôt sur le revenu et TRIMF retenus ' + cov(s.known.tax) + '</p></div></div><div class="ws-cards3">' + metric('Impôt sur le revenu', s.ir) + metric('TRIMF', s.trimf) + metric('Total retenu', s.taxes) + '</div></article>';
  }

  /* ── Documents : exports + archives des bulletins par année et mois ── */
  function documentsHTML(c, recs) {
    const t = [['export-employees', 'users', 'Liste des salariés (CSV)', 'Nom, matricule, téléphone et emploi'], ['export-report', 'file', 'Liste des bulletins (CSV)', 'Net, masse brute, charges fiscales et sociales'], ['backup', 'download', 'Sauvegarde complète (JSON)', 'Toutes les entreprises, paramètres et bulletins'], ['import-backup', 'upload', 'Importer une sauvegarde', 'Restaure un fichier de sauvegarde JSON'], ['view:history', 'archive', 'Recalculer les bulletins archivés', 'Recalcul groupé selon les règles légales en vigueur'], ['recalc-log', 'clock', 'Journal des mises à jour automatiques', 'Bulletins recalculés quand une règle change · annulation possible']];
    const lv = level('documents', recs), per = byPeriod(recs);
    const exports = '<h2 class="ws-h2">Exports et sauvegarde</h2><div class="ws-cards3">' + t.map(([a, i, l, d]) => '<button type="button" class="cp-card ws-doc" data-act="' + a + '"><span class="ico">' + icon(i) + '</span><div><b>' + esc(l) + '</b><span>' + esc(d) + '</span></div></button>').join('') + '</div>';
    let arch;
    if (lv.lv === 'month' || lv.lv === 'flat') {
      const rs = (lv.lv === 'month' ? (per[lv.m] || []) : recs.filter((r) => PERIOD_RE.test(r.period || ''))).slice().sort((a, b) => String(b.period).localeCompare(String(a.period)) || String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' }));
      const act = (a, ic, label, r) => '<button type="button" class="cp-act" title="' + label + '" aria-label="' + label + ' : ' + esc(r.name) + ' · ' + esc(D.monthLabel(r.period)) + '" data-act="' + a + '" data-i="' + r._index + '">' + icon(ic) + '</button>';
      arch = rs.length ? '<article class="cp-card"><div class="cp-table-wrap"><table class="cp-table" style="min-width:560px"><thead><tr><th>Employé</th><th>Période</th><th class="num">Net à payer</th><th>Statut</th><th>Actions</th></tr></thead><tbody>' + rs.map((r) => '<tr><td><button type="button" class="cp-person cp-person-btn" data-act="edit" data-i="' + r._index + '" title="Ouvrir le bulletin pour le modifier"><span class="cp-avatar">' + esc(D.initials(r.name)) + '</span><div><b>' + esc(r.name) + '</b><span>' + esc((r.fields || {}).job || '—') + '</span></div></button></td><td class="nw">' + esc(D.monthLabel(r.period)) + '</td><td class="num"><b>' + esc(D.money(D.recNet(r))) + '</b></td><td><span class="cp-badge ' + ({ 'Brouillon': 'neutral', 'À valider': 'warning', 'Validé': 'info', 'Payé': 'success', 'Erreur': 'danger' }[D.recStatus(r)]) + '">' + esc(D.recStatus(r)) + '</span></td><td><div class="cp-actions">' + act('view', 'eye', 'Voir le bulletin (lecture seule)', r) + act('download', 'download', 'Télécharger en Excel ou PDF', r) + '</div></td></tr>').join('') + '</tbody></table></div></article>' : '<div class="cp-empty"><b>Aucun bulletin archivé' + (lv.lv === 'month' ? ' en ' + esc(D.monthLabel(lv.m)) : '') + '</b><span>Les bulletins enregistrés sont classés ici automatiquement.</span></div>';
    } else {
      const yearCard = (y, lists) => { const rs = flatten(lists); return folder('year|documents|' + y, y, rs.length ? [plural(rs.length, 'bulletin') + ' · ' + plural(lists.length, 'mois'), 'Net à payer : ' + esc(D.money(netOf(rs)))] : [yearEmpty(y)], { empty: !rs.length }); };
      const monthCard = (p, rs) => folder('month|documents|' + p, monthName(p), rs.length ? [plural(rs.length, 'bulletin'), 'Net ' + esc(D.money(netOf(rs)))] : ['Aucun bulletin'], { empty: !rs.length });
      arch = folderGrid('documents', lv, per, yearCard, monthCard);
    }
    return pageHead('Documents', 'Exports et archives du dossier ' + c.name) + exports + '<h2 class="ws-h2">Archives des bulletins</h2>' + navBar('documents', 'Archives', lv) + arch;
  }
  function navTo(spec) {
    const [kind, key, val] = spec.split('|');
    if (!st.nav[key]) return;
    if (kind === 'root') st.nav[key] = { root: true };
    else if (kind === 'year') st.nav[key] = { y: val };
    else if (kind === 'month') st.nav[key] = { y: yearOf(val), m: val };
    else if (kind === 'flat') st.nav[key] = { flat: true };
    st.module = key;
    st.sel.clear(); render(); $('wsContent').scrollTop = 0;
  }

  const dedOf = (r) => (r.totals && r.totals.totalDeductions !== undefined ? Number(r.totals.totalDeductions) : Math.max(0, D.recGross(r) - D.recNet(r)));
  const SORTS = { recent: 'Période : récente → ancienne', old: 'Période : ancienne → récente', name: 'Nom : A → Z', net: 'Net à payer : décroissant' };
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' });
  /* Lignes affichées : filtres (recherche, période, statut) puis tri — partagées par la page, les totaux et l'export. */
  function payslipRows(recs, lockedPeriod) {
    const q = st.sq.trim().toLocaleLowerCase('fr');
    const rows = recs.filter((r) => (lockedPeriod || !st.fPeriod || r.period === st.fPeriod) && (!st.fStatus || D.recStatus(r) === st.fStatus) &&
      (!q || String(r.name || '').toLocaleLowerCase('fr').includes(q) || String((r.fields || {}).mat || '').toLocaleLowerCase('fr').includes(q) || String((r.fields || {}).job || '').toLocaleLowerCase('fr').includes(q)));
    const cmp = { recent: (a, b) => String(b.period).localeCompare(String(a.period)) || byName(a, b), old: (a, b) => String(a.period).localeCompare(String(b.period)) || byName(a, b), name: (a, b) => byName(a, b) || String(b.period).localeCompare(String(a.period)), net: (a, b) => D.recNet(b) - D.recNet(a) || byName(a, b) }[st.sort] || byName;
    return rows.sort(cmp);
  }
  function payslipsTable(c, recs, lv) {
    const locked = lv.lv === 'month';
    if (locked) recs = recs.filter((r) => r.period === lv.m);
    const periods = [...new Set(recs.map((r) => r.period).filter(Boolean))].sort().reverse();
    const rows = payslipRows(recs, locked), pickable = rows.filter((r) => D.recStatus(r) !== 'Erreur');
    st.sel = new Set([...st.sel].filter((i) => pickable.some((r) => r._index === i)));
    const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
    const body = rows.map((r) => {
      const status = D.recStatus(r), ded = dedOf(r), mat = (r.fields || {}).mat;
      const sel = status === 'Erreur' ? '<span class="cp-badge danger">Erreur</span>' : '<span class="cp-badge-select"><span class="cp-badge ' + ({ 'Brouillon': 'neutral', 'À valider': 'warning', 'Validé': 'info', 'Payé': 'success' }[status]) + '">' + esc(status) + '</span><select aria-label="Changer le statut du bulletin de ' + esc(r.name) + '" data-act="status" data-i="' + r._index + '">' + D.STATUSES.map((s) => '<option' + (s === status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></span>';
      const act = (a, ic, label, extra) => '<button type="button" class="cp-act' + (extra || '') + '" title="' + label + '" aria-label="' + label + ' : ' + esc(r.name) + ' · ' + esc(D.monthLabel(r.period)) + '" data-act="' + a + '" data-i="' + r._index + '">' + icon(ic) + '</button>';
      return '<tr><td class="ws-chk"><input type="checkbox" data-sel="' + r._index + '" aria-label="Sélectionner le bulletin de ' + esc(r.name) + ' (' + esc(D.monthLabel(r.period)) + ')"' + (status === 'Erreur' ? ' disabled' : '') + (st.sel.has(r._index) ? ' checked' : '') + '></td>' +
        '<td><button type="button" class="cp-person cp-person-btn" data-act="edit" data-i="' + r._index + '" title="Ouvrir le bulletin pour le modifier" aria-label="Ouvrir le bulletin de ' + esc(r.name) + ' (' + esc(D.monthLabel(r.period)) + ') pour le modifier"><span class="cp-avatar">' + esc(D.initials(r.name)) + '</span><div><b>' + esc(r.name) + '</b><span>' + esc((r.fields || {}).job || '—') + (mat ? ' · ' + esc(mat) : '') + '</span></div></button></td><td class="nw">' + esc(D.monthLabel(r.period)) + '</td><td class="num">' + esc(D.money(D.recGross(r))) + '</td><td class="num">' + esc(D.money(ded)) + '</td><td class="num"><b>' + esc(D.money(D.recNet(r))) + '</b></td><td>' + sel + '</td>' +
        '<td><div class="cp-actions">' + act('view', 'eye', 'Voir le bulletin (lecture seule)') + act('download', 'download', 'Télécharger en Excel ou PDF') + act('delete', 'trash', 'Supprimer le bulletin', ' danger') + '</div></td></tr>';
    }).join('');
    const filtered = !!(st.sq || (!locked && st.fPeriod) || st.fStatus);
    const stat = (l, v) => '<div class="ws-sum"><span>' + l + '</span><b>' + esc(v) + '</b></div>';
    const bulk = st.sel.size ? '<div class="ws-bulk" role="region" aria-label="Actions groupées"><b>' + st.sel.size + ' bulletin' + (st.sel.size > 1 ? 's' : '') + ' sélectionné' + (st.sel.size > 1 ? 's' : '') + '</b><label class="ws-field"><span class="sr">Nouveau statut</span><select id="wsBulkStatus" aria-label="Nouveau statut">' + D.STATUSES.map((s) => '<option>' + s + '</option>').join('') + '</select></label><button type="button" class="cp-btn primary sm" data-act="ws-bulk">Appliquer le statut</button><button type="button" class="cp-btn sm" data-act="ws-clear-sel">Désélectionner</button></div>' : '';
    return '<div class="ws-page-head"><div><h1>Bulletins de paie' + (locked ? ' · ' + esc(D.monthLabel(lv.m)) : '') + '</h1><p>' + esc(c.name) + ' · ' + recs.length + ' bulletin' + (recs.length > 1 ? 's' : '') + ' enregistré' + (recs.length > 1 ? 's' : '') + ' · ' + rows.length + ' affiché' + (rows.length > 1 ? 's' : '') + '</p></div><div class="ws-tools">' +
      '<button type="button" class="cp-btn" data-act="ws-export"' + (rows.length ? '' : ' disabled') + '>' + icon('download') + 'Télécharger la liste (CSV)' + (filtered ? ' filtrée' : '') + '</button><button type="button" class="cp-btn primary" data-act="new-payslip">' + icon('plus') + 'Créer un bulletin</button></div></div>' +
      '<div class="ws-tools ws-filters"><div class="ws-field"><label for="wsPQ">Rechercher</label><input id="wsPQ" type="search" placeholder="Nom, matricule ou emploi" value="' + esc(st.sq) + '" autocomplete="off"></div>' +
      (locked ? '' : '<div class="ws-field"><label for="wsFP">Période</label><select id="wsFP"><option value="">Toutes</option>' + periods.map((p) => '<option value="' + p + '"' + (p === st.fPeriod ? ' selected' : '') + '>' + esc(D.monthLabel(p)) + '</option>').join('') + '</select></div>') +
      '<div class="ws-field"><label for="wsFS">Statut</label><select id="wsFS"><option value="">Tous</option>' + [...D.STATUSES, 'Erreur'].map((s) => '<option' + (s === st.fStatus ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
      '<div class="ws-field"><label for="wsSort">Trier par</label><select id="wsSort">' + Object.keys(SORTS).map((k) => '<option value="' + k + '"' + (k === st.sort ? ' selected' : '') + '>' + SORTS[k] + '</option>').join('') + '</select></div>' +
      (filtered ? '<button type="button" class="cp-btn sm" data-act="ws-reset-filters">Réinitialiser</button>' : '') + '</div>' +
      '<div class="ws-sums">' + stat('Bulletins affichés', String(rows.length)) + stat('Masse brute', D.money(sum(D.recGross))) + stat('Retenues', D.money(sum(dedOf))) + stat('Net à payer', D.money(sum(D.recNet))) + '</div>' + bulk +
      '<article class="cp-card">' + (rows.length ? '<div class="cp-table-wrap"><table class="cp-table" style="min-width:860px"><thead><tr><th class="ws-chk"><input type="checkbox" id="wsAll" aria-label="Tout sélectionner"' + (pickable.length && st.sel.size === pickable.length ? ' checked' : '') + (pickable.length ? '' : ' disabled') + '></th><th>Employé</th><th>Période</th><th class="num">Brut</th><th class="num">Retenues</th><th class="num">Net à payer</th><th>Statut</th><th>Actions</th></tr></thead><tbody>' + body + '</tbody></table></div>' : '<div class="cp-empty"><b>' + (recs.length ? 'Aucun bulletin pour ce filtre' : 'Aucun bulletin enregistré') + '</b><span>' + (recs.length ? 'Changez la recherche, la période ou le statut.' : 'Préparez un bulletin puis enregistrez-le dans le dossier.') + '</span></div>') + '</article>';
  }
  function exportPayslips() {
    const c = company(); if (!c) return;
    const mine = allRecords().filter((r) => r.companyId === c.id), lv = level('payslips', mine), locked = lv.lv === 'month';
    const rows = payslipRows(locked ? mine.filter((r) => r.period === lv.m) : mine, locked);
    if (!rows.length) { toast('Aucun bulletin à exporter avec ces filtres'); return; }
    const num = (v) => Number(v) || 0;
    csvDownload('bulletins-' + c.name + (locked ? '-' + lv.m : '') + '.csv', [['Salarié', 'Matricule', 'Période', 'Statut', 'Masse salariale brute', 'Retenues', 'Net à payer', 'Charges fiscales IR + TRIMF', 'IPRES', 'CSS/CNSS employeur']].concat(rows.map((r) => {
      const t = r.totals || {}, f = r.fields || {};
      return [r.name, f.mat || '', r.period, D.recStatus(r), D.recGross(r), dedOf(r), D.recNet(r), t.fiscalCharges !== undefined ? t.fiscalCharges : num(f.ir) + num(f.trimf), num(t.ipresEmployee) + num(t.ipresEmployer), num(t.cssEmployer)];
    })));
    toast(rows.length + ' bulletin' + (rows.length > 1 ? 's' : '') + ' exporté' + (rows.length > 1 ? 's' : ''));
  }
  function bulkStatus() {
    const v = $('wsBulkStatus') && $('wsBulkStatus').value; if (D.STATUSES.indexOf(v) < 0 || !st.sel.size) return;
    const h = readHistoryStore(); let n = 0;
    st.sel.forEach((i) => { if (h[i] && D.recStatus(h[i]) !== 'Erreur') { h[i].status = v; n++; } });
    if (!n || !writeStore('paieHistory', h)) return;
    queueCloudSync(); st.sel.clear(); toast(n + ' bulletin' + (n > 1 ? 's' : '') + ' : statut « ' + v + ' »'); render();
  }

  /* ───────── Rubrique : déclarations sociales ───────── */
  function declarationsFlat(c, m) {
    const n = m.employeeCount, mode = n >= 20 ? 'mensuel' : 'trimestriel';
    const body = '<article class="cp-card"><div class="cp-card-head"><div><h2>Échéances à venir</h2><p class="cp-sub">' + n + ' salarié' + (n > 1 ? 's' : '') + ' : IPRES et CSS en versement <b>' + mode + '</b> (CSS art. 93) · impôts : ' + ((S.taxRemittance === 'quarterly') ? 'trimestriel' : 'mensuel') + ' (CGI art. 185). Modifiable dans Paramètres de paie.</p></div></div>' +
      (m.deadlines.length ? m.deadlines.map((d) => '<div class="ws-deadline"><div><b>' + esc(d.label) + ' · ' + esc(d.desc) + '</b><span>' + (d.mode === 'quarterly' ? 'Trimestre ' : '') + esc(d.periodLabel) + ' · à régler avant le ' + esc(frDate(d.due)) + '</span></div><span class="cp-badge ' + (d.level === 'ok' ? 'success' : d.level === 'soon' ? 'warning' : 'danger') + '">' + (d.days < 0 ? 'Retard ' + Math.abs(d.days) + ' j' : d.days + ' j') + '</span><button type="button" class="cp-btn sm" data-act="done" data-key="' + esc(d.key) + '" data-period="' + esc(d.period) + '" data-mode="' + esc(d.mode) + '">Marquer fait</button></div>').join('') : '<div class="cp-empty"><b>Aucune échéance en attente</b><span>Les échéances apparaissent dès que des bulletins sont enregistrés et disparaissent une fois marquées comme faites.</span></div>') + '</article>';
    return '<div class="ws-page-head"><div><h1>Déclarations sociales et fiscales</h1><p>Échéances légales de ' + esc(c.name) + '</p></div><div class="ws-tools"><button type="button" class="cp-btn" data-act="module:charges">' + icon('coin') + 'Voir les charges et cotisations</button></div></div>' + body;
  }
  function chargesFlat(c) {
    const tabs = '<div class="cp-chip-group" role="group" aria-label="Type de charges">' + [['social', 'Charges sociales'], ['taxes', 'Charges fiscales']].map(([k, l]) => chip(l, st.decl === k, 'data-decl="' + k + '"')).join('') + '</div>';
    const k = folderTotals(c), n = k.h.length, cov = k.metricsCoverage || {};
    const metric = (l, v) => '<div class="ws-metric"><span>' + esc(l) + '</span><b>' + esc(cur(folderMoney(v))) + '</b></div>';
    let body;
    if (st.decl === 'taxes') body = '<article class="cp-card"><div class="cp-card-head"><div><h2>Charges fiscales cumulées</h2><p class="cp-sub">Impôt sur le revenu et TRIMF retenus sur les bulletins enregistrés (' + (cov.tax || 0) + '/' + n + ' avec détail).</p></div></div><div class="ws-cards3">' + metric('Impôt sur le revenu', k.ir) + metric('TRIMF', k.trimf) + metric('Total retenu', k.taxes) + '</div></article>';
    else body = '<article class="cp-card"><div class="cp-card-head"><div><h2>Charges sociales cumulées</h2><p class="cp-sub">Cotisations IPRES et CSS portées par les bulletins enregistrés (' + (cov.ipres || 0) + '/' + n + ' bulletin' + (n > 1 ? 's' : '') + ' avec détail).</p></div></div><div class="ws-cards3">' + metric('IPRES · part salariale', k.ipresE) + metric('IPRES · part patronale', k.ipresP) + metric('CSS · part patronale', k.cssP) + '</div></article>';
    body += '<p class="cp-sub">Les anciens bulletins sans détail de charges ne sont pas estimés : recalculez-les depuis les archives (« Recalculer les bulletins archivés »).</p>';
    return '<div class="ws-page-head"><div><h1>Charges et cotisations</h1><p>Montants cumulés portés par les bulletins de ' + esc(c.name) + '</p></div><div class="ws-tools">' + tabs + '</div></div>' + body;
  }

  /* ───────── Rubrique : documents ───────── */
  /* ───────── Rubrique : paramètres du dossier ───────── */
  function settingsHTML(c, m) {
    const k = folderTotals(c);
    return '<div class="ws-page-head"><div><h1>Informations de l’entreprise</h1><p>Dossier de paie · ' + m.employeeCount + ' salarié' + (m.employeeCount > 1 ? 's' : '') + ' · ' + k.h.length + ' bulletin' + (k.h.length > 1 ? 's' : '') + '</p></div></div>' +
      '<article class="cp-card ws-form"><h2>Identité du dossier</h2><div class="ws-info"><div><span>Nom du dossier</span><b>' + esc(c.name) + '</b></div><div><span>Identifiant</span><b>' + esc(c.id) + '</b></div><div><span>Employeur sur les bulletins</span><b>' + esc(c.employer || c.name) + '</b></div></div></article>' +
      '<article class="cp-card ws-form"><h2>Nom de l’employeur sur le bulletin</h2><div class="row"><div class="ws-field"><label for="wsEmployer">Nom légal de l’employeur</label><input id="wsEmployer" value="' + esc(c.employer || '') + '" placeholder="Entreprise SARL"></div><button type="button" class="cp-btn primary" data-act="ws-save-employer">Enregistrer</button></div><p class="cp-sub">Ce nom figure sur les bulletins et les exports de ce dossier.</p></article>';
  }
  function paramsHTML(c, m) {
    const n = m.employeeCount, mode = n >= 20 ? 'mensuel' : 'trimestriel';
    return '<div class="ws-page-head"><div><h1>Paramètres de l’entreprise</h1><p>Règles appliquées au dossier ' + esc(c.name) + '</p></div></div>' +
      '<article class="cp-card ws-form"><h2>Rythme des déclarations</h2><div class="ws-info"><div><span>IPRES et CSS</span><b>Versement ' + mode + ' (' + n + ' salarié' + (n > 1 ? 's' : '') + ', CSS art. 93)</b></div><div><span>Impôts retenus (IR, TRIMF) et CFCE</span><b>' + (S.taxRemittance === 'quarterly' ? 'Trimestriel' : 'Mensuel') + ' (CGI art. 185)</b></div></div><div class="row"><button type="button" class="cp-btn primary" data-act="view:config">' + icon('gear') + 'Ouvrir les paramètres de paie</button></div><p class="cp-sub">Barèmes, taux et règles de calcul sont communs à toutes les entreprises ; ils se modifient dans Paramètres de paie.</p></article>' +
      '<article class="cp-card ws-form ws-danger"><h2>Supprimer ce dossier</h2><p class="cp-sub">Le dossier, ses ' + m.employeeCount + ' salarié(s) et tous ses bulletins seront supprimés définitivement. Une confirmation vous sera demandée.</p><div class="row"><button type="button" class="cp-btn" style="color:#b3261e;border-color:#f3b6b0" data-act="ws-delete">Supprimer le dossier…</button></div></article>';
  }

  /* ───────── Rendu ───────── */
  function render() {
    if (!st.open) return;
    const c = company();
    if (!c) { close({ returning: false }); if (window.CorintaShell) window.CorintaShell.go('companies'); else activateView('companies'); return; }
    try {
      const recs = allRecords().filter((r) => r.companyId === c.id), m = modelFor(c, recs), mod = st.module;
      const html = mod === 'payslips' ? payslipsHTML(c, recs) : mod === 'declarations' ? declarationsHTML(c, m, recs) : mod === 'charges' ? chargesHTML(c, recs) : mod === 'documents' ? documentsHTML(c, recs) : mod === 'settings' ? settingsHTML(c, m) : mod === 'params' ? paramsHTML(c, m) : dashboardHTML(m, c);
      const box = $('wsContent'), scroll = box.scrollTop, focusId = document.activeElement && document.activeElement.id;
      box.innerHTML = html;
      if (mod === st.lastModule) box.scrollTop = scroll;
      st.lastModule = mod;
      if (focusId === 'wsPQ' && $('wsPQ')) { const f = $('wsPQ'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
      const un = userName(); $('wsUserName').textContent = un || 'Administrateur'; $('wsAvatar').textContent = (un || 'A').trim().slice(0, 1).toUpperCase();
      const n = m.alerts.filter((a) => a.level !== 'info').length, b = $('wsBellCount'); b.textContent = n > 9 ? '9+' : String(n); b.classList.toggle('hidden', n === 0);
      $('wsBell').setAttribute('aria-label', n ? n + ' alerte' + (n > 1 ? 's' : '') + ' à traiter' : 'Aucune alerte');
      if (window.CorintaShell) window.CorintaShell.sync();
    } catch (err) {
      console.error('Espace de travail', err);
      $('wsContent').innerHTML = '<div class="cp-error" role="alert">Cette rubrique n’a pas pu être calculée : ' + esc((err && err.message) || err) + '. Vos données ne sont pas modifiées.</div>';
    }
  }

  /* ───────── Ouverture / fermeture ───────── */
  function open(id, panel) {
    const c = ORG.items.find((x) => x.id === id); if (!c) return;
    const key = panel || 'dashboard', prevCompany = st.companyId;
    st.companyId = id; st.module = MODULE_OF[key] || 'dashboard'; if (DECL_OF[key]) st.decl = DECL_OF[key]; resetNav(st.module);
    if (prevCompany !== id) { st.period = ''; st.q = ''; st.fPeriod = ''; st.fStatus = ''; st.sq = ''; st.sel.clear(); }
    st.open = true; st.returnTo = null; syncPill();
    ACTIVE_FOLDER_PAGE = false;
    if (activeCompany().id !== id) setActiveCompany(id, true);
    $('ws').classList.remove('hidden'); document.body.classList.add('ws-open'); document.body.style.overflow = 'hidden';
    render();
    const content = $('wsContent'); content.scrollTop = 0;
  }
  function close(opts) {
    if (!st.open) return;
    st.open = false; $('ws').classList.add('hidden'); document.body.classList.remove('ws-open'); document.body.style.overflow = '';
    $('wsMenu').classList.add('hidden'); $('wsResults').classList.add('hidden');
    st.returnTo = opts && opts.returning ? { id: st.companyId, module: st.module } : null; syncPill();
    if (window.CorintaShell) window.CorintaShell.sync();
  }
  /* Le menu principal affiche le dossier ouvert : plus de bouton « retour » séparé. */
  function syncPill() { const b = $('gBackWs'); if (b) b.remove(); }

  /* ───────── Recherche et événements ───────── */
  function search() {
    const q = $('wsSearch').value.trim().toLocaleLowerCase('fr'), box = $('wsResults'), c = company();
    if (!q || !c) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const rows = [];
    c.employees.forEach((e) => { const mat = String(e.mat || (e.fields || {}).mat || ''); if ((e.name || '').toLocaleLowerCase('fr').includes(q) || mat.toLocaleLowerCase('fr').includes(q)) rows.push('<button type="button" data-sr="emp" data-id="' + esc(e.id) + '"><span class="cp-tag">SALARIÉ</span><span><b>' + esc(e.name) + '</b><small>' + esc(mat || '—') + ' · ' + esc(e.job || '—') + '</small></span></button>'); });
    allRecords().filter((r) => r.companyId === c.id).forEach((r) => { if ((r.name || '').toLocaleLowerCase('fr').includes(q) || String(r.period || '').includes(q) || D.monthLabel(r.period).toLocaleLowerCase('fr').includes(q)) rows.push('<button type="button" data-sr="rec" data-id="' + r._index + '"><span class="cp-tag">BULLETIN</span><span><b>' + esc(r.name) + ' · ' + esc(D.monthLabel(r.period)) + '</b><small>Net à payer : ' + esc(r.net || '—') + '</small></span></button>'); });
    box.innerHTML = rows.slice(0, 12).join('') || '<div class="cp-empty" style="margin:6px"><b>Aucun résultat</b><span>Dans ' + esc(c.name) + '</span></div>';
    box.classList.remove('hidden');
  }
  function go(mod) { st.module = MODULE_OF[mod] || mod; if (DECL_OF[mod]) st.decl = DECL_OF[mod]; resetNav(st.module); render(); $('wsContent').scrollTop = 0; }
  function handleAct(a, el) {
    if (a === 'ws-exit') { if (window.CorintaShell) window.CorintaShell.go('companies'); return; }
    if (a === 'ws-general') { if (window.CorintaShell) window.CorintaShell.go('dashboard'); return; }
    if (a.indexOf('module:') === 0) { go(a.slice(7)); return; }
    if (a.indexOf('panel:') === 0) { go(a.slice(6)); return; }
    if (a === 'recalc-log') { if (window.CorintaAutoRecalc) window.CorintaAutoRecalc.showLog(0); return; }
    if (a === 'ws-export') { exportPayslips(); return; }
    if (a === 'ws-bulk') { bulkStatus(); return; }
    if (a === 'ws-clear-sel') { st.sel.clear(); render(); return; }
    if (a === 'ws-reset-filters') { st.sq = ''; st.fPeriod = ''; st.fStatus = ''; st.sel.clear(); render(); return; }
    if (a === 'delete') { deletePayslip(Number(el.dataset.i)); st.sel.clear(); render(); return; }
    if (a === 'export-employees') { $('exportEmployeeList').click(); return; }
    if (a === 'support') {
      const mail = (S.supportEmail || '').trim();
      if (/^[^@\s]+@[^@\s]+$/.test(mail)) { window.location.href = 'mailto:' + mail + '?subject=' + encodeURIComponent('Corinta Pay · ' + (company() || {}).name); } else toast('Renseignez l’e-mail du support dans Paramètres de paie → Tableau de bord');
      return;
    }
    if (a === 'ws-save-employer') { const c = company(); $('companyEmployerEdit').value = $('wsEmployer').value; $('saveCompanyName').click(); toast('Nom de l’employeur enregistré'); render(); return; }
    if (a === 'ws-delete') {
      const c = company(); pendingCompanyDeletion = c.id;
      $('deleteCompanyMessage').textContent = 'Le dossier « ' + c.name + ' », ses ' + (c.employees ? c.employees.length : 0) + ' salarié(s) et tous ses bulletins de paie seront supprimés définitivement.';
      $('deleteCompanyDialog').showModal(); return;
    }
    if (a === 'new-payslip' && st.module === 'payslips' && st.nav.payslips.m) {
      const p = st.nav.payslips.m; UI.act(a, el); const e = $('period');
      if (e) { e.value = p; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    UI.act(a, el);
  }
  function bind() {
    const root = $('ws');
    root.addEventListener('click', (e) => {
      const nv = e.target.closest('[data-nav]'); if (nv) { navTo(nv.dataset.nav); return; }
      const mbtn = e.target.closest('[data-m]'); if (mbtn) { $('wsMenu').classList.add('hidden'); go(mbtn.dataset.m); return; }
      const me = e.target.closest('[data-metric]'); if (me) { st.metric = me.dataset.metric; render(); return; }
      const ra = e.target.closest('[data-range]'); if (ra) { st.range = ra.dataset.range; if (st.range === 'custom' && !st.from) { const p = PERIOD_RE.test(st.period) ? st.period : latest(allRecords().filter((r) => r.companyId === st.companyId)); st.to = p; st.from = D.addMonths(p, -5); } render(); return; }
      const dc = e.target.closest('[data-decl]'); if (dc) { st.decl = dc.dataset.decl; render(); return; }
      const sr = e.target.closest('[data-sr]'); if (sr) { $('wsSearch').value = ''; search(); if (sr.dataset.sr === 'emp') UI.act('employee', { dataset: { id: sr.dataset.id } }); else UI.act('edit', { dataset: { i: sr.dataset.id } }); return; }
      if (e.target.closest('#wsUser')) { const m = $('wsMenu'), show = m.classList.contains('hidden'); m.classList.toggle('hidden', !show); $('wsUser').setAttribute('aria-expanded', String(show)); return; }
      if (e.target.closest('#wsBell')) { if (st.module !== 'dashboard') go('dashboard'); const card = $('wsAlertsCard'); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      const b = e.target.closest('[data-act]'); if (b && b.tagName !== 'SELECT') { $('wsMenu').classList.add('hidden'); handleAct(b.dataset.act, b); return; }
      if (!e.target.closest('#wsMenu')) $('wsMenu').classList.add('hidden');
      if (!e.target.closest('.ws-search')) $('wsResults').classList.add('hidden');
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('select[data-act="status"]')) { UI.setStatus(Number(t.dataset.i), t.value); return; }
      if (t.id === 'wsPeriod' && PERIOD_RE.test(t.value)) { st.period = t.value; render(); return; }
      if (t.id === 'wsFrom' || t.id === 'wsTo') { st.from = $('wsFrom').value; st.to = $('wsTo').value; if (st.from && st.to) render(); return; }
      if (t.matches('input[data-sel]')) { const i = Number(t.dataset.sel); if (t.checked) st.sel.add(i); else st.sel.delete(i); render(); return; }
      if (t.id === 'wsAll') { st.sel.clear(); if (t.checked) $('wsContent').querySelectorAll('input[data-sel]:not(:disabled)').forEach((x) => st.sel.add(Number(x.dataset.sel))); render(); return; }
      if (t.id === 'wsSort') { st.sort = t.value; render(); return; }
      if (t.id === 'wsFP') { st.fPeriod = t.value; render(); return; }
      if (t.id === 'wsFS') { st.fStatus = t.value; render(); }
    });
    root.addEventListener('input', (e) => { if (e.target.id === 'wsPQ') { st.sq = e.target.value; render(); } if (e.target.id === 'wsSearch') search(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) { $('wsMenu').classList.add('hidden'); $('wsResults').classList.add('hidden'); } });
  }

  /* ───────── Intégration ───────── */
  const baseActivate = activateView;
  activateView = function (v) {
    if (st.open) close({ returning: ['pay', 'history', 'config'].indexOf(v) >= 0 });
    baseActivate(v);
    if (['pay', 'history', 'config'].indexOf(v) < 0) { st.returnTo = null; }
    syncPill();
  };

  build(); bind();
  window.CorintaWS = { open, close, isOpen: () => st.open, render, go, state: st };
  syncPill();
})();
