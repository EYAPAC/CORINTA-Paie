import test from 'node:test';
import assert from 'node:assert/strict';

await import('../leave-rules.js'); // s'attache à globalThis hors navigateur (dépôt en ESM)
const L = globalThis.CorintaLeave;

test('cas réel : embauche le 1er juillet 2026, période après période', () => {
  const attendu = { '2026-07': 0, '2026-08': 2, '2026-09': 4, '2026-10': 6, '2026-11': 8, '2026-12': 10, '2027-01': 12, '2027-02': 14, '2027-03': 16 };
  for (const [p, jours] of Object.entries(attendu)) assert.equal(L.earned('2026-07-01', p, 2), jours, p);
});

test('cas réel : embauche en avril 2026 → 12 jours en octobre, quel que soit le jour', () => {
  for (const d of ['2026-04-01', '2026-04-15', '2026-04-30']) assert.equal(L.earned(d, '2026-10', 2), 12, d);
});

test('le jour d’embauche dans le mois ne change jamais le résultat', () => {
  for (const p of ['2026-09', '2027-02', '2028-02']) {
    const ref = L.earned('2026-03-01', p, 2);
    for (const d of ['2026-03-02', '2026-03-15', '2026-03-31']) assert.equal(L.earned(d, p, 2), ref, d + ' ' + p);
  }
});

test('fin de mois et années bissextiles (embauche le 31 janvier, période de février)', () => {
  assert.equal(L.earned('2027-01-31', '2027-02', 2), 2);
  assert.equal(L.earned('2028-01-31', '2028-02', 2), 2);
  assert.equal(L.earned('2028-02-29', '2028-03', 2), 2);
});

test('passage d’année', () => {
  assert.equal(L.earned('2025-12-31', '2026-01', 2), 2);
  assert.equal(L.earned('2025-12-01', '2026-12', 2), 24);
});

test('données absentes, invalides ou embauche postérieure : 0 jour, jamais d’erreur', () => {
  for (const [h, p] of [['', '2026-10'], ['2026-07-01', ''], [null, null], ['pas une date', '2026-10'], ['2026-07-01', '2026/10'], ['2027-01-01', '2026-10']])
    assert.equal(L.earned(h, p, 2), 0, `${h} / ${p}`);
});

test('taux : jamais sous le minimum légal de 2, valeurs supérieures respectées', () => {
  assert.equal(L.earned('2026-07-01', '2026-10', 0), 6);
  assert.equal(L.earned('2026-07-01', '2026-10', 1), 6);
  assert.equal(L.earned('2026-07-01', '2026-10', 'abc'), 6);
  assert.equal(L.earned('2026-07-01', '2026-10', 2.5), 7.5);
  assert.equal(L.rate(undefined), 2);
});

test('exigibilité : 12 mois de service effectif (art. 248)', () => {
  assert.equal(L.eligibilityNote('2026-07-01', '2027-02'), ' · exigibles dès le 01/07/2027');
  assert.equal(L.eligibilityNote('2026-07-01', '2027-06'), ' · exigibles dès le 01/07/2027');
  assert.equal(L.eligibilityNote('2026-07-01', '2027-07'), '');
  assert.equal(L.eligibilityNote('2025-03-10', '2026-10'), '');
  assert.equal(L.eligibilityNote('', '2026-10'), '');
});

test('explication affichée : lisible et cohérente avec le résultat', () => {
  assert.equal(L.breakdown('2026-07-01', '2027-02', 2), '7 mois civils écoulés de juillet 2026 à janvier 2027 × 2 j = 14 jours');
  assert.equal(L.breakdown('2026-04-15', '2026-10', 2), '6 mois civils écoulés de avril 2026 à septembre 2026 × 2 j = 12 jours');
  assert.match(L.breakdown('2026-07-01', '2026-07', 2), /→ 0 jour$/);
  assert.equal(L.breakdown('', '2026-10', 2), 'date d’embauche non renseignée');
  assert.match(L.breakdown('2026-12-01', '2027-01', 2), /1 mois civil écoulé de décembre 2026 à décembre 2026 × 2 j = 2 jours/);
});
