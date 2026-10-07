import test from 'node:test';
import assert from 'node:assert/strict';
await import('../excel-bulletin.js'); // s'attache à globalThis hors navigateur (dépôt en ESM)
const X = globalThis.CorintaBulletinXlsx;

export function sample(over = {}) {
  const earnings = [
    { label: 'Salaire catégoriel', base: 113984, amount: 113984 },
    { label: 'Sursalaire', base: 513292, amount: 513292 },
    { label: 'Indemnité de transport · non imposable', base: 26000, amount: 26000 },
  ];
  const deductions = [
    { label: 'Impôt sur le revenu', base: 627276, amount: 122687 },
    { label: 'TRIMF', base: 627276, amount: 1500 },
    { label: 'IPRES RG · salarié', base: 432000, amount: 24192 },
    { label: 'IPRES RCC · salarié', base: 195276, amount: 4687.0224 },
  ];
  const employer = [
    { label: 'CFCE · employeur', base: 627276, amount: 18818.28 },
    { label: 'IPRES RCC · employeur', base: 195276, amount: 7029.936 },
    { label: 'Heures supplémentaires · 3 h', base: 'Base 1 234 FCFA/h · tranches 2 h à 15% et 1 h à 40%', amount: 100 },
  ];
  const sum = (a) => a.reduce((t, x) => t + x.amount, 0);
  const grossAll = sum(earnings), totalDeductions = sum(deductions);
  return {
    company: { name: 'Premium PME', logo: null }, periodLabel: 'SEPTEMBRE 2026',
    employee: { name: 'Mamadou Moustapha FALL WELE', phone: '—', matCat: 'PR_PME01 · 7B', job: 'Responsable Comptable', conv: 'Barème des travailleurs du commerce · —', family: 'Marié(e) · épouse avec revenu professionnel · 2.5 parts IR', trimfParts: '1 part(s) · Marié(e) · épouse avec revenu professionnel', days: '30 / 30', hire: '04/01/2026 · 8 mois d’ancienneté', ids: '—', pay: '—' },
    lines: { earnings, deductions, employer },
    engine: { net: grossAll - totalDeductions, grossAll, grossFiscal: 627276, totalDeductions, employerCost: grossAll + sum(employer) },
    cards: { cumRights: '16 jours · exigibles dès le 04/01/2027', cumLeaveBalance: '16 jours' }, cardsNum: { cumNonTax: 26000, cumFiscal: 627276 },
    note: 'Le solde de congés acquis est soumis à la période de référence légale de 12 mois.',
    params: { rates: [{ name: 'IPRES RG · salarié', rate: 5.6, cap: 432000, side: 'd' }], tax: [{ limit: 630000, rate: 0 }, { limit: '', rate: 43 }], trimf: [{ limit: 599999, amount: 900 }, { limit: '', amount: 36000 }], refs: ['CGI art. 173-174'] },
    ...over,
  };
}

test('modèle : net recalculé par formule = net du moteur, aucun problème de validation', () => {
  const d = sample(); const m = X.buildModel(d);
  assert.deepEqual(X.validate(m, d), []);
});
test('validation : un net incohérent est refusé', () => {
  const d = sample(); d.engine.net += 10; const m = X.buildModel(d);
  assert.ok(X.validate(m, d).some((x) => x.includes('Net à payer')));
});
test('trois feuilles dont deux masquées et protégées, A4 portrait une page', () => {
  const m = X.buildModel(sample()); const [b, c, p] = m.sheets;
  assert.equal(b.name, 'Bulletin de paie'); assert.ok(!b.hidden);
  assert.ok(c.hidden && c.protect && p.hidden && p.protect);
});
test('export XLSX : signature ZIP et taille raisonnable', async () => {
  const m = X.buildModel(sample()); const blob = X.toBlob(m); const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.readUInt32LE(0), 0x04034b50); assert.ok(buf.length > 4000 && buf.length < 200000);
  if (process.env.WRITE_SAMPLE) (await import('node:fs')).writeFileSync(process.env.WRITE_SAMPLE, buf);
});
test('aperçu HTML : contient les blocs clés', () => {
  const html = X.renderPreview(X.buildModel(sample()));
  for (const t of ['BULLETIN DE PAIE', 'NET À PAYER', 'RETENUES SALARIALES', 'Employeur', 'Salarié']) assert.ok(html.includes(t), t);
});

test('aucune fusion ne se chevauche (Excel demanderait une réparation du fichier)', () => {
  const m = X.buildModel(sample());
  for (const sh of m.sheets) {
    const seen = new Set();
    for (const r of sh.merges) {
      const [a, z] = r.split(':'), p = (x) => /^([A-Z]+)([0-9]+)$/.exec(x), n = (l) => [...l].reduce((t, c) => t * 26 + c.charCodeAt(0) - 64, 0);
      const pa = p(a), pz = p(z);
      for (let y = +pa[2]; y <= +pz[2]; y++) for (let c = n(pa[1]); c <= n(pz[1]); c++) { assert.ok(!seen.has(y + ':' + c), sh.name + ' ' + r); seen.add(y + ':' + c); }
    }
  }
});
