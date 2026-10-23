/*
 * Corinta Pay — synchronisation directe des paramètres de paie avec le bulletin.
 *
 * Tout champ modifié dans Paramétrage (règles familiales, transport, IPM, majorations, congés, taux et plafonds, barèmes IR/TRIMF,
 * grilles de salaires, rubriques) est appliqué immédiatement : enregistré, répercuté sur le bulletin affiché (valeurs par défaut
 * reprises dans la saisie lorsqu'elles n'avaient pas été personnalisées), et les bulletins archivés sont recalculés automatiquement
 * si une règle de calcul a changé (auto-recalc.js). Les boutons « Enregistrer » restent disponibles pour un enregistrement explicite.
 *
 * Les barèmes légaux restent verrouillés (legal-ui.js) : sans mode dérogatoire, toute valeur non conforme est rétablie.
 */
(function () {
  'use strict';
  const cfg = document.getElementById('config');
  if (!cfg || typeof readFamilySettings !== 'function' || typeof saveCurrentScale !== 'function') { console.error('settings-sync.js : paramétrage introuvable'); return; }
  const $ = (id) => document.getElementById(id);
  const WATCH = '#irJurisdiction,#irMaxParts,#irSingleParts,#irMarriedParts,#irSpouseNoIncomeBonus,#irChildParts,#defaultTransport,#transportExempt,#defaultIpm,#defaultExtra,#leaveAccrual,#otFirstRate,#otNextRate,[data-rate],[data-cap],[data-trate],[data-limit],[data-tamount],[data-tlimit],[data-cat],[data-hour],[data-sal],[data-rname],[data-rtype]';
  let timer = 0;

  function status(text, bad) {
    let el = $('cfgSync');
    if (!el) { el = document.createElement('span'); el.id = 'cfgSync'; el.className = 'muted'; el.setAttribute('role', 'status'); el.style.cssText = 'font-size:12px;margin-right:10px'; const b = $('saveParamsHeader'); if (b && b.parentNode) b.parentNode.insertBefore(el, b); }
    el.textContent = text; el.style.color = bad ? '#b3261e' : '';
    const w = $('wsParamStatus'); if (w) { w.textContent = text; w.style.color = bad ? '#b3261e' : ''; }
  }

  /* Reprend dans le bulletin en cours les valeurs par défaut modifiées, sauf si elles avaient été personnalisées. */
  function carryDefaults(old) {
    [['transport', 'transport', S.transport], ['ipm', 'ipm', S.ipm], ['extra', 'defaultExtra', S.defaultExtra || 0]].forEach(([field, key, now]) => {
      const el = $(field), prev = key === 'defaultExtra' ? (old.defaultExtra || 0) : old[key];
      if (el && (el.value === '' || Number(el.value) === Number(prev))) el.value = now;
    });
  }

  function apply() {
    const old = { transport: S.transport, ipm: S.ipm, defaultExtra: S.defaultExtra };
    try {
      readFamilySettings();
      S.transportExempt = $('transportExempt').value === 'true'; S.transportTaxPolicyVersion = 1;
      Object.entries({ transport: 'defaultTransport', ipm: 'defaultIpm', defaultExtra: 'defaultExtra', leaveAccrual: 'leaveAccrual', overtimeFirstRate: 'otFirstRate', overtimeNextRate: 'otNextRate' }).forEach(([k, id]) => { S[k] = +$(id).value || 0; });
      S.leaveAccrual = Math.max(2, +S.leaveAccrual || 2);
      saveCurrentScale();
      S.rates = S.rates.map((x, i) => { const r = document.querySelector('[data-rate="' + i + '"]'), c = document.querySelector('[data-cap="' + i + '"]'); return { ...x, rate: r ? +r.value || 0 : x.rate, cap: c ? +c.value || 0 : x.cap }; });
      const tax = [...document.querySelectorAll('[data-trate]')];
      if (tax.length) S.tax = tax.map((e) => ({ limit: document.querySelector('[data-limit="' + e.dataset.trate + '"]')?.value ?? '', rate: +e.value || 0 })).filter((x) => x.limit !== '' || x.rate > 0).sort((a, b) => (+a.limit || Infinity) - (+b.limit || Infinity));
      const trimf = [...document.querySelectorAll('[data-tamount]')];
      if (trimf.length) S.trimfBrackets = trimf.map((e) => ({ limit: document.querySelector('[data-tlimit="' + e.dataset.tamount + '"]')?.value ?? '', amount: +e.value || 0 })).sort((a, b) => (+a.limit || Infinity) - (+b.limit || Infinity));
      const rub = [...document.querySelectorAll('[data-rname]')];
      if (rub.length) S.rubrics = rub.map((e) => ({ name: e.value.trim(), type: document.querySelector('[data-rtype="' + e.dataset.rname + '"]')?.value || 'g' })).filter((x) => x.name);
      const fixes = window.CorintaLegal.checkSettings(S, true);           // hors mode dérogatoire : valeurs non légales rétablies
      if (!writeStore('paieSettings', S)) { status('Enregistrement impossible (stockage plein ?)', true); return; }
      if (typeof queueCloudSync === 'function') queueCloudSync();
      if (fixes.length && typeof setup === 'function') setup();
      carryDefaults(old);
      if (typeof refreshPayslip === 'function') refreshPayslip(false); else update();
      if (window.CorintaAutoRecalc) window.CorintaAutoRecalc.schedule('paramètres modifiés');
      status((fixes.length ? 'Valeur non conforme rétablie (mode dérogatoire requis) · ' : 'Appliqué au bulletin · ') + new Date().toLocaleTimeString('fr-FR'), !!fixes.length);
    } catch (err) { console.error('Synchronisation des paramètres', err); status('Synchronisation impossible : ' + ((err && err.message) || err), true); }
  }
  const queue = (ms) => { clearTimeout(timer); timer = setTimeout(apply, ms); };

  cfg.addEventListener('input', (e) => { if (e.target.matches && e.target.matches(WATCH)) queue(600); });
  cfg.addEventListener('change', (e) => { if (e.target.matches && e.target.matches(WATCH)) queue(120); });
  window.CorintaSettingsSync = { apply, queue };
})();
