/*
 * Corinta Pay — navigation à deux niveaux.
 *
 * 1) Menu principal (barre latérale bleue, toujours présente) : Tableau de bord · Entreprises · Paramètres.
 * 2) Barre du dossier (apparaît dès qu'une entreprise est ouverte, distincte du menu principal) :
 *    Tableau de bord · Employés · Bulletins de paie · Déclarations sociales et fiscales · Charges et cotisations ·
 *    Documents · Informations de l'entreprise · Paramètres de l'entreprise.
 * Les anciens menus Bulletin / Archives / Paramétrage / Entreprise sont fusionnés ici, sans doublon :
 * « Créer un bulletin » est un bouton des pages Employés et Bulletins de paie, « Archives » une carte de Documents.
 *
 * Chargé après workspace.js. Aucune donnée n'est stockée : le dossier ouvert et l'entrée active se déduisent des vues affichées.
 */
(function () {
  'use strict';
  const D = window.CorintaDash, WS = window.CorintaWS;
  const side = document.querySelector('aside.side');
  if (!D || !WS || !side) { console.error('shell.js : modules requis introuvables'); return; }

  const $ = (id) => document.getElementById(id);
  const esc = D.esc, icon = D.icon;
  const VIEWS = ['dashboard', 'pay', 'config', 'history', 'companies'];
  let ctx = ''; // identifiant du dossier d'entreprise ouvert

  const MAIN = [['dashboard', 'home', 'Tableau de bord'], ['companies', 'building2', 'Entreprises'], ['config', 'gear', 'Paramètres']];
  const TABS = [
    ['dashboard', 'home', 'Tableau de bord'], ['employees', 'users', 'Employés'], ['payslips', 'wallet', 'Bulletins de paie'],
    ['declarations', 'file', 'Déclarations sociales et fiscales'], ['charges', 'coin', 'Charges et cotisations'],
    ['documents', 'archive', 'Documents'], ['settings', 'building2', 'Informations de l’entreprise'], ['params', 'gear', 'Paramètres de l’entreprise']
  ];

  function build() {
    const foot = side.querySelector('.side-foot'); // pied statique : la version est lue par les tableaux de bord
    foot.insertAdjacentHTML('afterbegin', '<div class="side-promo"><span>' + icon('shield') + '</span><div>Une gestion de paie plus simple, plus rapide, plus fiable.</div></div>');
    foot.insertAdjacentHTML('beforebegin',
      '<div class="side-brand"><span class="side-logo" aria-hidden="true">C</span><div><b>Corinta <i>Pay</i></b><small>Simplifiez votre paie, valorisez vos talents</small></div></div>' +
      '<nav class="nav" aria-label="Navigation principale">' + MAIN.map(([k, i, t]) => '<button type="button" data-k="' + k + '">' + icon(i) + '<span>' + esc(t) + '</span></button>').join('') + '</nav>');
    const bar = document.createElement('nav');
    bar.id = 'cnav'; bar.className = 'cnav hidden'; bar.setAttribute('aria-label', 'Navigation du dossier');
    bar.innerHTML = '<button type="button" class="cnav-back" data-c="companies" aria-label="Retour à la liste des entreprises">' + icon('chevron').replace('<svg', '<svg style="transform:rotate(180deg)"') + '<span>Entreprises</span></button>' +
      '<span class="cnav-company" title="Dossier ouvert">' + icon('building2') + '<b id="cnavName">—</b></span>' +
      '<div class="cnav-tabs" role="tablist">' + TABS.map(([k, i, t]) => '<button type="button" role="tab" data-c="' + k + '">' + icon(i) + '<span>' + esc(t) + '</span></button>').join('') + '</div>';
    document.body.appendChild(bar);
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'nav-toggle'; t.id = 'navToggle'; t.setAttribute('aria-label', 'Ouvrir le menu'); t.setAttribute('aria-expanded', 'false');
    t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    const s = document.createElement('div'); s.className = 'nav-scrim'; s.id = 'navScrim';
    document.body.appendChild(t); document.body.appendChild(s);
  }

  const visibleView = () => VIEWS.find((x) => $(x) && !$(x).classList.contains('hidden'));
  const companyOf = (id) => ORG.items.find((c) => c.id === id);

  /* Entrée du menu principal et onglet du dossier correspondant à l'écran affiché. */
  function current() {
    const v = visibleView();
    if (WS.isOpen()) return { main: 'companies', tab: WS.state.module };
    if (v === 'pay') return { main: 'companies', tab: 'payslips' };
    if (v === 'history') return { main: 'companies', tab: 'documents' };
    return { main: v || '', tab: '' };
  }

  function sync() {
    const v = visibleView();
    if (WS.isOpen()) ctx = WS.state.companyId;
    else if (!ctx && (v === 'pay' || v === 'history')) ctx = ORG.active; // bulletin et archives dépendent d'un dossier
    if (ctx && !companyOf(ctx)) ctx = '';
    const cur = current(), bar = $('cnav');
    bar.classList.toggle('hidden', !ctx);
    document.body.classList.toggle('has-cnav', !!ctx);
    if (ctx) $('cnavName').textContent = companyOf(ctx).name;
    side.querySelectorAll('[data-k]').forEach((b) => { const on = b.dataset.k === cur.main; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    bar.querySelectorAll('[data-c]').forEach((b) => {
      const on = !!ctx && b.dataset.c === cur.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
      if (on) {
        b.setAttribute('aria-current', 'page');
        const box = b.parentNode; if (b.offsetLeft < box.scrollLeft || b.offsetLeft + b.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = Math.max(0, b.offsetLeft - 40);
      } else b.removeAttribute('aria-current');
    });
  }

  /* Destinations */
  function goMain(k) {
    if (k === 'dashboard') { ctx = ''; activateView('dashboard'); return; }
    if (k === 'companies') { ctx = ''; activateView('companies'); return; }
    if (k === 'config') activateView('config');
  }
  function goTab(k) {
    if (!ctx || !companyOf(ctx)) { activateView('companies'); return; }
    if (ORG.active !== ctx) setActiveCompany(ctx, true);
    WS.open(ctx, k);
  }
  function go(k) { if (TABS.some((t) => t[0] === k)) goTab(k); else goMain(k); }
  function closeDrawer() { document.body.classList.remove('nav-open'); const t = $('navToggle'); if (t) t.setAttribute('aria-expanded', 'false'); }

  function bind() {
    side.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { goMain(b.dataset.k); closeDrawer(); } });
    $('cnav').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; if (b.dataset.c === 'companies') goMain('companies'); else goTab(b.dataset.c); });
    $('navToggle').addEventListener('click', () => { const on = !document.body.classList.contains('nav-open'); document.body.classList.toggle('nav-open', on); $('navToggle').setAttribute('aria-expanded', String(on)); });
    $('navScrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  }

  /* Intégration : tout changement de vue ou de dossier actif met la navigation à jour. */
  const baseActivate = activateView;
  activateView = function () { const r = baseActivate.apply(this, arguments); sync(); return r; };
  const baseSetActive = setActiveCompany;
  setActiveCompany = function (id) { const r = baseSetActive.apply(this, arguments); if (ctx && companyOf(id)) ctx = id; sync(); return r; };
  const baseFolders = renderCompanyFolders;
  renderCompanyFolders = function () { const r = baseFolders.apply(this, arguments); sync(); return r; };

  build(); bind(); sync();
  window.CorintaShell = { sync, go, context: () => ctx };
})();
