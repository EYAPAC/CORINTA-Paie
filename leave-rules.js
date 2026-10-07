/*
 * CORINTA Paie — règle unique de calcul des congés acquis.
 *
 * Code du travail 2026, art. 248-249 : 2 jours ouvrables par mois de service effectif ; le congé
 * est exigible après 12 mois de service.
 *
 * Convention retenue (confirmée par l'utilisateur sur des cas réels) :
 *   congés acquis = (mois civils écoulés depuis le MOIS d'embauche, mois de la période EXCLU) × taux.
 *   Le mois en cours n'est acquis qu'une fois clos ; le jour d'embauche dans le mois est sans effet.
 *   Exemples : embauche le 01/07/2026 → période 02/2027 : 7 mois = 14 jours ;
 *              embauche en avril 2026 → période 10/2026 : 6 mois = 12 jours.
 *
 * Aucune dépendance : fonctions pures sur des chaînes « AAAA-MM-JJ » et « AAAA-MM ».
 */
(function (root) {
  'use strict';

  const MIN_RATE = 2; // minimum légal : 2 jours ouvrables par mois
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function parseDate(s) { const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(s || '')); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function parsePeriod(s) { const m = /^([0-9]{4})-([0-9]{2})$/.exec(String(s || '')); return m ? { y: +m[1], m: +m[2] } : null; }
  const pad = (n) => String(n).padStart(2, '0');
  const fr = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

  /** Mois civils écoulés avant le mois de la période (0 si données absentes ou embauche postérieure). */
  function months(hire, period) {
    const h = parseDate(hire), p = parsePeriod(period);
    if (!h || !p) return 0;
    return Math.max(0, (p.y - h.y) * 12 + (p.m - h.m));
  }

  /** Taux mensuel effectif : jamais en dessous du minimum légal. */
  function rate(r) { const n = Number(r); return Number.isFinite(n) && n >= MIN_RATE ? n : MIN_RATE; }

  /** Jours de congé acquis à la fin de la période (arrondis au centième). */
  function earned(hire, period, r) { return Math.round(months(hire, period) * rate(r) * 100) / 100; }

  /** Date à partir de laquelle le congé est exigible (12 mois de service). */
  function eligibleFrom(hire) { const h = parseDate(hire); return h ? { y: h.y + 1, m: h.m, d: h.d } : null; }

  /** « · exigibles dès le JJ/MM/AAAA » tant que les 12 mois ne sont pas atteints à la fin de la période. */
  function eligibilityNote(hire, period) {
    const due = eligibleFrom(hire), p = parsePeriod(period);
    if (!due || !p) return '';
    const lastDay = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    const end = p.y * 10000 + p.m * 100 + lastDay, dueKey = due.y * 10000 + due.m * 100 + due.d;
    return end < dueKey ? ' · exigibles dès le ' + pad(due.d) + '/' + pad(due.m) + '/' + due.y : '';
  }

  /** Phrase d'explication affichée à l'écran et sur le bulletin, pour que le résultat soit vérifiable. */
  function breakdown(hire, period, r) {
    const h = parseDate(hire), p = parsePeriod(period);
    if (!h) return 'date d’embauche non renseignée';
    if (!p) return 'période non renseignée';
    const n = months(hire, period), t = earned(hire, period, r);
    if (n === 0) return 'aucun mois civil écoulé depuis ' + MOIS[h.m - 1] + ' ' + h.y + ' avant ' + MOIS[p.m - 1] + ' ' + p.y + ' → 0 jour';
    return n + ' mois civil' + (n > 1 ? 's' : '') + ' écoulé' + (n > 1 ? 's' : '') + ' de ' + MOIS[h.m - 1] + ' ' + h.y + ' à ' + MOIS[(p.m + 10) % 12] + ' ' + (p.m === 1 ? p.y - 1 : p.y) + ' × ' + fr(rate(r)) + ' j = ' + fr(t) + ' jour' + (t > 1 ? 's' : '');
  }

  const api = { months, rate, earned, eligibleFrom, eligibilityNote, breakdown, MIN_RATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaLeave = api;
})(typeof window !== 'undefined' ? window : globalThis);
