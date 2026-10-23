import test from 'node:test';
import assert from 'node:assert/strict';
await import('../integrity.js');
const IG = globalThis.CorintaIntegrity;

const ok = () => ({ name: 'A', period: '2026-10', fields: { base: '450000', days: '30' }, totals: { grossAll: 470800, totalDeductions: 117207, net: 353593 } });
const codes = (r) => IG.auditRecord(r).map((i) => i.code);

test('un bulletin complet et cohérent ne remonte aucune anomalie', () => {
  assert.deepEqual(codes(ok()), []);
});

test('bulletin sans salaire, sans jours, sans retenues : anomalies détectées', () => {
  const noBase = ok(); noBase.fields.base = ''; assert.ok(codes(noBase).includes('sans-salaire'));
  const noDays = ok(); noDays.fields.days = '0'; assert.ok(codes(noDays).includes('jours-nuls'));
  const emptyDays = ok(); emptyDays.fields.days = ''; const e = IG.auditRecord(emptyDays).find((i) => i.code === 'jours-vides'); assert.ok(e && e.fixable);
  const noDed = ok(); delete noDed.totals.totalDeductions; assert.ok(codes(noDed).includes('retenues-absentes'));
  const zeroDed = ok(); zeroDed.totals.totalDeductions = 0; zeroDed.totals.net = 470800; assert.ok(codes(zeroDed).includes('retenues-nulles'));
  const skew = ok(); skew.totals.net = 400000; assert.ok(codes(skew).includes('net-incoherent'));
});

test('bulletin sans saisies ou sans totaux', () => {
  assert.ok(codes({ name: 'X', totals: ok().totals }).includes('sans-saisies'));
  assert.ok(codes({ name: 'X', fields: {} }).includes('sans-totaux'));
  assert.ok(codes({ name: 'X', fields: { base: '1' } }).includes('sans-totaux'));
  assert.ok(codes(null).includes('vide'));
});

test('un recalcul ne dégrade jamais un bulletin correct', () => {
  const good = ok().totals;
  assert.equal(IG.sanityOfRecalc(good, { grossAll: 470800, totalDeductions: 117207, net: 353593 }).ok, true);
  const empty = IG.sanityOfRecalc(good, { grossAll: 0, totalDeductions: 0, net: 0 });
  assert.equal(empty.ok, false); assert.ok(empty.reasons.includes('brut nul'));
  const noDed = IG.sanityOfRecalc(good, { grossAll: 470800, totalDeductions: 0, net: 470800 });
  assert.equal(noDed.ok, false); assert.ok(noDed.reasons.includes('aucune retenue'));
  assert.equal(IG.sanityOfRecalc(good, { grossAll: 470800, totalDeductions: 100000, net: 1 }).ok, false);
});
