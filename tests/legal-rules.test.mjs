import test from 'node:test';
import assert from 'node:assert/strict';

await import('../legal-rules.js');
const L = globalThis.CorintaLegal;

/* ───────── Référence indépendante, écrite d'après le texte du CGI (pas à partir du module) ───────── */
const REF = {
  // art. 173-1 : (borne haute, taux) ; au-delà de 50 000 000 : 43 %
  tax(income) {
    const rows = [[630000, 0], [1500000, 20], [4000000, 30], [8000000, 35], [13500000, 37], [50000000, 40], [Infinity, 43]];
    let prev = 0, t = 0;
    for (const [hi, r] of rows) { if (income > prev) t += (Math.min(income, hi) - prev) * r / 100; prev = hi; }
    return t;
  },
  // art. 174-1 : réduction pour charges de famille
  reduction(tax, parts) {
    const T = { 1.5: [10, 100000, 300000], 2: [15, 200000, 650000], 2.5: [20, 300000, 1100000], 3: [25, 400000, 1650000], 3.5: [30, 500000, 2030000], 4: [35, 600000, 2490000], 4.5: [40, 700000, 2755000], 5: [45, 800000, 3180000] };
    if (!T[parts]) return 0;
    const [pct, min, max] = T[parts];
    return Math.min(max, Math.max(min, tax * pct / 100));
  },
  // art. 182 + 173 + 174 : retourne l'IR annuel pour un revenu mensuel brut imposable
  irAnnual(monthly, parts) {
    const annual = monthly * 12;
    const abatement = Math.min(0.30 * annual, 900000);
    const income = Math.floor((annual - abatement) / 1000) * 1000;
    const tax = this.tax(income);
    const afterFamily = Math.max(0, tax - Math.min(tax, this.reduction(tax, parts)));
    return Math.min(afterFamily, 0.43 * income);
  },
  // art. 282 : six tranches du revenu brut annuel
  trimfAnnual(monthly) {
    const a = Math.floor(monthly * 12);
    if (a <= 599999) return 900; if (a <= 999999) return 3600; if (a <= 1999999) return 4800;
    if (a <= 6999999) return 12000; if (a <= 11999999) return 18000; return 36000;
  }
};
const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} ≠ ${b}`);

test('IR : le module est égal à la référence sur plus de 4 000 combinaisons salaire × parts', () => {
  const partsList = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  let n = 0;
  for (let m = 0; m <= 6000000; m += 7919) for (const p of partsList) { close(L.ir(m, p).annualTax, REF.irAnnual(m, p), `m=${m} p=${p}`); n++; }
  assert.ok(n > 4000, 'couverture ' + n);
});

test('IR : cas calculés à la main (CGI art. 173-174, 182)', () => {
  // 400 000 F/mois, 1 part : 4 800 000 − 900 000 = 3 900 000 ; 174 000 + 720 000 = 894 000 ; /12 = 74 500
  const a = L.ir(400000, 1); assert.equal(a.taxableAnnual, 3900000); assert.equal(a.annualTax, 894000); assert.equal(a.monthlyTax, 74500);
  // 1 000 000 F/mois, 1,5 part : 11 100 000 ; impôt 3 471 000 ; réduction 10 % = 347 100 → plafonnée à 300 000 ; IR 3 171 000 ; /12 = 264 250
  const b = L.ir(1000000, 1.5); assert.equal(b.rawAnnualTax, 3471000); assert.equal(b.familyReduction, 300000); assert.equal(b.annualTax, 3171000); assert.equal(b.monthlyTax, 264250);
  // 5 000 000 F/mois, 1 part : 59 100 000 ; tranches 40 % jusqu'à 50 M puis 43 % → 22 872 000
  const c = L.ir(5000000, 1); assert.equal(c.taxableAnnual, 59100000); assert.equal(c.annualTax, 22872000); assert.equal(c.monthlyTax, 1906000);
});

test('IR : sous le seuil d’imposition, impôt nul ; abattement plafonné à 900 000 ; arrondi au millier inférieur', () => {
  assert.equal(L.ir(60000, 1).annualTax, 0);                     // 720 000 − 216 000 = 504 000 < 630 000
  assert.equal(L.ir(250000, 1).abatement, 900000);               // 30 % de 3 000 000 = 900 000 (plafond atteint)
  assert.equal(L.ir(100000, 1).abatement, 360000);               // 30 % de 1 200 000, sous le plafond
  assert.equal(L.ir(333333, 1).taxableAnnual % 1000, 0);
  assert.equal(L.ir(333333, 1).taxableAnnual, Math.floor((333333 * 12 - 900000) / 1000) * 1000);
});

test('IR : la réduction familiale ne rend jamais l’impôt négatif et l’impôt ne dépasse jamais 43 % du revenu imposable', () => {
  for (let m = 0; m <= 8000000; m += 13001) for (const p of [1, 1.5, 2.5, 5]) {
    const r = L.ir(m, p); assert.ok(r.annualTax >= 0); assert.ok(r.annualTax <= 0.43 * r.taxableAnnual + 1e-9);
  }
});

test('IR : le détail par tranche additionne exactement l’impôt brut', () => {
  const r = L.ir(2345678, 2); close(r.detail.reduce((t, d) => t + d.amount, 0), r.rawAnnualTax, 'somme des tranches');
  assert.equal(r.detail[0].from, 0); assert.equal(r.detail[0].rate, 0); assert.equal(r.detail[1].from, 630000); assert.ok(r.detail.every((d) => d.base > 0));
});

test('parts (CGI art. 174-2, 174-3, 174-4)', () => {
  assert.equal(L.partsFor({ married: false, children: 0 }), 1);
  assert.equal(L.partsFor({ married: true, children: 0, spouseNoIncome: false }), 1, 'marié, deux revenus : 1 part');
  assert.equal(L.partsFor({ married: true, children: 0, spouseNoIncome: true }), 1.5, 'un seul conjoint avec revenus : +0,5');
  assert.equal(L.partsFor({ married: true, children: 1, spouseNoIncome: true }), 2);
  assert.equal(L.partsFor({ married: false, children: 1 }), 1.5);
  assert.equal(L.partsFor({ married: false, children: 3 }), 2.5);
  assert.equal(L.partsFor({ married: true, children: 12, spouseNoIncome: true }), 5, 'plafond de 5 parts');
  assert.equal(L.partsFor({ married: false, children: -2 }), 1);
});

test('TRIMF : égale à la référence sur toutes les frontières de tranche (CGI art. 282)', () => {
  const frontieres = [0, 1, 49999, 50000, 83333, 83334, 99999, 100000, 166666, 166667, 499999, 583333, 583334, 999999, 1000000, 5000000];
  for (const m of frontieres) assert.equal(L.trimf(m, 1).annualAmount, REF.trimfAnnual(m), 'mensuel ' + m);
  for (let m = 0; m < 1500000; m += 997) assert.equal(L.trimf(m, 1).annualAmount, REF.trimfAnnual(m), 'mensuel ' + m);
});

test('TRIMF : montants mensuels attendus et doublement pour un conjoint sans revenus (art. 276)', () => {
  assert.equal(L.trimf(49999, 1).monthlyAmount, 75);            // 599 988 F/an → 900 F
  assert.equal(L.trimf(50000, 1).monthlyAmount, 300);           // 600 000 F/an → 3 600 F
  assert.equal(L.trimf(100000, 1).monthlyAmount, 400);          // 1 200 000 → 4 800 F
  assert.equal(L.trimf(166666, 1).monthlyAmount, 400);          // 1 999 992 → 4 800 F
  assert.equal(L.trimf(166667, 1).monthlyAmount, 1000);         // 2 000 004 → 12 000 F
  assert.equal(L.trimf(583333, 1).monthlyAmount, 1000);         // 6 999 996
  assert.equal(L.trimf(583334, 1).monthlyAmount, 1500);         // 7 000 008 → 18 000 F
  assert.equal(L.trimf(1000000, 1).monthlyAmount, 3000);        // 12 000 000 → 36 000 F
  assert.equal(L.trimf(400000, 2).monthlyAmount, 2000);         // 4 800 000 → 12 000 × 2 / 12
  assert.equal(L.trimf(400000, 2).annualAmount, 24000);
});

test('IPRES : régime général sur le brut plafonné à 432 000 (5,6 % salarié, 8,4 % employeur)', () => {
  const a = L.ipres(400000); assert.equal(a.rgBase, 400000); assert.equal(a.rgEmployee, 22400); assert.equal(a.rgEmployer, 33600); assert.equal(a.rccBase, 0);
  const b = L.ipres(432000); assert.equal(b.rgBase, 432000); assert.equal(b.rccBase, 0, 'au plafond exactement : pas de RCC');
  const c = L.ipres(432001); assert.equal(c.rccBase, 1);
});

test('IPRES : régime complémentaire automatique au-dessus du plafond, sans condition de statut (CSS art. 243, 245)', () => {
  const a = L.ipres(700000); assert.equal(a.rgBase, 432000); assert.equal(a.rccBase, 268000);
  assert.equal(a.rgEmployee, 24192); assert.equal(a.rgEmployer, 36288); close(a.rccEmployee, 6432, 'RCC salarié'); close(a.rccEmployer, 9648, 'RCC employeur');
  const b = L.ipres(1500000); assert.equal(b.rccBase, 1296000 - 432000, 'assiette RCC bornée à 1 296 000');
  close(b.rccEmployee, 20736, 'RCC plafonné salarié'); close(b.rccEmployer, 31104, 'RCC plafonné employeur');
  assert.equal(L.ipres(10000000).rccBase, 864000);
  assert.equal(L.ipres(700000, { serviceOk: false }).rccBase, 0, 'moins de 30 jours de service');
  assert.equal(L.ipres(700000, { rccExcluded: true }).rccBase, 0, 'exclusion manuelle justifiée');
});

test('IPRES : la part salarié du RCC est 40 % de la cotisation, 60 % pour l’employeur (CSS art. 245)', () => {
  const r = L.ipres(900000); close(r.rccEmployee / (r.rccEmployee + r.rccEmployer), 0.4, 'part salarié RCC');
  const g = L.ipres(300000); assert.ok(g.rgEmployee / (g.rgEmployee + g.rgEmployer) <= 0.5, 'la part salarié ne dépasse pas la moitié (art. 75)');
});

test('ancienneté RCC : 30 jours de service de l’embauche à la fin de la période', () => {
  assert.equal(L.rccServiceOk('2026-10-02', '2026-10'), true);   // 2 → 31 octobre = 30 jours
  assert.equal(L.rccServiceOk('2026-10-03', '2026-10'), false);  // 29 jours
  assert.equal(L.rccServiceOk('2026-09-15', '2026-10'), true);
  assert.equal(L.rccServiceOk('', '2026-10'), true, 'date inconnue : non pénalisé');
});

test('CSS et CFCE : à la charge exclusive de l’employeur, plafonds et taux (CSS art. 75 ; CGI art. 267)', () => {
  const c = L.css(700000, 1); assert.equal(c.pfBase, 63000); assert.equal(c.pfEmployer, 4410); assert.equal(c.atBase, 63000); assert.equal(c.atEmployer, 630);
  assert.equal(L.css(700000, 5).atEmployer, 3150); assert.equal(L.css(700000, 3).atEmployer, 1890);
  assert.equal(L.css(700000, 4).atRate, 1, 'taux AT hors 1/3/5 : retour au taux légal par défaut');
  assert.equal(L.css(40000, 1).pfEmployer, 2800, 'sous le plafond : sur le brut réel');
  assert.equal(L.cfce(700000).employer, 21000); assert.equal(L.cfce(0).employer, 0);
});

test('conformité : les réglages légaux ne présentent aucun écart', () => {
  const S = L.legalSettings();
  assert.deepEqual(L.checkSettings(S, false), []);
  assert.equal(S.rates.length, 7); assert.equal(S.tax.at(-1).limit, ''); assert.equal(S.trimfBrackets.at(-1).limit, '');
});

test('conformité : tout écart est détecté puis corrigé hors mode dérogatoire', () => {
  const S = L.legalSettings();
  S.tax[1].rate = 18; S.trimfBrackets[0].amount = 1000; S.married = 1.5; S.rates[0].rate = 6; S.rates[6].cap = 1000000;
  const gaps = L.checkSettings(S, true);
  assert.ok(gaps.length >= 5, 'écarts détectés : ' + gaps.length);
  assert.deepEqual(L.checkSettings(S, false), [], 'après correction, plus aucun écart');
  assert.equal(S.tax[1].rate, 20); assert.equal(S.trimfBrackets[0].amount, 900); assert.equal(S.married, 1); assert.equal(S.rates[0].rate, 5.6);
});

test('conformité : le taux AT propre à l’employeur (1, 3 ou 5 %) est conservé, tout autre taux est rejeté', () => {
  const S = L.legalSettings(); S.rates[3].rate = 5;
  assert.deepEqual(L.checkSettings(S, true), []); assert.equal(S.rates[3].rate, 5);
  S.rates[3].rate = 2.2; assert.equal(L.checkSettings(S, true).length, 1); assert.equal(S.rates[3].rate, 1);
});

test('mode dérogatoire : aucune correction et jeu de règles construit à partir des réglages', () => {
  const S = L.legalSettings(); S.legalOverride = true; S.tax[1].rate = 15;
  assert.deepEqual(L.checkSettings(S, true), []); assert.equal(S.tax[1].rate, 15);
  const P = L.fromSettings(S);
  assert.equal(L.ir(400000, 1, P).annualTax, (870000 * 15 + 2400000 * 30) / 100);
  assert.equal(L.ir(400000, 1).annualTax, 894000, 'la loi par défaut est intacte');
});

test('règles figées : la loi ne peut pas être modifiée par erreur', () => {
  assert.throws(() => { 'use strict'; L.LEGAL.ir.abatementCap = 1; });
  assert.equal(L.LEGAL.ir.abatementCap, 900000);
});

test('échéances : mensuel / trimestriel et jour légal (CSS art. 93 ; CGI art. 185)', () => {
  assert.equal(L.socialMode(20), 'monthly'); assert.equal(L.socialMode(19), 'quarterly'); assert.equal(L.socialMode(0), 'quarterly');
  assert.equal(L.dueMonth('2026-10', 'monthly'), '2026-11'); assert.equal(L.dueMonth('2026-12', 'monthly'), '2027-01');
  assert.equal(L.dueMonth('2026-10', 'quarterly'), '2027-01'); assert.equal(L.dueMonth('2026-12', 'quarterly'), '2027-01');
  assert.equal(L.dueMonth('2026-01', 'quarterly'), '2026-04'); assert.equal(L.dueMonth('2026-03', 'quarterly'), '2026-04');
  assert.equal(L.dueMonth('2026-07', 'quarterly'), '2026-10'); assert.equal(L.DUE_DAY, 15);
  assert.deepEqual(L.quarterMonths('2026-08'), ['2026-07', '2026-08', '2026-09']);
});
