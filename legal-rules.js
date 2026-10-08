/*
 * Corinta Pay — règles légales de paie (Sénégal), source unique et testée.
 *
 * Sources vérifiées sur les textes :
 *   • CGI annoté, octobre 2025 : IR art. 173-174 et 182 ; retenue à la source art. 181-186 ;
 *     CFCE art. 265-269 ; TRIMF art. 275-282.
 *   • Code de la sécurité sociale, loi du 3 septembre 2026 (JO n° 7932) : assiette art. 73 ; charge des
 *     cotisations art. 75 ; versement art. 91-93 ; régime complémentaire art. 243 et 245.
 *   • Taux et plafonds IPRES / CSS : fixés par l'institution et par arrêté (CSS art. 74) — valeurs en
 *     vigueur ci-dessous ; à actualiser ici dès la publication d'un nouvel arrêté.
 *
 * Aucune dépendance. Toutes les fonctions sont pures : elles reçoivent le jeu de règles `P` (LEGAL par
 * défaut) et renvoient des montants non arrondis (l'arrondi d'affichage reste côté appelant).
 */
(function (root) {
  'use strict';

  const INF = Infinity;

  const LEGAL = deepFreeze({
    version: 'CGI annoté oct. 2025 · Code de la sécurité sociale 2026 · taux IPRES/CSS en vigueur',
    jurisdiction: 'Sénégal',
    ir: {
      article: 'CGI art. 173-174 et 182',
      /* revenu imposable annuel, arrondi au millier inférieur (art. 173-1) */
      brackets: [
        { upTo: 630000, rate: 0 }, { upTo: 1500000, rate: 20 }, { upTo: 4000000, rate: 30 }, { upTo: 8000000, rate: 35 },
        { upTo: 13500000, rate: 37 }, { upTo: 50000000, rate: 40 }, { upTo: INF, rate: 43 }
      ],
      rounding: 1000,
      abatementRate: 0.30, abatementCap: 900000,   // art. 182 : 30 % représentatif des cotisations de retraite et frais, plafonné
      maxRateOfIncome: 0.43,                        // art. 174-1 : l'impôt ne peut excéder 43 % du revenu imposable
      /* réduction pour charges de famille (art. 174-1) : taux, minimum, maximum selon le nombre de parts */
      reductions: [
        { parts: 1, pct: 0, min: 0, max: 0 }, { parts: 1.5, pct: 10, min: 100000, max: 300000 }, { parts: 2, pct: 15, min: 200000, max: 650000 },
        { parts: 2.5, pct: 20, min: 300000, max: 1100000 }, { parts: 3, pct: 25, min: 400000, max: 1650000 }, { parts: 3.5, pct: 30, min: 500000, max: 2030000 },
        { parts: 4, pct: 35, min: 600000, max: 2490000 }, { parts: 4.5, pct: 40, min: 700000, max: 2755000 }, { parts: 5, pct: 45, min: 800000, max: 3180000 }
      ],
      /* nombre de parts (art. 174-2, 174-3, 174-4) */
      baseSingle: 1, baseMarried: 1, perChild: 0.5, spouseNoIncomeBonus: 0.5, maxParts: 5
    },
    trimf: {
      article: 'CGI art. 275-282',
      /* tarif annuel selon le revenu brut annuel, avantages en argent et en nature compris (art. 282) */
      tranches: [
        { upTo: 599999, amount: 900 }, { upTo: 999999, amount: 3600 }, { upTo: 1999999, amount: 4800 },
        { upTo: 6999999, amount: 12000 }, { upTo: 11999999, amount: 18000 }, { upTo: INF, amount: 36000 }
      ],
      spouseNoIncomeShares: 2 // art. 276 : le salarié est imposé pour lui-même et son conjoint sans revenus
    },
    ipres: {
      article: 'IPRES (arrêté en vigueur) · CSS art. 243 et 245',
      rg: { employee: 5.6, employer: 8.4, ceiling: 432000 },
      rcc: { employee: 2.4, employer: 3.6, ceilingTop: 1296000, minServiceDays: 30 } // répartition 40/60 (art. 245)
    },
    css: {
      article: 'CSS art. 73 et 75 · arrêté en vigueur',
      pf: { employer: 7, ceiling: 63000 },
      at: { allowedRates: [1, 3, 5], defaultRate: 1, ceiling: 63000 }
    },
    cfce: { article: 'CGI art. 265-269', employer: 3 }
  });

  function deepFreeze(o) { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); }
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  /* ───────── IR ───────── */
  /** Nombre de parts (CGI art. 174). */
  function partsFor(input, P) {
    P = P || LEGAL;
    const r = P.ir, married = !!input.married, spouseNoIncome = !!input.spouseNoIncome;
    const parts = (married ? r.baseMarried : r.baseSingle) + (married && spouseNoIncome ? r.spouseNoIncomeBonus : 0) + Math.max(0, Math.floor(num(input.children))) * r.perChild;
    return Math.min(r.maxParts, Math.max(0, parts));
  }

  /** IR annuel et mensuel sur un revenu mensuel brut imposable. Détail par tranche inclus. */
  function ir(monthlyTaxable, parts, P) {
    P = P || LEGAL;
    const r = P.ir, annualGross = Math.max(0, num(monthlyTaxable)) * 12;
    const abatement = Math.min(annualGross * r.abatementRate, r.abatementCap);
    const base = Math.max(0, annualGross - abatement);
    const income = Math.floor(base / r.rounding) * r.rounding;
    const brackets = r.brackets.slice().sort((a, b) => a.upTo - b.upTo);
    let lo = 0, tax = 0; const detail = [];
    for (const b of brackets) {
      const slice = Math.max(0, Math.min(income, b.upTo) - lo), amount = (slice * b.rate) / 100;
      if (slice > 0) detail.push({ from: lo, to: b.upTo, rate: b.rate, base: slice, amount });
      tax += amount;
      if (income <= b.upTo) break;
      lo = b.upTo;
    }
    let red = r.reductions[0];
    for (const x of r.reductions) if (x.parts <= parts) red = x;
    const familyReduction = red.pct ? Math.min(red.max, Math.max(red.min, (tax * red.pct) / 100)) : 0;
    const afterFamily = Math.max(0, tax - Math.min(tax, familyReduction));
    const annualTax = Math.min(afterFamily, income * r.maxRateOfIncome);
    return { annualGross, abatement, taxableAnnual: income, rawAnnualTax: tax, detail, parts, reductionRate: red.pct, familyReduction, annualTax, monthlyTax: annualTax / 12 };
  }

  /* ───────── TRIMF ───────── */
  /** Tranche et montants de la TRIMF pour un revenu mensuel brut (avantages compris, remboursements de frais exclus). */
  function trimf(monthlyGross, shares, P) {
    P = P || LEGAL;
    const annual = Math.floor(Math.max(0, num(monthlyGross)) * 12);
    const t = P.trimf.tranches.slice().sort((a, b) => a.upTo - b.upTo);
    const band = t.find((x) => annual <= x.upTo) || t[t.length - 1];
    const n = shares || 1;
    return { annualGross: annual, band, annualAmount: band.amount * n, monthlyAmount: (band.amount * n) / 12, shares: n };
  }

  /* ───────── IPRES / CSS / CFCE ───────── */
  /**
   * Bases et cotisations IPRES sur le brut cotisable du mois.
   * RCC (CSS art. 243) : tout salarié en service depuis au moins 30 jours dont le salaire dépasse le plafond du
   * régime général, sans condition de statut ; assiette = part du salaire comprise entre les deux plafonds.
   */
  function ipres(grossContrib, opts, P) {
    P = P || LEGAL;
    const g = Math.max(0, num(grossContrib)), o = opts || {}, rg = P.ipres.rg, rcc = P.ipres.rcc;
    const rgBase = Math.min(g, rg.ceiling);
    const serviceOk = o.serviceOk !== false;
    const rccBase = !o.rccExcluded && g > rg.ceiling && serviceOk ? Math.max(0, Math.min(g, rcc.ceilingTop) - rg.ceiling) : 0;
    return { rgBase, rccBase, rgEmployee: (rgBase * rg.employee) / 100, rgEmployer: (rgBase * rg.employer) / 100, rccEmployee: (rccBase * rcc.employee) / 100, rccEmployer: (rccBase * rcc.employer) / 100 };
  }
  /** CSS : prestations familiales et accidents du travail, à la charge exclusive de l'employeur (art. 75). */
  function css(grossContrib, atRate, P) {
    P = P || LEGAL;
    const g = Math.max(0, num(grossContrib)), at = P.css.at.allowedRates.includes(num(atRate)) ? num(atRate) : P.css.at.defaultRate;
    const pfBase = Math.min(g, P.css.pf.ceiling), atBase = Math.min(g, P.css.at.ceiling);
    return { pfBase, pfEmployer: (pfBase * P.css.pf.employer) / 100, atRate: at, atBase, atEmployer: (atBase * at) / 100 };
  }
  /** CFCE (CGI art. 267) : 3 % de la masse salariale, remboursements de frais et prestations familiales exclus. */
  function cfce(grossContrib, P) {
    P = P || LEGAL;
    const base = Math.max(0, num(grossContrib));
    return { base, employer: (base * P.cfce.employer) / 100 };
  }

  /** Ancienneté suffisante pour le régime complémentaire : 30 jours de service (art. 243), de l'embauche à la fin de la période. */
  function rccServiceOk(hireISO, period) {
    const h = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(hireISO || '')), p = /^([0-9]{4})-([0-9]{2})$/.exec(String(period || ''));
    if (!h || !p) return true; // sans date : on ne pénalise pas, l'alerte « information manquante » le signale
    const start = Date.UTC(+h[1], +h[2] - 1, +h[3]), end = Date.UTC(+p[1], +p[2], 0);
    return Math.floor((end - start) / 86400000) + 1 >= P0.ipres.rcc.minServiceDays;
  }
  const P0 = LEGAL;

  /* ───────── Paramétrage : conformité des réglages enregistrés ───────── */
  const lim = (u) => (u === INF ? '' : u);
  /** Réglages (format de l'écran Paramétrage) correspondant exactement à la loi. */
  function legalSettings() {
    const L = LEGAL;
    return {
      irJurisdiction: L.jurisdiction, single: L.ir.baseSingle, married: L.ir.baseMarried, child: L.ir.perChild, irSpouseNoIncomeBonus: L.ir.spouseNoIncomeBonus, irMaxParts: L.ir.maxParts,
      tax: L.ir.brackets.map((b) => ({ limit: lim(b.upTo), rate: b.rate })),
      trimfBrackets: L.trimf.tranches.map((t) => ({ limit: lim(t.upTo), amount: t.amount })),
      rates: [
        { name: 'IPRES RG · salarié', rate: L.ipres.rg.employee, cap: L.ipres.rg.ceiling, side: 'd' },
        { name: 'IPRES RCC · salarié', rate: L.ipres.rcc.employee, cap: L.ipres.rcc.ceilingTop, side: 'd' },
        { name: 'CFCE · employeur', rate: L.cfce.employer, cap: 0, side: 'e' },
        { name: 'CSS AT · employeur', rate: L.css.at.defaultRate, cap: L.css.at.ceiling, side: 'e' },
        { name: 'CSS AF · employeur', rate: L.css.pf.employer, cap: L.css.pf.ceiling, side: 'e' },
        { name: 'IPRES RG · employeur', rate: L.ipres.rg.employer, cap: L.ipres.rg.ceiling, side: 'e' },
        { name: 'IPRES RCC · employeur', rate: L.ipres.rcc.employer, cap: L.ipres.rcc.ceilingTop, side: 'e' }
      ]
    };
  }
  /** Jeu de règles P construit à partir des réglages (mode dérogatoire uniquement). */
  function fromSettings(S) {
    const L = LEGAL, rate = (name) => (S.rates || []).find((x) => x.name === name) || {};
    const unl = (l) => (l === '' || l == null ? INF : num(l));
    const P = structuredClone(L); // copie modifiable (Infinity conservé)
    P.ir.brackets = (S.tax || []).map((b) => ({ upTo: unl(b.limit), rate: num(b.rate) })).sort((a, b) => a.upTo - b.upTo);
    if (!P.ir.brackets.length) P.ir.brackets = L.ir.brackets.slice();
    P.ir.baseSingle = num(S.single); P.ir.baseMarried = num(S.married); P.ir.perChild = num(S.child); P.ir.spouseNoIncomeBonus = num(S.irSpouseNoIncomeBonus); P.ir.maxParts = num(S.irMaxParts) || L.ir.maxParts;
    P.trimf.tranches = (S.trimfBrackets || []).map((t) => ({ upTo: unl(t.limit), amount: num(t.amount) })).sort((a, b) => a.upTo - b.upTo);
    if (!P.trimf.tranches.length) P.trimf.tranches = L.trimf.tranches.slice();
    const rgE = rate('IPRES RG · salarié'), rgP = rate('IPRES RG · employeur'), rcE = rate('IPRES RCC · salarié'), rcP = rate('IPRES RCC · employeur');
    P.ipres = { article: L.ipres.article, rg: { employee: num(rgE.rate), employer: num(rgP.rate), ceiling: num(rgE.cap) || L.ipres.rg.ceiling }, rcc: { employee: num(rcE.rate), employer: num(rcP.rate), ceilingTop: num(rcE.cap) || L.ipres.rcc.ceilingTop, minServiceDays: L.ipres.rcc.minServiceDays } };
    P.css = { article: L.css.article, pf: { employer: num(rate('CSS AF · employeur').rate), ceiling: num(rate('CSS AF · employeur').cap) || L.css.pf.ceiling }, at: { allowedRates: [1, 3, 5, num(rate('CSS AT · employeur').rate)], defaultRate: L.css.at.defaultRate, ceiling: num(rate('CSS AT · employeur').cap) || L.css.at.ceiling } };
    P.cfce = { article: L.cfce.article, employer: num(rate('CFCE · employeur').rate) };
    return P;
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const normTax = (t) => (t || []).map((x) => ({ limit: x.limit === '' || x.limit == null ? '' : num(x.limit), rate: num(x.rate) }));
  const normTrimf = (t) => (t || []).map((x) => ({ limit: x.limit === '' || x.limit == null ? '' : num(x.limit), amount: num(x.amount) }));

  /**
   * Compare les réglages enregistrés à la loi. Renvoie la liste des écarts ; si `fix` est vrai (et hors mode
   * dérogatoire), remet les valeurs légales. Le taux AT, propre à l'activité de l'employeur, est conservé s'il vaut 1, 3 ou 5.
   */
  function checkSettings(S, fix) {
    const gaps = [], legal = legalSettings();
    if (!S || S.legalOverride) return gaps;
    const note = (label, expected, found) => gaps.push({ label, expected, found });
    if (!same(normTax(S.tax), legal.tax)) { note('Barème IR (CGI art. 173)', 'tranches légales', 'barème modifié'); if (fix) S.tax = legal.tax.map((x) => ({ ...x })); }
    if (!same(normTrimf(S.trimfBrackets), legal.trimfBrackets)) { note('Tarif TRIMF (CGI art. 282)', '6 tranches légales', 'tarif modifié'); if (fix) S.trimfBrackets = legal.trimfBrackets.map((x) => ({ ...x })); }
    for (const k of ['single', 'married', 'child', 'irSpouseNoIncomeBonus', 'irMaxParts']) {
      if (num(S[k]) !== legal[k]) { note('Parts IR · ' + k + ' (CGI art. 174)', legal[k], S[k]); if (fix) S[k] = legal[k]; }
    }
    if (S.irJurisdiction !== legal.irJurisdiction) { note('Pays', legal.irJurisdiction, S.irJurisdiction); if (fix) S.irJurisdiction = legal.irJurisdiction; }
    const cur = Array.isArray(S.rates) ? S.rates : [];
    const next = legal.rates.map((lr) => {
      const c = cur.find((x) => x.name === lr.name);
      if (lr.name === 'CSS AT · employeur') {
        const okRate = c && LEGAL.css.at.allowedRates.includes(num(c.rate)), okCap = c && num(c.cap) === lr.cap;
        if (!okRate || !okCap) note('CSS accident du travail', '1 %, 3 % ou 5 % — plafond ' + lr.cap, c ? c.rate + ' % — plafond ' + c.cap : 'absent');
        return { ...lr, rate: okRate ? num(c.rate) : lr.rate };
      }
      if (!c || num(c.rate) !== lr.rate || num(c.cap) !== lr.cap) note(lr.name, lr.rate + ' % — plafond ' + lr.cap, c ? c.rate + ' % — plafond ' + c.cap : 'absent');
      return { ...lr };
    });
    if (fix) S.rates = next;
    return gaps;
  }

  /* ───────── Échéances (CGI art. 185 ; CSS art. 93) ───────── */
  const pad2 = (n) => String(n).padStart(2, '0');
  /** Mois de versement (AAAA-MM) : mensuel = mois suivant ; trimestriel = 1er mois suivant le trimestre civil de la période. */
  function dueMonth(period, mode) {
    const m = /^([0-9]{4})-([0-9]{2})$/.exec(String(period || '')); if (!m) return '';
    const y = +m[1], mo = +m[2];
    const target = mode === 'quarterly' ? Math.ceil(mo / 3) * 3 + 1 : mo + 1;
    return (y + Math.floor((target - 1) / 12)) + '-' + pad2(((target - 1) % 12) + 1);
  }
  /** Rythme de versement IPRES/CSS (art. 93) : mensuel à partir de 20 salariés, trimestriel en dessous. */
  const socialMode = (employeeCount) => (num(employeeCount) >= 20 ? 'monthly' : 'quarterly');
  /** Les 15 premiers jours : échéance au 15 du mois de versement (art. 93 CSS ; art. 185 CGI). */
  const DUE_DAY = 15;
  /** Mois de la période appartenant au même trimestre civil (pour cocher « fait » une seule fois par trimestre). */
  function quarterMonths(period) {
    const m = /^([0-9]{4})-([0-9]{2})$/.exec(String(period || '')); if (!m) return [];
    const q = Math.ceil(+m[2] / 3), out = []; for (let i = 0; i < 3; i++) out.push(m[1] + '-' + pad2((q - 1) * 3 + 1 + i)); return out;
  }

  const api = { LEGAL, partsFor, ir, trimf, ipres, css, cfce, rccServiceOk, legalSettings, fromSettings, checkSettings, dueMonth, socialMode, quarterMonths, DUE_DAY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaLegal = api;
})(typeof window !== 'undefined' ? window : globalThis);
