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
  const st = { open: false, companyId: '', module: 'dashboard', decl: 'deadlines', period: '', range: '6', from: '', to: '', metric: 'gross', q: '', fPeriod: '', fStatus: '', returnTo: null };
  const MODULE_OF = { dashboard: 'dashboard', employees: 'employees', payslips: 'payslips', pay: 'payslips', social: 'declarations', taxes: 'declarations', declarations: 'declarations', deadlines: 'declarations', documents: 'documents', settings: 'settings' };
  const DECL_OF = { social: 'social', taxes: 'taxes', deadlines: 'deadlines', declarations: 'deadlines' };
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
      '<div class="ws-menu hidden" id="wsMenu" role="menu"><button type="button" role="menuitem" data-m="settings">Informations de l’entreprise</button><button type="button" role="menuitem" data-act="view:config">Paramètres de paie</button><button type="button" role="menuitem" data-act="ws-exit">Toutes les entreprises</button><button type="button" role="menuitem" data-act="ws-general">Tableau de bord général</button></div></div></header>' +
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
    const t = [['new-payslip', 'file2', 't-blue', 'Créer un bulletin'], ['module:social', 'building2', 't-teal', 'Déclarer les charges sociales'], ['module:employees', 'users', 't-violet', 'Gérer les employés'], ['export-report', 'download', 't-orange', 'Exporter un rapport']];
    return '<div class="ws-shortcuts">' + t.map(([a, i, c, l]) => '<button type="button" class="ws-shortcut" data-act="' + a + '"><span class="ico ' + c + '">' + icon(i) + '</span>' + esc(l) + '</button>').join('') + '</div>';
  }
  function dashboardHTML(m, c) {
    const un = userName(), tr = trendOf(m.series.points);
    const trend = tr === null ? '' : '<div class="ws-trend' + (tr < 0 ? ' down' : '') + '"><b>' + (Math.abs(tr) < 0.05 ? '= Stable' : (tr > 0 ? '↑ +' : '↓ −') + pct1(tr)) + '</b><small>par rapport au mois précédent</small></div>';
    const ctrl = '<div class="ws-chart-ctrl"><div class="cp-chip-group" role="group" aria-label="Indicateur">' + Object.keys(D.SERIES).map((k) => chip(D.SERIES[k].short, st.metric === k, 'data-metric="' + k + '"')).join('') + '</div><div class="cp-chip-group" role="group" aria-label="Plage de mois">' + [['6', '6 mois'], ['12', '12 mois'], ['custom', 'Personnalisée']].map(([k, l]) => chip(l, st.range === k, 'data-range="' + k + '"')).join('') + '</div>' +
      (st.range === 'custom' ? '<label class="cp-select"><input id="wsFrom" type="month" value="' + esc(m.rangeFrom) + '" aria-label="Du mois"></label><span class="cp-sub">à</span><label class="cp-select"><input id="wsTo" type="month" value="' + esc(m.rangeTo) + '" aria-label="Au mois"></label>' : '') + '</div>';
    return '<div class="ws-hello"><div><h1>Bonjour' + (un ? ' ' + esc(un) : '') + ' 👋</h1><p>Voici un aperçu de l’activité paie de ' + esc(c.name) + ' pour ' + esc(D.monthLabel(m.period)) + '.</p></div><label class="ws-period">' + icon('calendar') + '<input id="wsPeriod" type="month" value="' + esc(m.period) + '" aria-label="Période de paie"></label></div>' +
      '<div class="ws-grid4">' + cur(D.renderKpis(m)) + '</div>' +
      '<div class="ws-row2"><article class="cp-card"><div class="cp-card-head"><div><h2>Évolution de la masse salariale</h2><p class="cp-sub">' + esc(m.series.label) + '</p></div>' + trend + '</div>' + ctrl + '<div id="wsChart">' + D.renderChart(m) + '</div></article>' +
      '<article class="cp-card"><div class="cp-card-head"><h2>Répartition des charges</h2></div><div id="wsDonut">' + cur(D.renderDonut(m)) + '</div></article>' +
      '<article class="cp-card"><div class="cp-card-head"><h2>Raccourcis</h2></div>' + shortcutsHTML() + '</article></div>' +
      '<div class="ws-row3"><article class="cp-card"><div class="cp-card-head"><h2>Derniers bulletins de paie</h2><button type="button" class="cp-link" data-act="module:payslips">Voir tout →</button></div>' + cur(D.renderEmployeeTable(m, 8)) + '</article>' +
      '<div class="ws-stack"><article class="cp-card" id="wsAlertsCard"><div class="cp-card-head"><h2>' + icon('bulb').replace('<svg', '<svg width="22" height="22" style="vertical-align:-5px;margin-right:8px;color:#f4bd3c"') + 'Informations importantes</h2></div>' + alertsHTML(m) +
      '<p style="margin:12px 0 0"><button type="button" class="cp-link" data-act="module:deadlines">Voir le calendrier des échéances →</button></p></article>' +
      '<article class="cp-card ws-help"><div class="ws-help-head">' + icon('shield') + '<h2>Besoin d’aide ?</h2></div><p>Notre équipe est là pour vous accompagner.</p><button type="button" class="cp-btn primary" data-act="support">' + icon('headset') + 'Contacter le support</button></article></div></div>' +
      '<footer class="ws-foot"><span><b>Corinta Pay</b> · ' + esc(((document.getElementById('appVersion') || {}).textContent || '').replace('Version ', 'v')) + ' | Paie • RH • Conformité</span><span><i class="dot"></i>Données enregistrées sur cet appareil</span></footer>';
  }

  /* ───────── Rubrique : employés ───────── */
  function employeesData(c, recs) {
    const mineOf = (e) => recs.filter((r) => String(r.employeeId || '') === String(e.id) || (e.mat && String((r.fields || {}).mat || '') === String(e.mat)) || (!!r.name && r.name === e.name)).sort((a, b) => String(b.period).localeCompare(String(a.period)) || b._index - a._index)[0] || null;
    const list = c.employees.map((e) => ({ id: e.id, name: e.name || '—', job: e.job || (e.fields || {}).job || '', mat: e.mat || (e.fields || {}).mat || '', hire: (e.fields || {}).hire || '', last: mineOf(e) }));
    const known = new Set(list.map((p) => p.name));
    recs.forEach((r) => { if (r.name && !known.has(r.name) && !list.some((p) => p.last && p.last.name === r.name)) { known.add(r.name); list.push({ id: '', name: r.name, job: (r.fields || {}).job || '', mat: (r.fields || {}).mat || '', hire: (r.fields || {}).hire || '', last: r }); } });
    return list.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  }
  function employeesHTML(c, recs) {
    const q = st.q.trim().toLocaleLowerCase('fr'), all = employeesData(c, recs), rows = all.filter((p) => !q || p.name.toLocaleLowerCase('fr').includes(q) || String(p.mat).toLocaleLowerCase('fr').includes(q));
    const body = rows.map((p) => {
      const l = p.last;
      return '<tr><td><div class="cp-person"><span class="cp-avatar">' + esc(D.initials(p.name)) + '</span><div><b>' + esc(p.name) + '</b><span>' + esc(p.job || '—') + '</span></div></div></td><td>' + esc(p.mat || '—') + '</td><td>' + esc(frDate(p.hire)) + '</td>' +
        '<td>' + (l ? esc(D.monthLabel(l.period)) + ' · <b>' + esc(D.money(D.recNet(l))) + '</b>' : '<span class="cp-sub">Aucun bulletin</span>') + '</td>' +
        '<td><div class="cp-actions">' + (l ? '<button type="button" class="cp-act" title="Voir le dernier bulletin" aria-label="Voir le dernier bulletin de ' + esc(p.name) + '" data-act="view" data-i="' + l._index + '">' + icon('eye') + '</button><button type="button" class="cp-act" title="Télécharger (Excel)" aria-label="Télécharger le dernier bulletin de ' + esc(p.name) + '" data-act="download" data-i="' + l._index + '">' + icon('download') + '</button>' : '') +
        (p.id ? '<button type="button" class="cp-btn sm" data-act="employee" data-id="' + esc(p.id) + '">Fiche / bulletin</button>' : '') + '</div></td></tr>';
    }).join('');
    return '<div class="ws-page-head"><div><h1>Employés</h1><p>' + all.length + ' salarié' + (all.length > 1 ? 's' : '') + ' · classement alphabétique</p></div><div class="ws-tools"><div class="ws-field"><label for="wsQ">Rechercher</label><input id="wsQ" type="search" placeholder="Nom ou matricule" value="' + esc(st.q) + '"></div><button type="button" class="cp-btn" data-act="export-employees">' + icon('download') + 'Télécharger la liste (CSV)</button><button type="button" class="cp-btn primary" data-act="new-payslip">' + icon('plus') + 'Créer un bulletin</button></div></div>' +
      '<article class="cp-card">' + (rows.length ? '<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Employé</th><th>Matricule</th><th>Embauche</th><th>Dernier bulletin</th><th>Actions</th></tr></thead><tbody>' + body + '</tbody></table></div>' : '<div class="cp-empty"><b>' + (all.length ? 'Aucun résultat' : 'Aucun salarié dans ce dossier') + '</b><span>' + (all.length ? 'Modifiez la recherche.' : 'Créez un bulletin : le salarié sera ajouté au dossier à l’enregistrement.') + '</span></div>') + '</article>';
  }

  /* ───────── Rubrique : paie (bulletins) ───────── */
  function payslipsHTML(c, recs) {
    const periods = [...new Set(recs.map((r) => r.period).filter(Boolean))].sort().reverse();
    let rows = recs.filter((r) => (!st.fPeriod || r.period === st.fPeriod) && (!st.fStatus || D.recStatus(r) === st.fStatus));
    rows = rows.sort((a, b) => String(b.period).localeCompare(String(a.period)) || String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' }));
    const body = rows.map((r) => {
      const status = D.recStatus(r), ded = r.totals && r.totals.totalDeductions !== undefined ? Number(r.totals.totalDeductions) : Math.max(0, D.recGross(r) - D.recNet(r));
      const sel = status === 'Erreur' ? '<span class="cp-badge danger">Erreur</span>' : '<span class="cp-badge-select"><span class="cp-badge ' + ({ 'Brouillon': 'neutral', 'À valider': 'warning', 'Validé': 'info', 'Payé': 'success' }[status]) + '">' + esc(status) + '</span><select aria-label="Changer le statut du bulletin de ' + esc(r.name) + '" data-act="status" data-i="' + r._index + '">' + D.STATUSES.map((s) => '<option' + (s === status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></span>';
      return '<tr><td><div class="cp-person"><span class="cp-avatar">' + esc(D.initials(r.name)) + '</span><div><b>' + esc(r.name) + '</b><span>' + esc((r.fields || {}).job || '—') + '</span></div></div></td><td>' + esc(D.monthLabel(r.period)) + '</td><td class="num">' + esc(D.money(D.recGross(r))) + '</td><td class="num">' + esc(D.money(ded)) + '</td><td class="num"><b>' + esc(D.money(D.recNet(r))) + '</b></td><td>' + sel + '</td>' +
        '<td><div class="cp-actions"><button type="button" class="cp-act" title="Voir" aria-label="Voir le bulletin de ' + esc(r.name) + '" data-act="view" data-i="' + r._index + '">' + icon('eye') + '</button><button type="button" class="cp-act" title="Télécharger (Excel)" aria-label="Télécharger le bulletin de ' + esc(r.name) + '" data-act="download" data-i="' + r._index + '">' + icon('download') + '</button><button type="button" class="cp-act" title="Imprimer" aria-label="Imprimer le bulletin de ' + esc(r.name) + '" data-act="print" data-i="' + r._index + '">' + icon('printer') + '</button></div></td></tr>';
    }).join('');
    return '<div class="ws-page-head"><div><h1>Bulletins de paie</h1><p>' + recs.length + ' bulletin' + (recs.length > 1 ? 's' : '') + ' enregistré' + (recs.length > 1 ? 's' : '') + ' · ' + rows.length + ' affiché' + (rows.length > 1 ? 's' : '') + '</p></div><div class="ws-tools">' +
      '<div class="ws-field"><label for="wsFP">Période</label><select id="wsFP"><option value="">Toutes</option>' + periods.map((p) => '<option value="' + p + '"' + (p === st.fPeriod ? ' selected' : '') + '>' + esc(D.monthLabel(p)) + '</option>').join('') + '</select></div>' +
      '<div class="ws-field"><label for="wsFS">Statut</label><select id="wsFS"><option value="">Tous</option>' + [...D.STATUSES, 'Erreur'].map((s) => '<option' + (s === st.fStatus ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
      '<button type="button" class="cp-btn" data-act="export-report">' + icon('download') + 'Télécharger la liste (CSV)</button><button type="button" class="cp-btn primary" data-act="new-payslip">' + icon('plus') + 'Créer un bulletin</button></div></div>' +
      '<article class="cp-card">' + (rows.length ? '<div class="cp-table-wrap"><table class="cp-table" style="min-width:760px"><thead><tr><th>Employé</th><th>Période</th><th class="num">Brut</th><th class="num">Retenues</th><th class="num">Net à payer</th><th>Statut</th><th>Actions</th></tr></thead><tbody>' + body + '</tbody></table></div>' : '<div class="cp-empty"><b>' + (recs.length ? 'Aucun bulletin pour ce filtre' : 'Aucun bulletin enregistré') + '</b><span>' + (recs.length ? 'Changez la période ou le statut.' : 'Préparez un bulletin puis enregistrez-le dans le dossier.') + '</span></div>') + '</article>';
  }

  /* ───────── Rubrique : déclarations sociales ───────── */
  function declarationsHTML(c, m) {
    const tabs = '<div class="cp-chip-group" role="group" aria-label="Déclarations">' + [['deadlines', 'Échéances'], ['social', 'Charges sociales'], ['taxes', 'Charges fiscales']].map(([k, l]) => chip(l, st.decl === k, 'data-decl="' + k + '"')).join('') + '</div>';
    let body = '';
    if (st.decl === 'deadlines') {
      const n = m.employeeCount, mode = n >= 20 ? 'mensuel' : 'trimestriel';
      body = '<article class="cp-card"><div class="cp-card-head"><div><h2>Échéances à venir</h2><p class="cp-sub">' + n + ' salarié' + (n > 1 ? 's' : '') + ' : IPRES et CSS en versement <b>' + mode + '</b> (CSS art. 93) · impôts : ' + ((S.taxRemittance === 'quarterly') ? 'trimestriel' : 'mensuel') + ' (CGI art. 185). Modifiable dans Paramètres de paie.</p></div></div>' +
        (m.deadlines.length ? m.deadlines.map((d) => '<div class="ws-deadline"><div><b>' + esc(d.label) + ' · ' + esc(d.desc) + '</b><span>' + (d.mode === 'quarterly' ? 'Trimestre ' : '') + esc(d.periodLabel) + ' · à régler avant le ' + esc(frDate(d.due)) + '</span></div><span class="cp-badge ' + (d.level === 'ok' ? 'success' : d.level === 'soon' ? 'warning' : 'danger') + '">' + (d.days < 0 ? 'Retard ' + Math.abs(d.days) + ' j' : d.days + ' j') + '</span><button type="button" class="cp-btn sm" data-act="done" data-key="' + esc(d.key) + '" data-period="' + esc(d.period) + '" data-mode="' + esc(d.mode) + '">Marquer fait</button></div>').join('') : '<div class="cp-empty"><b>Aucune échéance en attente</b><span>Les échéances apparaissent dès que des bulletins sont enregistrés et disparaissent une fois marquées comme faites.</span></div>') + '</article>';
    } else {
      const k = folderTotals(c), n = k.h.length, cov = k.metricsCoverage || {};
      const metric = (l, v) => '<div class="ws-metric"><span>' + esc(l) + '</span><b>' + esc(cur(folderMoney(v))) + '</b></div>';
      if (st.decl === 'social') body = '<article class="cp-card"><div class="cp-card-head"><div><h2>Charges sociales cumulées</h2><p class="cp-sub">Cotisations IPRES et CSS portées par les bulletins enregistrés (' + (cov.ipres || 0) + '/' + n + ' bulletin' + (n > 1 ? 's' : '') + ' avec détail).</p></div></div><div class="ws-cards3">' + metric('IPRES · part salariale', k.ipresE) + metric('IPRES · part patronale', k.ipresP) + metric('CSS · part patronale', k.cssP) + '</div></article>';
      else body = '<article class="cp-card"><div class="cp-card-head"><div><h2>Charges fiscales cumulées</h2><p class="cp-sub">Impôt sur le revenu et TRIMF retenus sur les bulletins enregistrés (' + (cov.tax || 0) + '/' + n + ' avec détail).</p></div></div><div class="ws-cards3">' + metric('Impôt sur le revenu', k.ir) + metric('TRIMF', k.trimf) + metric('Total retenu', k.taxes) + '</div></article>';
      body += '<p class="cp-sub">Les anciens bulletins sans détail de charges ne sont pas estimés : recalculez-les depuis Archives (« Recalculer les bulletins archivés »).</p>';
    }
    return '<div class="ws-page-head"><div><h1>Déclarations sociales</h1><p>Échéances légales et charges portées par les bulletins de ' + esc(c.name) + '</p></div><div class="ws-tools">' + tabs + '</div></div>' + body;
  }

  /* ───────── Rubrique : documents ───────── */
  function documentsHTML(c) {
    const t = [['export-employees', 'users', 'Liste des salariés (CSV)', 'Nom, matricule, téléphone et emploi'], ['export-report', 'file', 'Liste des bulletins (CSV)', 'Net, masse brute, charges fiscales et sociales'], ['backup', 'download', 'Sauvegarde complète (JSON)', 'Toutes les entreprises, paramètres et bulletins'], ['import-backup', 'upload', 'Importer une sauvegarde', 'Restaure un fichier de sauvegarde JSON'], ['view:history', 'archive', 'Archives des bulletins', 'Consulter, recalculer ou supprimer des bulletins']];
    return '<div class="ws-page-head"><div><h1>Documents</h1><p>Exports et archives du dossier ' + esc(c.name) + '</p></div></div><div class="ws-cards3">' + t.map(([a, i, l, d]) => '<button type="button" class="cp-card ws-doc" data-act="' + a + '"><span class="ico">' + icon(i) + '</span><div><b>' + esc(l) + '</b><span>' + esc(d) + '</span></div></button>').join('') + '</div>';
  }

  /* ───────── Rubrique : paramètres du dossier ───────── */
  function settingsHTML(c, m) {
    const k = folderTotals(c);
    return '<div class="ws-page-head"><div><h1>Informations de l’entreprise</h1><p>Dossier de paie · ' + m.employeeCount + ' salarié' + (m.employeeCount > 1 ? 's' : '') + ' · ' + k.h.length + ' bulletin' + (k.h.length > 1 ? 's' : '') + '</p></div></div>' +
      '<article class="cp-card ws-form"><h2>Nom de l’employeur sur le bulletin</h2><div class="row"><div class="ws-field"><label for="wsEmployer">Nom légal de l’employeur</label><input id="wsEmployer" value="' + esc(c.employer || '') + '" placeholder="Entreprise SARL"></div><button type="button" class="cp-btn primary" data-act="ws-save-employer">Enregistrer</button></div><p class="cp-sub">Ce nom figure sur les bulletins et les exports de ce dossier.</p></article>' +
      '<article class="cp-card ws-form ws-danger"><h2>Supprimer ce dossier</h2><p class="cp-sub">Le dossier, ses ' + m.employeeCount + ' salarié(s) et tous ses bulletins seront supprimés définitivement. Une confirmation vous sera demandée.</p><div class="row"><button type="button" class="cp-btn" style="color:#b3261e;border-color:#f3b6b0" data-act="ws-delete">Supprimer le dossier…</button></div></article>';
  }

  /* ───────── Rendu ───────── */
  function render() {
    if (!st.open) return;
    const c = company();
    if (!c) { close({ returning: false }); if (window.CorintaShell) window.CorintaShell.go('companies'); else activateView('companies'); return; }
    try {
      const recs = allRecords().filter((r) => r.companyId === c.id), m = modelFor(c, recs), mod = st.module;
      const html = mod === 'employees' ? employeesHTML(c, recs) : mod === 'payslips' ? payslipsHTML(c, recs) : mod === 'declarations' ? declarationsHTML(c, m) : mod === 'documents' ? documentsHTML(c) : mod === 'settings' ? settingsHTML(c, m) : dashboardHTML(m, c);
      const box = $('wsContent'), scroll = box.scrollTop, focusId = document.activeElement && document.activeElement.id;
      box.innerHTML = html;
      if (mod === st.lastModule) box.scrollTop = scroll;
      st.lastModule = mod;
      if (focusId && $(focusId) && /^(wsQ)$/.test(focusId)) { const f = $(focusId); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
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
    st.companyId = id; st.module = MODULE_OF[key] || 'dashboard'; if (DECL_OF[key]) st.decl = DECL_OF[key];
    if (prevCompany !== id) { st.period = ''; st.q = ''; st.fPeriod = ''; st.fStatus = ''; }
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
  function go(mod) { st.module = MODULE_OF[mod] || mod; if (DECL_OF[mod]) st.decl = DECL_OF[mod]; render(); $('wsContent').scrollTop = 0; }
  function handleAct(a, el) {
    if (a === 'ws-exit') { if (window.CorintaShell) window.CorintaShell.go('companies'); return; }
    if (a === 'ws-general') { if (window.CorintaShell) window.CorintaShell.go('dashboard'); return; }
    if (a.indexOf('module:') === 0) { go(a.slice(7)); return; }
    if (a.indexOf('panel:') === 0) { go(a.slice(6)); return; }
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
    UI.act(a, el);
  }
  function bind() {
    const root = $('ws');
    root.addEventListener('click', (e) => {
      const mbtn = e.target.closest('[data-m]'); if (mbtn) { $('wsMenu').classList.add('hidden'); go(mbtn.dataset.m); return; }
      const me = e.target.closest('[data-metric]'); if (me) { st.metric = me.dataset.metric; render(); return; }
      const ra = e.target.closest('[data-range]'); if (ra) { st.range = ra.dataset.range; if (st.range === 'custom' && !st.from) { const p = PERIOD_RE.test(st.period) ? st.period : latest(allRecords().filter((r) => r.companyId === st.companyId)); st.to = p; st.from = D.addMonths(p, -5); } render(); return; }
      const dc = e.target.closest('[data-decl]'); if (dc) { st.decl = dc.dataset.decl; render(); return; }
      const sr = e.target.closest('[data-sr]'); if (sr) { $('wsSearch').value = ''; search(); if (sr.dataset.sr === 'emp') UI.act('employee', { dataset: { id: sr.dataset.id } }); else UI.act('view', { dataset: { i: sr.dataset.id } }); return; }
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
      if (t.id === 'wsFP') { st.fPeriod = t.value; render(); return; }
      if (t.id === 'wsFS') { st.fStatus = t.value; render(); }
    });
    root.addEventListener('input', (e) => { if (e.target.id === 'wsQ') { st.q = e.target.value; render(); } if (e.target.id === 'wsSearch') search(); });
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
