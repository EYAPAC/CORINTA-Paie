/*
 * Corinta Pay — menu principal unique.
 *
 * Un seul menu latéral pour toute l'application :
 *   Tableau de bord            → tableau de bord général
 *   Entreprises                → liste des dossiers ; ouvrir un dossier déplie ses rubriques en dessous :
 *       <Dossier>              → tableau de bord du dossier
 *       Employés · Paie · Déclarations sociales · Documents · Informations de l'entreprise
 *   Paramètres                 → paramètres de paie (ancien menu « Paramétrage »)
 * Les anciens menus « Bulletin », « Archives », « Paramétrage » et « Entreprise » sont remplacés par ces entrées :
 * Bulletin → Paie ▸ Créer un bulletin, Archives → Documents ▸ Archives des bulletins.
 *
 * Chargé après workspace.js. Aucune donnée n'est stockée ici : l'état se déduit des vues affichées.
 */
(function () {
  'use strict';
  const D = window.CorintaDash, WS = window.CorintaWS, UI = window.CorintaUI;
  const side = document.querySelector('aside.side');
  if (!D || !WS || !UI || !side) { console.error('shell.js : modules requis introuvables'); return; }

  const $ = (id) => document.getElementById(id);
  const esc = D.esc, icon = D.icon;
  const VIEWS = ['dashboard', 'pay', 'config', 'history', 'companies'];
  let ctx = '';                  // identifiant du dossier d'entreprise ouvert (sous-menu affiché)
  const expanded = new Set();    // groupes dépliés à la main

  const GROUPS = [
    { g: 'pay', i: 'wallet', t: 'Paie', sub: [['ws:payslips', 'Bulletins de paie'], ['new-payslip', 'Créer un bulletin']] },
    { g: 'decl', i: 'file', t: 'Déclarations sociales', sub: [['ws:deadlines', 'Échéances'], ['ws:social', 'Charges sociales'], ['ws:taxes', 'Charges fiscales']] },
    { g: 'docs', i: 'archive', t: 'Documents', sub: [['ws:documents', 'Exports et sauvegarde'], ['view:history', 'Archives des bulletins']] }
  ];
  const btn = (k, i, t, cls) => '<button type="button" data-k="' + k + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + (i ? icon(i) : '') + '<span>' + esc(t) + '</span></button>';
  const chev = icon('chevron').replace('<svg', '<svg class="nv-chev"');

  function build() {
    const groups = GROUPS.map((n) =>
      '<div class="nv-group"><button type="button" data-g="' + n.g + '" aria-expanded="false">' + icon(n.i) + '<span>' + esc(n.t) + '</span>' + chev + '</button>' +
      '<div class="nv-sub hidden" id="nvSub-' + n.g + '">' + n.sub.map(([k, t]) => btn(k, '', t)).join('') + '</div></div>').join('');
    const foot = side.querySelector('.side-foot'); // pied statique : la version est lue par les tableaux de bord
    foot.insertAdjacentHTML('afterbegin', '<div class="side-promo"><span>' + icon('shield') + '</span><div>Une gestion de paie plus simple, plus rapide, plus fiable.</div></div>');
    foot.insertAdjacentHTML('beforebegin',
      '<div class="side-brand"><span class="side-logo" aria-hidden="true">C</span><div><b>Corinta <i>Pay</i></b><small>Simplifiez votre paie, valorisez vos talents</small></div></div>' +
      '<nav class="nav" aria-label="Navigation principale">' +
      btn('dashboard', 'home', 'Tableau de bord') +
      btn('companies', 'building2', 'Entreprises') +
      '<div class="nv-ctx hidden" id="nvCtx" role="group" aria-label="Dossier ouvert"><small>Dossier ouvert</small>' +
      '<button type="button" class="nv-head" data-k="ws:dashboard">' + icon('home') + '<span id="nvCtxName">—</span></button>' +
      btn('ws:employees', 'users', 'Employés') + groups + btn('ws:settings', 'gear', 'Informations de l’entreprise') + '</div>' +
      btn('config', 'gear', 'Paramètres') +
      '</nav>');
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'nav-toggle'; t.id = 'navToggle'; t.setAttribute('aria-label', 'Ouvrir le menu'); t.setAttribute('aria-expanded', 'false');
    t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    const s = document.createElement('div'); s.className = 'nav-scrim'; s.id = 'navScrim';
    document.body.appendChild(t); document.body.appendChild(s);
  }

  /* Vue affichée → entrée du menu à mettre en évidence. */
  function currentKey() {
    if (WS.isOpen()) { const s = WS.state; return 'ws:' + (s.module === 'declarations' ? s.decl : s.module); }
    const v = VIEWS.find((x) => $(x) && !$(x).classList.contains('hidden'));
    return { dashboard: 'dashboard', companies: 'companies', config: 'config', pay: 'new-payslip', history: 'view:history' }[v] || '';
  }
  const companyOf = (id) => ORG.items.find((c) => c.id === id);

  function sync() {
    if (WS.isOpen()) ctx = WS.state.companyId;
    else if (!ctx && ['pay', 'history'].some((v) => $(v) && !$(v).classList.contains('hidden'))) ctx = ORG.active; // bulletin et archives dépendent d'un dossier
    if (ctx && !companyOf(ctx)) ctx = '';
    const key = currentKey(), box = $('nvCtx');
    box.classList.toggle('hidden', !ctx);
    if (ctx) $('nvCtxName').textContent = companyOf(ctx).name;
    side.querySelectorAll('[data-k]').forEach((b) => {
      const on = b.dataset.k === key; b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    side.querySelectorAll('[data-g]').forEach((g) => {
      const sub = $('nvSub-' + g.dataset.g), hasActive = !!sub.querySelector('.active'), open = hasActive || expanded.has(g.dataset.g);
      sub.classList.toggle('hidden', !open); g.setAttribute('aria-expanded', String(open));
    });
  }

  /* Destinations */
  function go(k) {
    if (k === 'dashboard') { ctx = ''; activateView('dashboard'); return; }
    if (k === 'companies') { ctx = ''; activateView('companies'); return; }
    if (k === 'config') { activateView('config'); return; }
    if (!ctx || !companyOf(ctx)) { activateView('companies'); return; }
    if (k.indexOf('ws:') === 0) { WS.open(ctx, k.slice(3)); return; }
    if (ORG.active !== ctx) setActiveCompany(ctx, true);
    if (k === 'new-payslip') { if (currentKey() !== 'new-payslip') UI.act('new-payslip'); return; }
    if (k.indexOf('view:') === 0) activateView(k.slice(5));
  }
  function closeDrawer() { document.body.classList.remove('nav-open'); const t = $('navToggle'); if (t) t.setAttribute('aria-expanded', 'false'); }

  function bind() {
    side.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]');
      if (g) { const id = g.dataset.g; if (expanded.has(id)) expanded.delete(id); else expanded.add(id); sync(); return; }
      const b = e.target.closest('[data-k]'); if (!b) return;
      go(b.dataset.k); closeDrawer();
    });
    $('navToggle').addEventListener('click', () => { const on = !document.body.classList.contains('nav-open'); document.body.classList.toggle('nav-open', on); $('navToggle').setAttribute('aria-expanded', String(on)); });
    $('navScrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  }

  /* Intégration : tout changement de vue ou de dossier actif met le menu à jour. */
  const baseActivate = activateView;
  activateView = function (v) { const r = baseActivate.apply(this, arguments); sync(); return r; };
  const baseSetActive = setActiveCompany;
  setActiveCompany = function (id) { const r = baseSetActive.apply(this, arguments); if (ctx && companyOf(id)) ctx = id; sync(); return r; };
  const baseFolders = renderCompanyFolders;
  renderCompanyFolders = function () { const r = baseFolders.apply(this, arguments); sync(); return r; };

  build(); bind(); sync();
  window.CorintaShell = { sync, go, context: () => ctx };
})();
