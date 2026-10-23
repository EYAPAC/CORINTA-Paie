/*
 * Corinta Pay — contrôle d'intégrité des bulletins enregistrés (module pur, testé sous Node).
 *
 * Un bulletin cohérent a : ses saisies d'origine, un salaire, des jours payés, des totaux, des retenues (IR, TRIMF, IPRES… : la TRIMF
 * seule est toujours > 0 dès qu'il y a un revenu) et un net égal au brut moins les retenues.
 * auditRecord() décrit les anomalies ; sanityOfRecalc() empêche un recalcul de dégrader un bulletin (un recalcul n'écrase jamais
 * un bulletin correct par un résultat vide).
 */
(function (root) {
  'use strict';
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const blank = (v) => v === undefined || v === null || String(v).trim() === '';

  /** Anomalies d'un bulletin archivé : [{code, label, fixable}] — fixable = corrigeable par un simple recalcul. */
  function auditRecord(r) {
    const out = [], add = (code, label, fixable) => out.push({ code, label, fixable: !!fixable });
    if (!r || typeof r !== 'object') { add('vide', 'Bulletin illisible', false); return out; }
    const t = r.totals, f = r.fields;
    if (!f || typeof f !== 'object') add('sans-saisies', 'Saisies d’origine absentes : recalcul impossible, ressaisir le bulletin', false);
    if (!t || typeof t !== 'object') { add('sans-totaux', 'Totaux de calcul absents', !!f); return out; }
    const gross = num(t.grossAll), ded = num(t.totalDeductions), net = num(t.net);
    if (f) {
      if (num(f.base) <= 0 && num(f.categoryMonthly) <= 0) add('sans-salaire', 'Salaire de base absent : saisir le salaire puis enregistrer', false);
      if (!blank(f.days) && num(f.days) <= 0) add('jours-nuls', '0 jour payé : aucun gain ni retenue', false);
      if (f.days !== undefined && blank(f.days)) add('jours-vides', 'Jours payés non renseignés (30 jours retenus par défaut)', true);
    }
    if (t.totalDeductions === undefined) add('retenues-absentes', 'Total des retenues non enregistré', !!f);
    else if (gross > 0 && ded <= 0) add('retenues-nulles', 'Aucune retenue alors qu’il y a un revenu (TRIMF au minimum)', !!f);
    if (gross > 0 && t.totalDeductions !== undefined && Math.abs(gross - ded - net) > 1.5) add('net-incoherent', 'Net ≠ brut − retenues', !!f);
    if (gross <= 0 && net <= 0) add('sans-revenu', 'Aucun gain enregistré', !!f);
    return out;
  }

  /** Un recalcul est « sain » s'il ne remplace pas un bulletin utilisable par un résultat vide ou incohérent. */
  function sanityOfRecalc(oldTotals, newTotals) {
    const n = newTotals || {}, o = oldTotals || {};
    const gross = num(n.grossAll), ded = num(n.totalDeductions), net = num(n.net);
    const reasons = [];
    if (!(gross > 0)) reasons.push('brut nul');
    if (gross > 0 && !(ded > 0)) reasons.push('aucune retenue');
    if (gross > 0 && Math.abs(gross - ded - net) > 1.5) reasons.push('net incohérent');
    if (num(o.grossAll) > 0 && gross <= 0) reasons.push('le brut était renseigné');
    if (num(o.totalDeductions) > 0 && ded <= 0) reasons.push('les retenues étaient renseignées');
    return { ok: reasons.length === 0, reasons };
  }

  const api = { auditRecord, sanityOfRecalc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaIntegrity = api;
})(typeof window !== 'undefined' ? window : globalThis);
