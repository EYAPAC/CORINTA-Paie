/*
 * Corinta Pay — interface de conformité légale.
 *
 *   1. Verrouille les barèmes légaux (IR, TRIMF, IPRES, CSS, CFCE, parts) dans Paramétrage : lecture seule,
 *      avec référence d'article. Seul le taux « accident du travail » (1, 3 ou 5 %), propre à l'activité de
 *      l'employeur, reste modifiable. Un « mode dérogatoire » explicite permet d'appliquer un autre barème
 *      (arrêté, convention) ; il est signalé sur chaque bulletin.
 *   2. Affiche sur chaque bulletin la base légale de chaque calcul : bases, taux, plafonds et articles.
 *
 * Chargé APRÈS les scripts en ligne : réutilise S, setup, update, writeStore, toast, f (formatage).
 */
(function () {
  'use strict';
  const L = window.CorintaLegal;
  if (!L) { console.error('legal-rules.js non chargé'); return; }
  const $ = (id) => document.getElementById(id);
  const fmt = (v) => f(v);

  /* ───────── 1. Verrouillage des barèmes ───────── */
  const LOCKED = ['#taxes input', '#trimfRows input', '#irJurisdiction', '#irMaxParts', '#irSingleParts', '#irMarriedParts', '#irSpouseNoIncomeBonus', '#irChildParts', '#rates input[data-cap]', '#irFile', '#trimfFile'];
  const HIDDEN_WHEN_LOCKED = ['#addTax', '#saveTax', '#addTrimf', '#saveTrimf', '#saveFamily', '[data-deltax]', '[data-dtrimf]'];

  function ensureBanner() {
    let b = $('legalBanner');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'legalBanner'; b.className = 'card wide';
    b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Conformité légale des barèmes');
    const cfg = $('config'); cfg.insertBefore(b, cfg.firstChild);
    b.addEventListener('click', (e) => {
      const t = e.target.closest('[data-legal]'); if (!t) return;
      if (t.dataset.legal === 'override') {
        if (!confirm('Mode dérogatoire : les barèmes IR, TRIMF et IPRES pourront être modifiés. Chaque bulletin indiquera que des barèmes personnalisés sont appliqués. Utilisez-le uniquement pour un arrêté ou une convention en vigueur. Continuer ?')) return;
        S.legalOverride = true;
      } else if (t.dataset.legal === 'reset') {
        if (!confirm('Rétablir les barèmes légaux et quitter le mode dérogatoire ? Les barèmes personnalisés seront perdus.')) return;
        const atRate = (S.rates.find((x) => /CSS AT/.test(x.name)) || {}).rate;
        Object.assign(S, L.legalSettings()); S.legalOverride = false;
        const at = S.rates.find((x) => /CSS AT/.test(x.name)); if (at && L.LEGAL.css.at.allowedRates.includes(Number(atRate))) at.rate = Number(atRate);
      }
      writeStore('paieSettings', S); queueCloudSync(); setup(); update(); toast(t.dataset.legal === 'override' ? 'Mode dérogatoire activé' : 'Barèmes légaux rétablis');
    });
    return b;
  }

  function renderBanner() {
    const b = ensureBanner(), lg = L.LEGAL;
    const fixes = window.LEGAL_FIXES || [];
    const fixNote = fixes.length ? '<p class="notice" role="status">' + fixes.length + ' écart(s) avec la loi corrigé(s) automatiquement à l’ouverture : ' + fixes.slice(0, 4).map((g) => safe(g.label)).join(' · ') + (fixes.length > 4 ? '…' : '') + '.</p>' : '';
    if (S.legalOverride) {
      b.innerHTML = '<h2>⚠ Mode dérogatoire actif</h2><p class="notice">Des barèmes personnalisés sont appliqués : ils peuvent ne pas être conformes à la loi. Chaque bulletin le mentionne. Revenez aux barèmes légaux dès que possible.</p><button type="button" class="btn primary" data-legal="reset">Rétablir les barèmes légaux</button>';
    } else {
      b.innerHTML = '<h2>🔒 Barèmes légaux verrouillés</h2>' + fixNote +
        '<p class="muted">Conformes à : ' + safe(lg.version) + '.</p><ul class="muted" style="margin:6px 0 10px;padding-left:18px"><li>IR : ' + safe(lg.ir.article) + ' (abattement 30 % plafonné à 900 000, réduction pour charges de famille, plafond 43 %)</li><li>TRIMF : ' + safe(lg.trimf.article) + ' (6 tranches, doublée pour un conjoint sans revenus)</li><li>IPRES : régime général 5,6 % / 8,4 % jusqu’à 432 000 ; régime complémentaire 2,4 % / 3,6 % jusqu’à 1 296 000 pour tout salaire au-dessus du plafond (CSS art. 243 et 245)</li><li>CSS : prestations familiales 7 % et accident du travail 1, 3 ou 5 % (plafond 63 000, charge de l’employeur) · CFCE 3 % (CGI art. 267)</li></ul>' +
        '<button type="button" class="btn" data-legal="override">Activer le mode dérogatoire…</button>';
    }
    window.LEGAL_FIXES = []; // affiché une seule fois
  }

  function applyLock() {
    renderBanner();
    const locked = !S.legalOverride;
    LOCKED.forEach((sel) => document.querySelectorAll(sel).forEach((el) => {
      // le taux AT reste réglable : il dépend de l'activité de l'employeur (1, 3 ou 5 %)
      el.disabled = locked; el.title = locked ? 'Barème légal verrouillé (mode dérogatoire requis)' : '';
    }));
    document.querySelectorAll('#rates input[data-rate]').forEach((inp) => {
      const i = Number(inp.dataset.rate), row = S.rates[i];
      if (row && /CSS AT/.test(row.name) && locked) {
        const sel = document.createElement('select');
        sel.dataset.rate = String(i); sel.setAttribute('aria-label', 'Taux accident du travail (1, 3 ou 5 %)');
        sel.innerHTML = L.LEGAL.css.at.allowedRates.map((r) => '<option value="' + r + '"' + (Number(row.rate) === r ? ' selected' : '') + '>' + r + ' %</option>').join('');
        inp.replaceWith(sel);
      } else { inp.disabled = locked; inp.title = locked ? 'Taux légal verrouillé (mode dérogatoire requis)' : ''; }
    });
    HIDDEN_WHEN_LOCKED.forEach((sel) => document.querySelectorAll(sel).forEach((el) => { el.style.display = locked ? 'none' : ''; }));
  }

  /* ───────── 2. Base légale affichée sur le bulletin ───────── */
  const pc = (v) => String(Number(v)).replace('.', ',');
  function bandLabel(P, band) {
    const t = P.trimf.tranches.slice().sort((a, b) => a.upTo - b.upTo), i = t.indexOf(band) >= 0 ? t.indexOf(band) : t.findIndex((x) => x.upTo === band.upTo);
    const from = i <= 0 ? 0 : t[i - 1].upTo + 1;
    return band.upTo === Infinity ? 'à partir de ' + fmt(from) : 'de ' + fmt(from) + ' à ' + fmt(band.upTo);
  }
  function updateLegalBlock() {
    const el = $('legalBlock'), c = window.payrollLegal; if (!el || !c) return;
    const P = rulesNow(), ir = c.irCalc, rg = P.ipres.rg, rcc = P.ipres.rcc, lines = [];
    lines.push('BASE LÉGALE DU CALCUL · ' + L.LEGAL.version + (S.legalOverride ? ' · ⚠ MODE DÉROGATOIRE : barèmes personnalisés, non garantis conformes' : ''));
    lines.push('IR (' + P.ir.article + ') : revenu brut imposable du mois ' + fmt(c.taxable) + ' × 12 = ' + fmt(ir.annualGross) + ' ; abattement ' + pc(P.ir.abatementRate * 100) + ' % plafonné à ' + fmt(P.ir.abatementCap) + ' = ' + fmt(ir.abatement) + ' ; revenu imposable arrondi au millier inférieur : ' + fmt(ir.taxableAnnual) + ' ; impôt par tranches : ' + fmt(ir.rawAnnualTax) +
      (ir.reductionRate ? ' ; réduction pour ' + pc(c.parts) + ' parts (' + ir.reductionRate + ' %, avec minimum et maximum) : ' + fmt(ir.familyReduction) : ' ; ' + pc(c.parts) + ' part : pas de réduction') + ' ; IR annuel : ' + fmt(ir.annualTax) + ' ÷ 12 = ' + fmt(ir.monthlyTax) + ' FCFA par mois (retenue arrondie à ' + fmt(Math.round(ir.monthlyTax)) + ').');
    const t = L.trimf(c.taxable, c.trimfShares, P);
    lines.push('TRIMF (' + P.trimf.article + ') : revenu brut annuel ' + fmt(t.annualGross) + ' → tranche ' + bandLabel(P, t.band) + ' : ' + fmt(t.band.amount) + ' F par an × ' + c.trimfShares + (c.trimfShares > 1 ? ' (conjoint sans revenus, art. 276)' : '') + ' ÷ 12 = ' + fmt(t.monthlyAmount) + ' FCFA par mois' + (c.trimfManual ? ' · montant saisi manuellement : ' + fmt(c.trimf) : '') + '.');
    const r = L.ipres(c.contributionGross, { serviceOk: L.rccServiceOk(c.hire, c.period), rccExcluded: c.rccExcluded }, P);
    lines.push('IPRES régime général : brut cotisable ' + fmt(c.contributionGross) + ' plafonné à ' + fmt(rg.ceiling) + ' → base ' + fmt(r.rgBase) + ' × ' + pc(rg.employee) + ' % (salarié) et ' + pc(rg.employer) + ' % (employeur).');
    if (r.rccBase > 0) lines.push('Régime complémentaire (CSS art. 243 et 245) : salaire au-dessus du plafond du régime général, sans condition de statut → base ' + fmt(r.rccBase) + ' (de ' + fmt(rg.ceiling) + ' à ' + fmt(Math.min(c.contributionGross, rcc.ceilingTop)) + ') × ' + pc(rcc.employee) + ' % (salarié) et ' + pc(rcc.employer) + ' % (employeur), répartition 40/60.');
    else lines.push('Régime complémentaire : non applicable — ' + (c.contributionGross <= rg.ceiling ? 'salaire ≤ plafond du régime général (' + fmt(rg.ceiling) + ')' : c.rccExcluded ? 'exclusion manuelle' : 'moins de ' + rcc.minServiceDays + ' jours de service (CSS art. 243)') + '.');
    lines.push('CSS (art. 75, charge exclusive de l’employeur) : prestations familiales ' + pc(P.css.pf.employer) + ' % et accident du travail ' + pc(c.atRate) + ' % sur ' + fmt(P.css.pf.ceiling) + ' au maximum · CFCE (' + P.cfce.article + ') : ' + pc(P.cfce.employer) + ' % du brut cotisable, remboursements de frais exclus.');
    el.textContent = lines.join('\n');
  }

  /* ───────── Intégration ───────── */
  const baseSetup = setup;
  setup = function () { baseSetup.apply(this, arguments); applyLock(); };
  const baseHints = updateHints;
  updateHints = function () { baseHints.apply(this, arguments); updateLegalBlock(); };
  if (!$('config').classList.contains('hidden')) applyLock();
  refreshPayslip(false);
})();
