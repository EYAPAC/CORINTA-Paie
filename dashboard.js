/*
 * CORINTA Paie — tableau de bord de l'entreprise active.
 *
 * Règle absolue : AUCUNE donnée inventée. Tous les indicateurs sont calculés à partir des
 * bulletins archivés (paieHistory) et des salariés du dossier (paieCompanies). Sans donnée,
 * les composants affichent un état vide explicite.
 *
 * Deux couches :
 *   1. buildModel()  — calculs purs (testés dans tests/dashboard.test.mjs) ;
 *   2. render*()     — HTML/SVG à partir du modèle (aucun accès au DOM global ici).
 */
(function (root) {
  'use strict';

  /* ───────── Constantes ───────── */
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const STATUSES = ['Brouillon', 'À valider', 'Validé', 'Payé'];
  const DEFAULT_STATUS = 'À valider';
  const STATUS_TONE = { 'Brouillon': 'neutral', 'À valider': 'warning', 'Validé': 'info', 'Payé': 'success', 'Erreur': 'danger', 'Sans bulletin': 'neutral' };
  const STATUS_ORDER = { 'Payé': 0, 'Validé': 1, 'À valider': 2, 'Brouillon': 3, 'Erreur': 4, 'Sans bulletin': 5 };
  /* Échéances : jour du mois SUIVANT la période. Repères indicatifs, modifiables dans Paramétrage. */
  const OBLIGATIONS = [
    { key: 'ipres', label: 'IPRES', desc: 'Cotisations retraite', panel: 'social', day: 15 },
    { key: 'css', label: 'CSS', desc: 'Cotisations sécurité sociale', panel: 'social', day: 15 },
    { key: 'impots', label: 'Impôts', desc: 'Retenues IR et TRIMF', panel: 'taxes', day: 15 }
  ];
  const SERIES = {
    gross: { label: 'Masse salariale brute', short: 'Brute', field: 'grossAll' },
    net: { label: 'Masse salariale nette', short: 'Nette', field: 'net' },
    employer: { label: 'Charges patronales', short: 'Charges patronales', field: 'employerCharges' },
    cost: { label: 'Coût total employeur', short: 'Coût total', field: 'employerCost' }
  };

  /* ───────── Utilitaires ───────── */
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const has = (o, k) => o && o[k] !== undefined && o[k] !== null && o[k] !== '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const nbsp = (s) => s.replace(/[  ]/g, ' ');
  const money = (v) => nbsp(nf.format(Math.round(num(v)))) + ' FCFA';
  function compact(v) {
    const n = Math.abs(num(v)), sign = num(v) < 0 ? '-' : '';
    const f = (x, u) => sign + nbsp(x.toLocaleString('fr-FR', { maximumFractionDigits: 2 })) + ' ' + u;
    if (n >= 1e9) return f(n / 1e9, 'Md');
    if (n >= 1e6) return f(n / 1e6, 'M');
    if (n >= 1e3) return f(n / 1e3, 'k');
    return sign + String(Math.round(n));
  }
  const pct = (v) => nbsp(Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 1 })) + ' %';

  function parsePeriod(p) { const m = /^([0-9]{4})-([0-9]{2})$/.exec(String(p || '')); return m ? { y: +m[1], m: +m[2] } : null; }
  function addMonths(p, n) { const q = parsePeriod(p); if (!q) return ''; const t = q.y * 12 + (q.m - 1) + n; return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0'); }
  function monthLabel(p) { const q = parsePeriod(p); return q ? MONTHS[q.m - 1][0].toUpperCase() + MONTHS[q.m - 1].slice(1) + ' ' + q.y : '—'; }
  function monthShort(p) { const q = parsePeriod(p); return q ? MONTHS_SHORT[q.m - 1] + ' ' + String(q.y).slice(2) : '—'; }
  function monthsBetween(a, b) { const x = parsePeriod(a), y = parsePeriod(b); return x && y ? (y.y - x.y) * 12 + (y.m - x.m) : 0; }
  function dayDiff(fromISO, toISO) { const f = fromISO.split('-').map(Number), t = toISO.split('-').map(Number); return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(f[0], f[1] - 1, f[2])) / 86400000); }
  function dueDate(period, day) {
    const q = parsePeriod(period); if (!q) return '';
    const last = new Date(Date.UTC(q.y, q.m + 1, 0)).getUTCDate(); // dernier jour du mois suivant
    const d = Math.min(Math.max(1, Math.round(num(day)) || 15), last), t = q.y * 12 + q.m; // q.m = index (0-based) du mois suivant
    return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  const frDate = (iso) => { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; };
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

  /* Données d'un bulletin archivé (compatibles avec les anciens enregistrements). */
  const tot = (r, k) => (r && r.totals && has(r.totals, k) ? num(r.totals[k]) : null);
  function recNet(r) { const t = tot(r, 'net'); if (t !== null) return t; const d = String((r && r.net) || '').replace(/[^0-9-]/g, ''); return d ? Number(d) : 0; }
  function recGross(r) { const g = tot(r, 'grossAll'); if (g !== null) return g; const a = tot(r, 'grossFiscal'), b = tot(r, 'grossNonTaxable'); return a !== null || b !== null ? num(a) + num(b) : 0; }
  function recDeductions(r) { const d = tot(r, 'totalDeductions'); return d !== null ? d : Math.max(0, recGross(r) - recNet(r)); }
  const recStatusRaw = (r) => (STATUSES.includes(r && r.status) ? r.status : DEFAULT_STATUS);
  const recIsError = (r) => recGross(r) <= 0 || recNet(r) <= 0;
  const recStatus = (r) => (recIsError(r) ? 'Erreur' : recStatusRaw(r));
  const empKey = (r) => String((r && (r.employeeId || (r.fields && r.fields.mat) || r.name)) || '');

  /* ───────── 1. Modèle ───────── */
  const DIST_DEFS = [
    { key: 'net', label: 'Net versé aux salariés', color: 'var(--cp-s1)' },
    { key: 'impots', label: 'Impôts (IR et TRIMF)', color: 'var(--cp-s3)' },
    { key: 'ipres', label: 'IPRES (retraite)', color: 'var(--cp-s4)' },
    { key: 'css', label: 'CSS (sécurité sociale)', color: 'var(--cp-s2)' },
    { key: 'autresPatronales', label: 'Autres charges patronales', color: 'var(--cp-s5)' },
    { key: 'autresRetenues', label: 'Autres retenues salariales', color: 'var(--cp-s6)' }
  ];
  /** Parts brutes → tranches du disque (valeurs nulles écartées, pourcentages calculés). */
  function distributionFrom(parts) {
    const distribution = DIST_DEFS.map((d) => ({ key: d.key, label: d.label, color: d.color, value: num(parts[d.key]) })).filter((x) => x.value > 0);
    const distTotal = distribution.reduce((t, x) => t + x.value, 0);
    distribution.forEach((x) => { x.pct = distTotal ? (x.value / distTotal) * 100 : 0; });
    return { distribution, distTotal };
  }

  function buildModel(inp) {
    const company = inp.company || { id: '', name: '', employees: [] };
    const records = (inp.records || []).filter((r) => r && r.companyId === company.id);
    const period = parsePeriod(inp.period) ? inp.period : (inp.today || '').slice(0, 7);
    const today = inp.today || new Date().toISOString().slice(0, 10);
    const obligationsDone = company.obligations || {};
    const days = inp.deadlineDays || {};
    const metric = SERIES[inp.metric] ? inp.metric : 'gross';

    const inPeriod = records.filter((r) => r.period === period);
    const prevPeriod = addMonths(period, -1), prevRecords = records.filter((r) => r.period === prevPeriod);

    /* effectif */
    const ids = new Set((company.employees || []).map((e) => e.id));
    const knownKeys = new Set();
    (company.employees || []).forEach((e) => { knownKeys.add(String(e.id)); if (e.mat) knownKeys.add(String(e.mat)); if (e.name) knownKeys.add(String(e.name)); });
    records.forEach((r) => { const k = empKey(r); if (k && !knownKeys.has(k)) { ids.add(k); knownKeys.add(k); } });
    const employeeCount = ids.size;

    /* masse salariale du mois */
    const sum = (list, f) => list.reduce((t, r) => t + f(r), 0);
    const gross = sum(inPeriod, recGross), prevGross = sum(prevRecords, recGross);
    const grossDelta = prevRecords.length && prevGross > 0 ? ((gross - prevGross) / prevGross) * 100 : null;

    /* bulletins du mois */
    const statusCount = { 'Brouillon': 0, 'À valider': 0, 'Validé': 0, 'Payé': 0, 'Erreur': 0 };
    inPeriod.forEach((r) => { statusCount[recStatus(r)]++; });
    const withPayslip = new Set(inPeriod.map(empKey));
    const missing = (company.employees || []).filter((e) => !withPayslip.has(String(e.id)) && !withPayslip.has(String(e.mat || '')) && !withPayslip.has(String(e.name || '')));

    /* échéances (uniquement pour les périodes réellement traitées) */
    const deadlines = [];
    [prevPeriod, period].forEach((p) => {
      if (!records.some((r) => r.period === p)) return;
      if (monthsBetween(p, today.slice(0, 7)) > 1) return; // périodes plus anciennes : supposées réglées, pas d'alerte permanente
      OBLIGATIONS.forEach((o) => {
        if (obligationsDone[p] && obligationsDone[p][o.key]) return;
        const due = dueDate(p, days[o.key] != null ? days[o.key] : o.day), left = dayDiff(today, due);
        deadlines.push({ key: o.key, label: o.label, desc: o.desc, panel: o.panel, period: p, due, days: left, level: left < 0 ? 'late' : left <= 3 ? 'urgent' : left <= 10 ? 'soon' : 'ok' });
      });
    });
    deadlines.sort((a, b) => a.due.localeCompare(b.due) || a.key.localeCompare(b.key));

    /* série temporelle */
    const rg = inp.range || { kind: '6' };
    let from, to = period;
    if (rg.kind === 'custom' && parsePeriod(rg.from) && parsePeriod(rg.to)) { from = rg.from; to = rg.to; if (monthsBetween(from, to) < 0) { const t = from; from = to; to = t; } if (monthsBetween(from, to) > 35) from = addMonths(to, -35); }
    else from = addMonths(period, rg.kind === '12' ? -11 : -5);
    const months = [];
    for (let p = from; monthsBetween(p, to) >= 0; p = addMonths(p, 1)) months.push(p);
    const field = SERIES[metric].field;
    let partial = false;
    const points = months.map((p) => {
      const list = records.filter((r) => r.period === p);
      if (!list.length) return { period: p, value: null, count: 0 };
      let v = 0, known = 0;
      list.forEach((r) => {
        const x = field === 'grossAll' ? recGross(r) : field === 'net' ? recNet(r) : tot(r, field);
        if (x !== null) { v += x; known++; }
      });
      if (known < list.length) partial = true;
      return { period: p, value: known ? v : null, count: list.length };
    });

    /* répartition du coût employeur du mois */
    const parts = { net: 0, impots: 0, ipres: 0, css: 0, autresPatronales: 0, autresRetenues: 0 };
    let covered = 0;
    inPeriod.forEach((r) => {
      const t = r.totals || {};
      if (!has(t, 'net') || !has(t, 'totalDeductions') || !has(t, 'employerCharges')) return;
      covered++;
      const ir = num(t.irAmount), trimf = num(t.trimfAmount), ipE = num(t.ipresEmployee), ipP = num(t.ipresEmployer), cE = num(t.cssEmployee), cP = num(t.cssEmployer);
      parts.net += num(t.net);
      parts.impots += ir + trimf;
      parts.ipres += ipE + ipP;
      parts.css += cE + cP;
      parts.autresPatronales += Math.max(0, num(t.employerCharges) - ipP - cP);
      parts.autresRetenues += Math.max(0, num(t.totalDeductions) - ir - trimf - ipE - cE);
    });
    const { distribution, distTotal } = distributionFrom(parts);

    /* liste des salariés : un salarié = une ligne, avec son bulletin de la période (s'il existe).
       Classement : statut (Payé, Validé, À valider, Brouillon, Erreur), puis sans bulletin, puis nom. */
    const matches = (r, e) => String(r.employeeId || '') === String(e.id) || (e.mat && String((r.fields && r.fields.mat) || '') === String(e.mat)) || (!!r.name && r.name === e.name);
    const people = (company.employees || []).map((e) => ({ id: e.id, name: e.name || '—', job: e.job || (e.fields && e.fields.job) || '', mat: e.mat || (e.fields && e.fields.mat) || '', test: (r) => matches(r, e) }));
    inPeriod.forEach((r) => { if (!people.some((p) => p.test(r))) people.push({ id: '', name: r.name || '—', job: (r.fields && r.fields.job) || '', mat: (r.fields && r.fields.mat) || '', test: (x) => empKey(x) === empKey(r) }); });
    const employeeRows = people.map((p) => {
      // identifiant exact d'abord, puis matricule/nom ; un seul bulletin par salarié et par période (l'enregistrement remplace)
      const r = inPeriod.find((x) => p.id !== '' && String(x.employeeId || '') === String(p.id)) || inPeriod.find(p.test);
      if (!r) return { id: p.id, name: p.name, job: p.job, mat: p.mat, hasPayslip: false, period, net: null, status: 'Sans bulletin', record: null, editable: false };
      return { id: p.id, name: p.name, job: p.job || (r.fields && r.fields.job) || '', mat: p.mat, hasPayslip: true, period: r.period, net: recNet(r), status: recStatus(r), record: r, editable: !recIsError(r) };
    }).sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    const paidEmployees = withPayslip.size, prevPaidEmployees = new Set(prevRecords.map(empKey)).size;

    /* informations manquantes sur les salariés */
    const incomplete = [];
    (company.employees || []).forEach((e) => {
      const f = e.fields || [], lack = [];
      if (!has(f, 'hire')) lack.push('date d’embauche');
      if (!has(f, 'categoryMonthly') && !has(f, 'base')) lack.push('salaire de base');
      if (!(e.mat || has(f, 'mat'))) lack.push('matricule');
      if (lack.length) incomplete.push({ id: e.id, name: e.name || '—', lack });
    });

    /* cycle de paie */
    const cnt = inPeriod.length, errors = statusCount['Erreur'];
    const validated = statusCount['Validé'] + statusCount['Payé'], paid = statusCount['Payé'];
    const declDone = OBLIGATIONS.every((o) => obligationsDone[period] && obligationsDone[period][o.key]);
    const prepared = employeeCount > 0 && cnt >= employeeCount;
    const raw = [
      { id: 'collect', label: 'Collecte des données', done: employeeCount > 0, detail: employeeCount ? employeeCount + ' salarié' + (employeeCount > 1 ? 's' : '') : 'Aucun salarié', action: 'panel:employees' },
      { id: 'prepare', label: 'Préparation et calcul', done: prepared, detail: cnt + ' / ' + employeeCount + ' bulletin' + (cnt > 1 ? 's' : ''), action: 'new-payslip' },
      { id: 'control', label: 'Contrôle', done: prepared && errors === 0, blocked: errors > 0, detail: errors ? errors + ' en erreur' : 'Aucune anomalie', action: 'panel:payslips' },
      { id: 'validate', label: 'Validation', done: cnt > 0 && validated === cnt, detail: validated + ' / ' + cnt + ' validés', action: 'panel:payslips' },
      { id: 'declare', label: 'Déclarations', done: cnt > 0 && declDone, detail: cnt ? 'IPRES · CSS · Impôts' : '—', action: 'panel:social' },
      { id: 'pay', label: 'Paiement', done: cnt > 0 && paid === cnt, detail: paid + ' / ' + cnt + ' payés', action: 'panel:payslips' }
    ];
    let currentFound = false;
    const cycle = raw.map((s) => {
      let state = 'pending';
      if (s.done) state = 'done';
      else if (!currentFound) { state = s.blocked ? 'blocked' : 'current'; currentFound = true; }
      return { id: s.id, label: s.label, state, detail: s.detail, action: s.action };
    });

    /* informations importantes */
    const alerts = [];
    deadlines.filter((d) => d.level !== 'ok').forEach((d) => {
      const when = d.days < 0 ? 'en retard de ' + Math.abs(d.days) + ' jour' + (Math.abs(d.days) > 1 ? 's' : '') : d.days === 0 ? 'aujourd’hui' : 'avant le ' + frDate(d.due) + ' (' + d.days + ' j)';
      alerts.push({ level: d.level === 'late' || d.level === 'urgent' ? 'danger' : 'warn', text: d.label + ' : ' + d.desc.toLowerCase() + ' de ' + monthLabel(d.period) + ' à régler ' + when, action: 'panel:' + d.panel, done: { key: d.key, period: d.period } });
    });
    if (errors) alerts.push({ level: 'danger', text: errors + ' bulletin' + (errors > 1 ? 's' : '') + ' en erreur en ' + monthLabel(period) + ' (net ou brut nul)', action: 'panel:payslips' });
    if (missing.length && employeeCount) alerts.push({ level: 'warn', text: missing.length + ' salarié' + (missing.length > 1 ? 's' : '') + ' sans bulletin en ' + monthLabel(period) + ' : ' + missing.slice(0, 3).map((e) => e.name).join(', ') + (missing.length > 3 ? '…' : ''), action: 'panel:employees' });
    if (incomplete.length) alerts.push({ level: 'warn', text: incomplete.length + ' salarié' + (incomplete.length > 1 ? 's' : '') + ' avec information manquante (' + incomplete.slice(0, 2).map((e) => e.name + ' : ' + e.lack.join(', ')).join(' ; ') + (incomplete.length > 2 ? '…' : '') + ')', action: 'panel:employees' });
    if (statusCount['À valider']) alerts.push({ level: 'info', text: statusCount['À valider'] + ' bulletin' + (statusCount['À valider'] > 1 ? 's' : '') + ' à valider en ' + monthLabel(period), action: 'panel:payslips' });

    return {
      company: { id: company.id, name: company.name || company.employer || '' }, period, today, metric, rangeKind: rg.kind || '6', rangeFrom: from, rangeTo: to,
      employeeCount, employeesWithPayslip: withPayslip.size, gross, prevGross, grossDelta, hasPrev: prevRecords.length > 0,
      bulletins: { count: cnt, expected: employeeCount, status: statusCount }, deadlines, nextDeadline: deadlines[0] || null,
      series: { points, partial, label: SERIES[metric].label }, distribution, distTotal, distCoverage: { covered, total: cnt },
      employeeRows, paidEmployees, prevPaidEmployees, prevCount: prevRecords.length, parts, incomplete, missing: missing.map((e) => e.name), cycle, alerts, hasAnyRecord: records.length > 0, hasPeriodRecord: cnt > 0
    };
  }

  /* Tableau de bord GÉNÉRAL : agrège les modèles de toutes les entreprises (aucun calcul propre,
     donc les totaux sont toujours la somme exacte des tableaux de bord de chaque dossier). */
  function buildGlobalModel(inp) {
    const companies = inp.companies || [];
    const models = companies.map((c) => buildModel(Object.assign({}, inp, { company: c })));
    const first = models[0];
    const period = first ? first.period : (parsePeriod(inp.period) ? inp.period : (inp.today || '').slice(0, 7));
    const sum = (f) => models.reduce((t, m) => t + f(m), 0);
    const gross = sum((m) => m.gross), prevGross = sum((m) => m.prevGross), hasPrev = models.some((m) => m.hasPrev);
    const status = { 'Brouillon': 0, 'À valider': 0, 'Validé': 0, 'Payé': 0, 'Erreur': 0 };
    models.forEach((m) => Object.keys(status).forEach((k) => { status[k] += m.bulletins.status[k]; }));

    const points = first ? first.series.points.map((p, i) => {
      const vals = models.map((m) => m.series.points[i]).filter((q) => q.value !== null);
      return { period: p.period, value: vals.length ? vals.reduce((t, q) => t + q.value, 0) : null, count: models.reduce((t, m) => t + m.series.points[i].count, 0) };
    }) : [];
    const parts = {};
    DIST_DEFS.forEach((d) => { parts[d.key] = sum((m) => num(m.parts[d.key])); });
    const dist = distributionFrom(parts);

    const alerts = [];
    models.forEach((m) => m.alerts.forEach((a) => alerts.push(Object.assign({}, a, { companyId: m.company.id, company: m.company.name, text: m.company.name + ' · ' + a.text }))));
    const LV = { danger: 0, warn: 1, info: 2 };
    alerts.sort((a, b) => LV[a.level] - LV[b.level] || a.company.localeCompare(b.company, 'fr'));

    const rows = models.map((m) => {
      const cycleStates = m.cycle.map((s) => s.state);
      const state = !m.hasPeriodRecord ? { label: 'Non démarré', tone: 'neutral' } : cycleStates.includes('blocked') ? { label: 'Bloqué', tone: 'danger' } : cycleStates.every((s) => s === 'done') ? { label: 'Terminé', tone: 'success' } : { label: 'En cours', tone: 'warning' };
      return { id: m.company.id, name: m.company.name, employeeCount: m.employeeCount, gross: m.gross, hasPeriodRecord: m.hasPeriodRecord, count: m.bulletins.count, expected: m.bulletins.expected, state, nextDeadline: m.nextDeadline, alertCount: m.alerts.filter((a) => a.level !== 'info').length };
    }).sort((a, b) => b.alertCount - a.alertCount || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

    const next = models.map((m) => m.nextDeadline).filter(Boolean).sort((a, b) => a.due.localeCompare(b.due))[0] || null;
    return {
      period, today: first ? first.today : inp.today, metric: first ? first.metric : 'gross', rangeFrom: first ? first.rangeFrom : '', rangeTo: first ? first.rangeTo : '',
      companyCount: companies.length, employeeCount: sum((m) => m.employeeCount), employeesWithPayslip: sum((m) => m.employeesWithPayslip), gross, prevGross, hasPrev,
      grossDelta: hasPrev && prevGross > 0 ? ((gross - prevGross) / prevGross) * 100 : null,
      bulletins: { count: sum((m) => m.bulletins.count), expected: sum((m) => m.bulletins.expected), status }, prevCount: sum((m) => m.prevCount),
      paidEmployees: sum((m) => m.paidEmployees), prevPaidEmployees: sum((m) => m.prevPaidEmployees),
      nextDeadline: next, series: { points, partial: models.some((m) => m.series.partial), label: first ? first.series.label : '' },
      distribution: dist.distribution, distTotal: dist.distTotal, distCoverage: { covered: sum((m) => m.distCoverage.covered), total: sum((m) => m.distCoverage.total) },
      rows, alerts, hasAnyRecord: models.some((m) => m.hasAnyRecord), hasPeriodRecord: models.some((m) => m.hasPeriodRecord), cycle: []
    };
  }

  /* ───────── 2. Icônes ───────── */
  const ICONS = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.2c2.6.3 4.5 2.6 4.5 5.3"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/>',
    file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10h14V9"/><path d="M10 13h4"/>',
    building: '<path d="M4 21V5l8-2 8 2v16"/><path d="M9 21v-5h6v5"/><path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 20h14"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
    printer: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2h.01"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V5"/><path d="m7.5 9 4.5-4.5L16.5 9"/><path d="M5 20h14"/>',
    chart: '<path d="M4 20V5"/><path d="M4 20h16"/><path d="m7 15 4-5 3 3 5-6"/>',
    building2: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    file2: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>'
  };
  const icon = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';

  /* ───────── 3. Rendu ───────── */
  const badge = (status) => '<span class="cp-badge ' + (STATUS_TONE[status] || 'neutral') + '">' + esc(status) + '</span>';
  const empty = (title, text) => '<div class="cp-empty"><b>' + esc(title) + '</b><span>' + esc(text) + '</span></div>';

  /* Flèche + variation « par rapport au mois dernier » (style de la maquette). */
  function trend(diff, unit, hasPrev) {
    if (!hasPrev) return '<span>Aucun bulletin le mois précédent</span>';
    if (Math.abs(diff) < 0.05) return '<span class="cp-delta">= Stable</span><span>par rapport au mois dernier</span>';
    const up = diff > 0, v = unit === '%' ? pct(Math.abs(diff)) : String(Math.abs(Math.round(diff)));
    return '<span class="cp-delta ' + (up ? 'up' : 'down') + '">' + (up ? '↑ +' : '↓ −') + v + '</span><span>par rapport au mois dernier</span>';
  }
  const statusLine = (b) => b.count ? ['Payé', 'Validé', 'À valider', 'Brouillon', 'Erreur'].filter((k) => b.status[k]).map((k) => '<span class="cp-badge ' + STATUS_TONE[k] + '">' + b.status[k] + ' ' + esc(k.toLowerCase()) + '</span>').join('') : '';
  const kpiCard = (tone, ico, label, value, foot, extra) => '<article class="cp-card cp-kpi cp-tone-' + tone + (extra || '') + '"><div class="cp-kpi-top"><span class="cp-kpi-ico">' + icon(ico) + '</span><span class="cp-kpi-label">' + esc(label) + '</span></div><div class="cp-kpi-value">' + value + '</div><div class="cp-kpi-foot">' + foot + '</div></article>';
  const grossValue = (m) => (m.hasPeriodRecord ? nbsp(nf.format(Math.round(m.gross))) + ' <small>FCFA</small>' : '—');
  const grossFoot = (m) => (m.hasPeriodRecord ? trend(m.grossDelta === null ? 0 : m.grossDelta, '%', m.grossDelta !== null) : '<span>Aucune donnée en ' + esc(monthLabel(m.period)) + '</span>');
  const bulletinValue = (b) => b.count + (b.expected ? ' <small>/ ' + b.expected + ' salariés</small>' : '');

  /** KPI d'un dossier d'entreprise. */
  function renderKpis(m) {
    const b = m.bulletins, nd = m.nextDeadline;
    const ndTone = nd ? { late: 'red', urgent: 'red', soon: 'amber', ok: 'green' }[nd.level] : 'amber';
    const empFoot = !m.employeeCount ? '<span>Aucun salarié dans ce dossier</span>' : m.prevPaidEmployees ? trend(m.paidEmployees - m.prevPaidEmployees, '#', true).replace('par rapport au mois dernier', 'salariés payés vs mois dernier') : '<span>' + m.paidEmployees + ' payé' + (m.paidEmployees > 1 ? 's' : '') + ' en ' + esc(monthLabel(m.period)) + '</span>';
    const bulFoot = (m.prevCount ? trend(b.count - m.prevCount, '#', true) : (b.count ? '<span>Aucun bulletin le mois précédent</span>' : '<span>Aucun bulletin enregistré pour cette période</span>')) + (b.count ? '<div class="cp-kpi-badges">' + statusLine(b) + '</div>' : '');
    const ndFoot = nd ? '<span><b>' + esc(nd.label) + '</b> · ' + esc(nd.desc) + ' · ' + frDate(nd.due) + '</span><span class="cp-badge ' + (nd.level === 'ok' ? 'success' : nd.level === 'soon' ? 'warning' : 'danger') + '">' + (nd.level === 'late' ? 'En retard' : nd.level === 'urgent' ? 'Urgent' : nd.level === 'soon' ? 'Bientôt' : 'À venir') + '</span>' : '<span>Aucune échéance : enregistrez les bulletins de la période</span>';
    const ndVal = nd ? (nd.days < 0 ? Math.abs(nd.days) + ' <small>jour' + (Math.abs(nd.days) > 1 ? 's' : '') + ' de retard</small>' : nd.days + ' <small>jour' + (nd.days > 1 ? 's' : '') + '</small>') : '—';
    return kpiCard('blue', 'users', 'Total des salariés', String(m.employeeCount), empFoot) +
      kpiCard('green', 'wallet', 'Masse salariale brute', grossValue(m), grossFoot(m)) +
      kpiCard('violet', 'file', 'Bulletins de paie générés', bulletinValue(b), bulFoot) +
      kpiCard(ndTone, 'calendar', 'Prochaines échéances', ndVal, ndFoot, nd ? ' cp-urgent-' + nd.level : '');
  }

  /** KPI du tableau de bord général (toutes les entreprises). */
  function renderGlobalKpis(g) {
    const b = g.bulletins;
    const empFoot = !g.employeeCount ? '<span>Aucun salarié enregistré</span>' : g.prevPaidEmployees ? trend(g.paidEmployees - g.prevPaidEmployees, '#', true).replace('par rapport au mois dernier', 'salariés payés vs mois dernier') : '<span>' + g.paidEmployees + ' payé' + (g.paidEmployees > 1 ? 's' : '') + ' en ' + esc(monthLabel(g.period)) + '</span>';
    const bulFoot = (g.prevCount ? trend(b.count - g.prevCount, '#', true) : (b.count ? '<span>Aucun bulletin le mois précédent</span>' : '<span>Aucun bulletin pour cette période</span>')) + (b.count ? '<div class="cp-kpi-badges">' + statusLine(b) + '</div>' : '');
    const withPay = g.rows.filter((r) => r.hasPeriodRecord).length;
    return kpiCard('amber', 'building2', 'Entreprises', String(g.companyCount), '<span>' + withPay + ' avec bulletins en ' + esc(monthLabel(g.period)) + '</span>') +
      kpiCard('blue', 'users', 'Total des salariés', String(g.employeeCount), empFoot) +
      kpiCard('green', 'wallet', 'Masse salariale brute', grossValue(g), grossFoot(g)) +
      kpiCard('violet', 'file', 'Bulletins de paie générés', bulletinValue(b), bulFoot);
  }

  function renderCycle(m) {
    if (!m.employeeCount && !m.hasPeriodRecord) return empty('Cycle de paie non démarré', 'Ajoutez des salariés puis enregistrez les bulletins de ' + monthLabel(m.period) + '.');
    const word = { done: 'Terminé', current: 'En cours', pending: 'En attente', blocked: 'Bloqué' };
    return '<div class="cp-cycle" role="list">' + m.cycle.map((s, i) => '<div class="cp-step ' + (s.state === 'pending' ? '' : s.state) + '" role="listitem"><span class="cp-step-dot" aria-hidden="true">' + (s.state === 'done' ? icon('check').replace('<svg', '<svg width="15" height="15"') : (i + 1)) + '</span><b>' + esc(s.label) + '</b><span>' + word[s.state] + ' · ' + esc(s.detail) + '</span>' + (s.state === 'current' || s.state === 'blocked' ? '<button type="button" data-act="' + esc(s.action) + '">Ouvrir</button>' : '') + '</div>').join('') + '</div>';
  }

  function niceMax(v) { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e; const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10; return n * e; }
  let chartSeq = 0;
  function renderChart(m) {
    const gid = 'cpArea' + (++chartSeq);
    const pts = m.series.points, withData = pts.filter((p) => p.value !== null);
    if (!withData.length) return empty('Aucune donnée sur la période affichée', 'Les courbes apparaîtront dès que des bulletins seront enregistrés.');
    const W = 640, H = 250, L = 52, R = 16, T = 14, B = 34, iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(...withData.map((p) => p.value))), n = pts.length;
    const x = (i) => L + (n === 1 ? iw / 2 : (iw * i) / (n - 1)), y = (v) => T + ih - (v / max) * ih;
    let grid = '';
    for (let k = 0; k <= 4; k++) { const v = (max * k) / 4, yy = y(v); grid += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + compact(v) + '</text>'; }
    const every = n > 8 ? 2 : 1;
    const labels = pts.map((p, i) => (i % every === 0 || i === n - 1) ? '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(monthShort(p.period)) + '</text>' : '').join('');
    let segs = [], cur = [];
    pts.forEach((p, i) => { if (p.value === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(p.value)]); });
    if (cur.length) segs.push(cur);
    const lines = segs.map((s) => s.length > 1 ? '<path class="area" fill="url(#' + gid + ')" d="M' + s[0][0] + ' ' + (T + ih) + ' ' + s.map((q) => 'L' + q[0] + ' ' + q[1]).join(' ') + ' L' + s[s.length - 1][0] + ' ' + (T + ih) + ' Z"/><path class="line" d="M' + s.map((q) => q[0] + ' ' + q[1]).join(' L') + '"/>' : '').join('');
    const dots = pts.map((p, i) => p.value === null ? '' : '<circle class="pt" cx="' + x(i) + '" cy="' + y(p.value) + '" r="4.5" tabindex="0"><title>' + esc(monthLabel(p.period)) + ' : ' + esc(money(p.value)) + ' (' + p.count + ' bulletin' + (p.count > 1 ? 's' : '') + ')</title></circle>').join('');
    return '<svg class="cp-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(m.series.label) + ' par mois"><defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#165c4a" stop-opacity=".22"/><stop offset="1" stop-color="#165c4a" stop-opacity="0"/></linearGradient></defs>' + grid + lines + dots + labels + '</svg>' +
      '<p class="cp-chart-note">' + (pts.length - withData.length ? 'Les mois sans bulletin ne sont pas tracés. ' : '') + (m.series.partial ? 'Certains anciens bulletins n’ont pas ce détail : valeur partielle. ' : '') + 'Montants en FCFA.</p>';
  }

  function renderDonut(m) {
    if (!m.distribution.length) return empty('Répartition indisponible', m.hasPeriodRecord ? 'Les bulletins de cette période ont été enregistrés avant l’ajout des détails de charges : recalculez-les depuis Archives.' : 'Aucun bulletin en ' + monthLabel(m.period) + '.');
    const r = 52, c = 2 * Math.PI * r; let off = 0;
    const arcs = m.distribution.map((d) => { const len = (d.pct / 100) * c, s = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + d.color + '" stroke-width="20" stroke-dasharray="' + len + ' ' + (c - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"><title>' + esc(d.label) + ' : ' + esc(money(d.value)) + '</title></circle>'; off += len; return s; }).join('');
    const partial = m.distCoverage.covered < m.distCoverage.total ? '<p class="cp-chart-note">Détail disponible pour ' + m.distCoverage.covered + ' bulletin' + (m.distCoverage.covered > 1 ? 's' : '') + ' sur ' + m.distCoverage.total + '.</p>' : '';
    return '<div class="cp-donut-wrap"><svg class="cp-donut" viewBox="0 0 140 140" role="img" aria-label="Répartition du coût employeur">' + arcs + '<text x="70" y="68" font-size="15" font-weight="800" fill="var(--cp-ink)">' + esc(compact(m.distTotal)) + '</text><text x="70" y="84" font-size="9" fill="var(--cp-muted)">FCFA</text></svg>' +
      '<ul class="cp-legend">' + m.distribution.map((d) => '<li><i style="background:' + d.color + '"></i><span>' + esc(d.label) + '</span><b>' + pct(d.pct) + '</b></li>').join('') + '</ul></div>' + partial;
  }

  function renderShortcuts(kind) {
    const items = kind === 'general'
      ? [['view:companies', 'building2', 'Toutes les entreprises'], ['create-company', 'plus', 'Créer une entreprise'], ['new-payslip', 'file2', 'Créer un bulletin'], ['backup', 'download', 'Exporter la sauvegarde'], ['import-backup', 'upload', 'Importer une sauvegarde'], ['view:config', 'gear', 'Paramètres de paie']]
      : [['new-payslip', 'file2', 'Créer un bulletin'], ['panel:employees', 'users', 'Gérer les salariés'], ['panel:social', 'building2', 'Charges sociales'], ['export-report', 'download', 'Exporter un rapport'], ['import-backup', 'upload', 'Importer une sauvegarde'], ['view:config', 'gear', 'Paramètres de paie']];
    return '<div class="cp-shortcuts">' + items.map(([a, i, l]) => '<button type="button" class="cp-shortcut" data-act="' + a + '"><span class="ico">' + icon(i) + '</span>' + esc(l) + '</button>').join('') + '</div>';
  }

  /** Liste des salariés d'un dossier : Salarié · Période · Net à payer · Statut · Actions (voir, télécharger). */
  function renderEmployeeTable(m, limit) {
    const all = m.employeeRows, max = limit || 8;
    if (!all.length) return empty('Aucun salarié dans ce dossier', 'Ajoutez un salarié depuis « Salariés » ou enregistrez un bulletin pour le voir ici.');
    const rows = all.slice(0, max).map((x) => {
      const person = '<div class="cp-person"><span class="cp-avatar">' + esc(initials(x.name)) + '</span><div><b>' + esc(x.name) + '</b><span>' + esc(x.job || '—') + '</span></div></div>';
      if (!x.hasPayslip) return '<tr><td>' + person + '</td><td>' + esc(monthLabel(m.period)) + '</td><td class="num">—</td><td>' + badge('Sans bulletin') + '</td><td><div class="cp-actions"><button type="button" class="cp-btn sm" data-act="employee" data-id="' + esc(x.id) + '" aria-label="Créer le bulletin de ' + esc(x.name) + '" title="Créer le bulletin">+ Bulletin</button></div></td></tr>';
      const idx = x.record._index;
      const st = x.editable ? '<span class="cp-badge-select">' + badge(x.status) + '<select aria-label="Changer le statut du bulletin de ' + esc(x.name) + '" data-act="status" data-i="' + idx + '">' + STATUSES.map((s) => '<option' + (s === x.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></span>' : badge('Erreur');
      return '<tr><td>' + person + '</td><td>' + esc(monthLabel(x.period)) + '</td><td class="num"><b>' + money(x.net) + '</b></td><td>' + st + '</td>' +
        '<td><div class="cp-actions"><button type="button" class="cp-act" title="Voir" aria-label="Voir le bulletin de ' + esc(x.name) + '" data-act="view" data-i="' + idx + '">' + icon('eye') + '</button><button type="button" class="cp-act" title="Télécharger (Excel)" aria-label="Télécharger le bulletin de ' + esc(x.name) + '" data-act="download" data-i="' + idx + '">' + icon('download') + '</button></div></td></tr>';
    }).join('');
    const more = all.length > max ? '<p class="cp-more"><button type="button" class="cp-link" data-act="panel:employees">Voir les ' + all.length + ' salariés →</button></p>' : '';
    return '<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Salarié</th><th>Période</th><th class="num">Net à payer</th><th>Statut</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + more;
  }

  /** Liste des dossiers d'entreprise (tableau de bord général). */
  function renderCompanyTable(g) {
    if (!g.rows.length) return empty('Aucune entreprise', 'Créez un dossier d’entreprise pour commencer.');
    const rows = g.rows.map((r) => {
      const nd = r.nextDeadline, tone = nd ? (nd.level === 'ok' ? 'success' : nd.level === 'soon' ? 'warning' : 'danger') : 'neutral';
      return '<tr><td><div class="cp-person"><span class="cp-avatar">' + esc(initials(r.name)) + '</span><div><b>' + esc(r.name) + '</b><span>' + r.employeeCount + ' salarié' + (r.employeeCount > 1 ? 's' : '') + '</span></div></div></td>' +
        '<td class="num">' + (r.hasPeriodRecord ? money(r.gross) : '—') + '</td><td class="num">' + r.count + ' / ' + r.expected + '</td><td><span class="cp-badge ' + r.state.tone + '">' + esc(r.state.label) + '</span></td>' +
        '<td>' + (nd ? '<span class="cp-badge ' + tone + '">' + esc(nd.label) + ' · ' + (nd.days < 0 ? 'retard ' + Math.abs(nd.days) + ' j' : nd.days + ' j') + '</span>' : '<span class="cp-sub">—</span>') + '</td>' +
        '<td><div class="cp-actions"><button type="button" class="cp-btn sm" data-act="open-company" data-id="' + esc(r.id) + '" aria-label="Ouvrir le dossier ' + esc(r.name) + '">' + icon('eye').replace('<svg', '<svg width="14" height="14"') + ' Ouvrir</button></div></td></tr>';
    }).join('');
    return '<div class="cp-table-wrap"><table class="cp-table"><thead><tr><th>Entreprise</th><th class="num">Masse salariale brute</th><th class="num">Bulletins</th><th>Cycle de paie</th><th>Échéance</th><th>Dossier</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderAlerts(m) {
    if (!m.alerts.length) return empty('Rien à signaler', m.hasAnyRecord ? 'Aucune échéance proche ni anomalie détectée.' : 'Les alertes apparaîtront dès les premiers bulletins.');
    return '<ul class="cp-alerts">' + m.alerts.map((a) => '<li class="cp-alert ' + a.level + '"><span class="ico">' + icon(a.level === 'info' ? 'clock' : 'alert') + '</span><button type="button" class="main-act" data-act="' + esc(a.action) + '"' + (a.companyId ? ' data-company="' + esc(a.companyId) + '"' : '') + '>' + esc(a.text) + '</button>' + (a.done ? '<button type="button" class="cp-btn sm" data-act="done"' + (a.companyId ? ' data-company="' + esc(a.companyId) + '"' : '') + ' data-key="' + esc(a.done.key) + '" data-period="' + esc(a.done.period) + '">Marquer fait</button>' : '<span></span>') + '</li>').join('') + '</ul>';
  }

  const api = { buildModel, buildGlobalModel, renderKpis, renderGlobalKpis, renderCycle, renderChart, renderDonut, renderShortcuts, renderEmployeeTable, renderCompanyTable, renderAlerts, icon, ICONS, STATUSES, DEFAULT_STATUS, OBLIGATIONS, SERIES, monthLabel, monthShort, addMonths, dueDate, compact, money, esc, recStatus, recNet, recGross, initials };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaDash = api;
})(typeof window !== 'undefined' ? window : globalThis);
