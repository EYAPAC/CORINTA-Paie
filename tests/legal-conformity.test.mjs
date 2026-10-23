/*
 * Garde-fou de conformité : les barèmes légaux du logiciel doivent rester identiques aux textes en vigueur.
 * Toute modification de legal-rules.js qui s'écarte de ces valeurs fait échouer le test (et doit être justifiée par un nouveau texte).
 *
 * Sources vérifiées le 23/10/2026 :
 *  - CGI annoté d'octobre 2025 (loi n° 2022-19 du 27 mai 2022) : art. 173 (barème), 174 (réduction et parts), 182 (abattement),
 *    267 (CFCE 3 %), 276 et 282 (TRIMF).
 *  - CLEISS, cotisations des travailleurs salariés au Sénégal au 1er janvier 2026 : PF 7 % (plafond 63 000), AT 1/3/5 % (63 000),
 *    IPRES RG 5,6 % + 8,4 % (432 000), RCC 2,4 % + 3,6 % entre 432 000 et 1 296 000.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
await import('../legal-rules.js');
const L = globalThis.CorintaLegal.LEGAL;

test('IR : barème progressif (CGI art. 173-1)', () => {
  assert.deepEqual(L.ir.brackets.map((b) => [b.upTo === Infinity ? null : b.upTo, b.rate]),
    [[630000, 0], [1500000, 20], [4000000, 30], [8000000, 35], [13500000, 37], [50000000, 40], [null, 43]]);
  assert.equal(L.ir.rounding, 1000);
  assert.equal(L.ir.abatementRate, 0.30); assert.equal(L.ir.abatementCap, 900000);   // art. 182
  assert.equal(L.ir.maxRateOfIncome, 0.43);                                           // art. 174-1
});

test('IR : réduction pour charges de famille (CGI art. 174-1)', () => {
  assert.deepEqual(L.ir.reductions.map((r) => [r.parts, r.pct, r.min, r.max]), [
    [1, 0, 0, 0], [1.5, 10, 100000, 300000], [2, 15, 200000, 650000], [2.5, 20, 300000, 1100000], [3, 25, 400000, 1650000],
    [3.5, 30, 500000, 2030000], [4, 35, 600000, 2490000], [4.5, 40, 700000, 2755000], [5, 45, 800000, 3180000]]);
});

test('IR : nombre de parts (CGI art. 174-2, 174-3, 174-4) — marié = 1,5', () => {
  assert.equal(L.ir.baseSingle, 1); assert.equal(L.ir.baseMarried, 1.5);
  assert.equal(L.ir.perChild, 0.5); assert.equal(L.ir.spouseNoIncomeBonus, 0.5); assert.equal(L.ir.maxParts, 5);
});

test('TRIMF (CGI art. 276 et 282)', () => {
  assert.deepEqual(L.trimf.tranches.map((t) => [t.upTo === Infinity ? null : t.upTo, t.amount]),
    [[599999, 900], [999999, 3600], [1999999, 4800], [6999999, 12000], [11999999, 18000], [null, 36000]]);
  assert.equal(L.trimf.spouseNoIncomeShares, 2);
});

test('CFCE (CGI art. 267) et cotisations sociales (CLEISS 01/01/2026)', () => {
  assert.equal(L.cfce.employer, 3);
  assert.deepEqual(L.css.pf, { employer: 7, ceiling: 63000 });
  assert.deepEqual(L.css.at.allowedRates, [1, 3, 5]); assert.equal(L.css.at.ceiling, 63000);
  assert.deepEqual(L.ipres.rg, { employee: 5.6, employer: 8.4, ceiling: 432000 });
  assert.equal(L.ipres.rcc.employee, 2.4); assert.equal(L.ipres.rcc.employer, 3.6); assert.equal(L.ipres.rcc.ceilingTop, 1296000);
});
