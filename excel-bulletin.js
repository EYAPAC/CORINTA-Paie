/*
 * Corinta Pay — moteur d'export Excel du bulletin de paie (skill corinta-pay-bulletin-excel v1).
 *
 * Séparation calcul / présentation : ce module ne calcule AUCUNE règle de paie. Il reçoit les lignes
 * déjà calculées par le moteur de paie (update() dans index.html), les écrit dans la feuille masquée
 * « Calculs », y construit des formules (SOMME.SI, différences) et relie les cellules visibles de la
 * feuille « Bulletin de paie » à ces formules. Une validation compare le net recalculé par formule
 * au net du moteur de paie et refuse l'export en cas d'écart.
 *
 * Sections : 1. design tokens · 2. styles réutilisables · 3. modèle de feuille · 4. construction
 * (Calculs, Paramètres, Bulletin) · 5. validation · 6. écriture XLSX · 7. aperçu HTML.
 */
(function (root) {
  'use strict';

  /* ───────── 1. Design tokens (tout changement de design se fait ici) ───────── */
  const T = {
    font: 'Arial',
    green: '165C4A', greenSoft: 'C7DBD0', badge: '3C7A69', ink: '18312D', muted: '71817C',
    line: 'DCE5DE', sectionBg: 'F1F6F0', headBg: 'F4F6F2', netBg: 'EAF4E8', white: 'FFFFFF'
  };
  const COL_WIDTHS = [24, 15, 15, 17, 17, 24]; // A..F, en caractères
  const ROW_H = { title: 32, sub: 18, gap: 9, idLabel: 15, idValue: 22, th: 22, section: 21, line: 20, lineTall: 32, total: 24, net: 40, cardLabel: 16, cardLabelTall: 28, cardValue: 28, signLabel: 22, signLine: 42, foot: 52 };
  const NUM = 3;                       // format intégré « #,##0 »
  const MONEY = '#,##0" FCFA"';
  const SHEET_BULLETIN = 'Bulletin de paie', SHEET_CALC = 'Calculs', SHEET_PARAMS = 'Paramètres';

  /* ───────── 2. Styles réutilisables ───────── */
  const bd = (c) => ({ s: 'thin', c: c || T.line });
  const S = {
    band: { fill: T.green },
    title: { sz: 18, b: 1, color: T.white, fill: T.green, h: 'left', v: 'center' },
    sub: { sz: 10, color: T.greenSoft, fill: T.green, h: 'left', v: 'center' },
    badge: { sz: 9, b: 1, color: T.white, fill: T.badge, h: 'center', v: 'center' },
    idLabel: { sz: 8, color: T.muted, h: 'left', v: 'bottom' },
    idValue: { sz: 10, b: 1, color: T.ink, h: 'left', v: 'top', wrap: 1, bd: { b: bd() } },
    thL: { sz: 8, b: 1, color: T.muted, fill: T.headBg, h: 'left', v: 'center' },
    thR: { sz: 8, b: 1, color: T.muted, fill: T.headBg, h: 'right', v: 'center' },
    section: { sz: 9, b: 1, color: T.green, fill: T.sectionBg, h: 'left', v: 'center' },
    lineL: { sz: 9, color: T.ink, h: 'left', v: 'center', wrap: 1, bd: { b: bd('EEF1EC') } },
    lineNum: { sz: 9, color: T.ink, h: 'right', v: 'center', fmt: NUM, bd: { b: bd('EEF1EC') } },
    lineTxtR: { sz: 8, color: T.muted, h: 'right', v: 'center', wrap: 1, bd: { b: bd('EEF1EC') } },
    totalL: { sz: 9, b: 1, color: T.green, fill: T.sectionBg, h: 'left', v: 'center', bd: { t: bd(), b: bd() } },
    totalNum: { sz: 10, b: 1, color: T.green, fill: T.sectionBg, h: 'right', v: 'center', fmt: NUM, bd: { t: bd(), b: bd() } },
    netL: { sz: 12, b: 1, color: T.green, fill: T.netBg, h: 'left', v: 'center', indent: 1 },
    netV: { sz: 20, b: 1, color: T.green, fill: T.netBg, h: 'right', v: 'center', fmt: MONEY, indent: 1 },
    cardLabel: { sz: 8, color: T.muted, h: 'center', v: 'center', wrap: 1, bd: { l: bd(), r: bd(), t: bd() } },
    cardMoney: { sz: 12, b: 1, color: T.ink, h: 'center', v: 'center', fmt: MONEY, bd: { l: bd(), r: bd(), b: bd() } },
    cardText: { sz: 11, b: 1, color: T.ink, h: 'center', v: 'center', wrap: 1, bd: { l: bd(), r: bd(), b: bd() } },
    signLabel: { sz: 10, b: 1, u: 1, color: T.ink, h: 'center', v: 'center' },
    signLine: { sz: 9, color: T.ink, bd: { b: { s: 'thin', c: T.ink } } },
    foot: { sz: 7, color: T.muted, h: 'left', v: 'top', wrap: 1 },
    // feuilles techniques
    techHead: { sz: 9, b: 1, color: T.white, fill: T.green, h: 'left', v: 'center' },
    techText: { sz: 9, color: T.ink, h: 'left', v: 'center', wrap: 1 },
    techNum: { sz: 9, color: T.ink, h: 'right', v: 'center', fmt: '#,##0.00' },
    techNumB: { sz: 9, b: 1, color: T.green, h: 'right', v: 'center', fmt: '#,##0.00', fill: T.sectionBg },
    techTextB: { sz: 9, b: 1, color: T.green, h: 'left', v: 'center', fill: T.sectionBg }
  };

  class Styles {
    constructor() {
      this.fonts = []; this.fills = []; this.borders = []; this.fmts = []; this.xfs = []; this.cache = new Map();
      this._add(this.fonts, { sz: 9, color: T.ink });
      this._add(this.fills, { none: 1 }); this._add(this.fills, { gray: 1 });
      this._add(this.borders, {});
      this._add(this.xfs, { f: 0, fl: 0, b: 0, n: 0, al: null });
    }
    _add(list, obj) { const k = JSON.stringify(obj); let i = list.findIndex((x) => x.k === k); if (i < 0) { list.push({ k, o: obj }); i = list.length - 1; } return i; }
    id(def) {
      const d = def || {};
      const key = JSON.stringify(d); if (this.cache.has(key)) return this.cache.get(key);
      const f = this._add(this.fonts, { sz: d.sz || 9, b: d.b, u: d.u, color: d.color || T.ink });
      const fl = d.fill ? this._add(this.fills, { rgb: d.fill }) : 0;
      const b = d.bd ? this._add(this.borders, d.bd) : 0;
      let n = 0;
      if (typeof d.fmt === 'number') n = d.fmt; else if (d.fmt) n = 164 + this._add(this.fmts, { code: d.fmt });
      const al = (d.h || d.v || d.wrap || d.indent) ? { h: d.h, v: d.v, wrap: d.wrap, indent: d.indent } : null;
      const i = this._add(this.xfs, { f, fl, b, n, al });
      this.cache.set(key, i); return i;
    }
    xml() {
      const side = (name, s) => s ? `<${name} style="${s.s}"><color rgb="FF${s.c}"/></${name}>` : `<${name}/>`;
      const fonts = this.fonts.map(({ o }) => `<font>${o.b ? '<b/>' : ''}${o.u ? '<u/>' : ''}<sz val="${o.sz}"/><color rgb="FF${o.color}"/><name val="${T.font}"/></font>`).join('');
      const fills = this.fills.map(({ o }) => o.none ? '<fill><patternFill patternType="none"/></fill>' : o.gray ? '<fill><patternFill patternType="gray125"/></fill>' : `<fill><patternFill patternType="solid"><fgColor rgb="FF${o.rgb}"/><bgColor indexed="64"/></patternFill></fill>`).join('');
      const borders = this.borders.map(({ o }) => `<border>${side('left', o.l)}${side('right', o.r)}${side('top', o.t)}${side('bottom', o.b)}<diagonal/></border>`).join('');
      const fmts = this.fmts.map(({ o }, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(o.code)}"/>`).join('');
      const xfs = this.xfs.map(({ o }) => {
        const al = o.al ? `<alignment${o.al.h ? ` horizontal="${o.al.h}"` : ''}${o.al.v ? ` vertical="${o.al.v}"` : ''}${o.al.wrap ? ' wrapText="1"' : ''}${o.al.indent ? ` indent="${o.al.indent}"` : ''}/>` : '';
        return `<xf numFmtId="${o.n}" fontId="${o.f}" fillId="${o.fl}" borderId="${o.b}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${o.al ? ' applyAlignment="1"' : ''}>${al}</xf>`;
      }).join('');
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        (fmts ? `<numFmts count="${this.fmts.length}">${fmts}</numFmts>` : '') +
        `<fonts count="${this.fonts.length}">${fonts}</fonts><fills count="${this.fills.length}">${fills}</fills><borders count="${this.borders.length}">${borders}</borders>` +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        `<cellXfs count="${this.xfs.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    }
  }

  /* ───────── 3. Modèle de feuille ───────── */
  function esc(s) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colL(c) { let s = ''; for (; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s; return s; }
  const ref = (r, c) => colL(c) + r;
  /* « B3:D5 » → bornes numériques (sans expression régulière à antislash). */
  function rangeBounds(m) {
    const p = (x) => { const q = /^([A-Z]+)([0-9]+)$/.exec(x); return { c: q[1].split('').reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0), r: +q[2] }; };
    const [a, z] = m.split(':'), A = p(a), Z = p(z);
    return { r1: A.r, c1: A.c, r2: Z.r, c2: Z.c };
  }

  class Sheet {
    constructor(name, o) { Object.assign(this, { name, cols: [], rowH: {}, cells: new Map(), merges: [], hidden: false, protect: false, print: false }, o || {}); }
    put(r, c, o) { this.cells.set(r + ':' + c, Object.assign({ r, c }, o)); }
    /* Écrit un bloc fusionné : style appliqué à toutes les cellules (fonds/bordures), valeur dans la première. */
    block(r, c1, c2, o) {
      for (let c = c1; c <= c2; c++) this.put(r, c, { style: o.style });
      this.put(r, c1, o);
      if (c2 > c1 && o.merge !== false) this.merges.push(ref(r, c1) + ':' + ref(r, c2));
    }
    get maxRow() { let m = 0; this.cells.forEach((x) => { m = Math.max(m, x.r); }); return m; }
  }

  /* ───────── 4. Construction ───────── */
  const num = (v) => (typeof v === 'number' && Number.isFinite(v));
  const parseNum = (s) => { const m = String(s == null ? '' : s).replace(/[\s ]/g, '').match(/^-?\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(',', '.')) : null; };

  /* data attendu :
   *  company {name, logo:Uint8Array|null}, periodLabel, employee {...}, lines {earnings,deductions,employer:[{label,base,amount}]},
   *  engine {net, grossAll, grossFiscal, totalDeductions, employerCost}, cards {cumNonTax,cumFiscal,cumRights,cumLeaveBalance (texte)},
   *  note, params {rates,tax,trimf,refs} */
  function buildModel(data) {
    const st = new Styles(), id = (k) => st.id(S[k]);
    const sum = (a) => a.reduce((t, x) => t + (+x.amount || 0), 0);
    const L = data.lines;

    /* — Calculs (masquée, protégée) — */
    const calc = new Sheet(SHEET_CALC, { hidden: true, protect: true, cols: [12, 52, 22, 20] });
    ['Type', 'Rubrique', 'Base', 'Montant'].forEach((h, i) => calc.put(1, i + 1, { v: h, style: id('techHead') }));
    calc.rowH[1] = 20;
    let r = 2; const rows = [];
    [['GAIN', L.earnings], ['RETENUE', L.deductions], ['PATRONAL', L.employer]].forEach(([type, list]) => list.forEach((x) => {
      calc.put(r, 1, { v: type, style: id('techText') });
      calc.put(r, 2, { v: x.label, style: id('techText') });
      calc.put(r, 3, num(x.base) ? { v: x.base, style: id('techNum') } : { v: String(x.base == null ? '' : x.base), style: id('techText') });
      calc.put(r, 4, { v: +x.amount || 0, style: id('techNum') });
      x._row = r; rows.push(x); r++;
    }));
    const last = r - 1, s0 = r + 1, rng = (c) => `${c}2:${c}${last}`;
    const grossAll = sum(L.earnings), ded = sum(L.deductions), emp = sum(L.employer), net = grossAll - ded;
    const lab = (row, text) => calc.put(row, 2, { v: text, style: id('techTextB') });
    const fRow = (row, text, f, v) => { lab(row, text); calc.put(row, 4, { f, v, style: id('techNumB') }); };
    fRow(s0, 'Total brut (gains)', `SUMIF(${rng('A')},"GAIN",${rng('D')})`, grossAll);
    fRow(s0 + 1, 'Total retenues salariales', `SUMIF(${rng('A')},"RETENUE",${rng('D')})`, ded);
    fRow(s0 + 2, 'Net à payer (calculé)', `D${s0}-D${s0 + 1}`, net);
    fRow(s0 + 3, 'Charges patronales', `SUMIF(${rng('A')},"PATRONAL",${rng('D')})`, emp);
    fRow(s0 + 4, 'Coût employeur estimé', `D${s0}+D${s0 + 3}`, grossAll + emp);
    const inRow = (row, text, v, isText) => { lab(row, text); calc.put(row, 4, { v, style: isText ? id('techText') : id('techNum') }); };
    inRow(s0 + 5, 'Brut imposable (moteur de paie)', data.engine.grossFiscal);
    inRow(s0 + 6, 'Cumul brut non imposable', data.cardsNum.cumNonTax);
    inRow(s0 + 7, 'Cumul brut fiscal', data.cardsNum.cumFiscal);
    inRow(s0 + 8, 'Congés acquis à la fin de la période', data.cards.cumRights, true);
    inRow(s0 + 9, 'Solde après congés pris', data.cards.cumLeaveBalance, true);
    inRow(s0 + 10, 'Net à payer (moteur de paie)', data.engine.net);
    fRow(s0 + 11, 'Contrôle : écart calculé − moteur (doit être 0)', `ROUND(D${s0 + 2}-D${s0 + 10},0)`, Math.round(net - data.engine.net));
    const K = { gross: s0, ded: s0 + 1, net: s0 + 2, emp: s0 + 3, cost: s0 + 4, fiscal: s0 + 5, cumNon: s0 + 6, cumFis: s0 + 7, rights: s0 + 8, bal: s0 + 9, engine: s0 + 10, check: s0 + 11 };
    calc.rowH[s0] = 20;

    /* — Paramètres (masquée, protégée) — */
    const par = new Sheet(SHEET_PARAMS, { hidden: true, protect: true, cols: [46, 14, 18, 16] });
    ['Cotisation / barème', 'Taux (%)', 'Plafond / seuil', 'Côté'].forEach((h, i) => par.put(1, i + 1, { v: h, style: id('techHead') }));
    let pr = 2;
    (data.params.rates || []).forEach((x) => { par.put(pr, 1, { v: x.name, style: id('techText') }); par.put(pr, 2, { v: +x.rate || 0, style: id('techNum') }); par.put(pr, 3, { v: +x.cap || 0, style: id('techNum') }); par.put(pr, 4, { v: x.side === 'e' ? 'Employeur' : 'Salarié', style: id('techText') }); pr++; });
    pr++; par.put(pr++, 1, { v: 'Barème IR (revenu annuel imposable)', style: id('techTextB') });
    (data.params.tax || []).forEach((x) => { par.put(pr, 1, { v: x.limit === '' || x.limit == null ? 'Au-delà' : 'Jusqu’à ' + x.limit, style: id('techText') }); par.put(pr, 2, { v: +x.rate || 0, style: id('techNum') }); pr++; });
    pr++; par.put(pr++, 1, { v: 'Barème TRIMF (revenu brut annuel)', style: id('techTextB') });
    (data.params.trimf || []).forEach((x) => { par.put(pr, 1, { v: x.limit === '' || x.limit == null ? 'Au-delà' : 'Jusqu’à ' + x.limit, style: id('techText') }); par.put(pr, 3, { v: +x.amount || 0, style: id('techNum') }); pr++; });
    pr++; par.put(pr++, 1, { v: 'Références légales', style: id('techTextB') });
    (data.params.refs || []).forEach((t) => { par.block(pr, 1, 4, { v: t, style: id('techText') }); par.rowH[pr] = 30; pr++; });

    /* — Bulletin de paie (visible) — */
    const b = new Sheet(SHEET_BULLETIN, { cols: COL_WIDTHS, print: true });
    const hasLogo = !!(data.company.logo && data.company.logo.length);
    const tc = hasLogo ? 2 : 1;
    let y = 1;
    b.rowH[y] = ROW_H.title; b.block(y, 1, 6, { style: id('band'), merge: false });
    b.block(y, tc, 4, { v: 'BULLETIN DE PAIE', style: id('title') });
    b.block(y, 5, 6, { v: data.periodLabel || 'PÉRIODE —', style: id('badge') });
    y++; b.rowH[y] = ROW_H.sub; b.block(y, 1, 6, { style: id('band'), merge: false });
    b.block(y, tc, 4, { v: data.company.name || '—', style: id('sub') });
    y++; b.rowH[y] = ROW_H.gap; b.block(y, 1, 6, { style: id('band'), merge: false });
    y++; b.rowH[y] = ROW_H.gap;

    const E = data.employee;
    const idRows = [
      [['Salarié', E.name], ['Téléphone', E.phone], ['Matricule · Catégorie', E.matCat]],
      [['Emploi', E.job], ['Convention · Statut', E.conv], ['Situation · Parts IR', E.family]],
      [['Parts TRIMF', E.trimfParts], ['Jours rémunérés', E.days], ['Embauche · Ancienneté', E.hire]],
      [['IPRES · CSS', E.ids], ['Règlement', E.pay], ['', '']]
    ];
    idRows.forEach((grp) => {
      y++; b.rowH[y] = ROW_H.idLabel;
      grp.forEach(([l], i) => b.block(y, 1 + i * 2, 2 + i * 2, { v: l, style: id('idLabel') }));
      y++; b.rowH[y] = ROW_H.idValue;
      grp.forEach(([l, v], i) => b.block(y, 1 + i * 2, 2 + i * 2, { v: l ? (v || '—') : '', style: id('idValue') }));
    });
    y++; b.rowH[y] = ROW_H.gap;

    y++; b.rowH[y] = ROW_H.th;
    b.block(y, 1, 2, { v: 'RUBRIQUES', style: id('thL') }); b.block(y, 3, 4, { v: 'BASE', style: id('thR') });
    b.put(y, 5, { v: 'GAINS', style: id('thR') }); b.put(y, 6, { v: 'RETENUES', style: id('thR') });
    const section = (t) => { y++; b.rowH[y] = ROW_H.section; b.block(y, 1, 6, { v: t, style: id('section') }); };
    const line = (x, amountCol) => {
      y++;
      const textBase = !num(x.base) && String(x.base == null ? '' : x.base).length > 0;
      b.rowH[y] = (textBase && String(x.base).length > 34) || x.label.length > 44 ? ROW_H.lineTall : ROW_H.line;
      b.block(y, 1, 2, { v: x.label, style: id('lineL') });
      if (num(x.base)) b.block(y, 3, 4, { f: `${SHEET_CALC}!C${x._row}`, v: x.base, style: id('lineNum') });
      else b.block(y, 3, 4, { v: textBase ? String(x.base) : '', style: id('lineTxtR') });
      for (const c of [5, 6]) {
        if (c === amountCol) b.put(y, c, { f: `${SHEET_CALC}!D${x._row}`, v: +x.amount || 0, style: id('lineNum') });
        else b.put(y, c, { style: id('lineNum') });
      }
    };
    section('GAINS ET INDEMNITÉS'); L.earnings.forEach((x) => line(x, 5));
    y++; b.rowH[y] = ROW_H.total;
    b.block(y, 1, 4, { v: 'TOTAL BRUT · SALAIRE + SURSALAIRE + INDEMNITÉS', style: id('totalL') });
    b.put(y, 5, { f: `${SHEET_CALC}!D${K.gross}`, v: grossAll, style: id('totalNum') }); b.put(y, 6, { style: id('totalNum') });
    section('RETENUES SALARIALES'); L.deductions.forEach((x) => line(x, 6));
    section('CHARGES PATRONALES · INFORMATION'); L.employer.forEach((x) => line(x, 5));

    y++; b.rowH[y] = ROW_H.gap;
    y++; b.rowH[y] = ROW_H.net;
    b.block(y, 1, 3, { v: 'NET À PAYER', style: id('netL') });
    b.block(y, 4, 6, { f: `${SHEET_CALC}!D${K.net}`, v: net, style: id('netV') });
    y++; b.rowH[y] = ROW_H.gap;

    const cards3 = [['Brut imposable', `${SHEET_CALC}!D${K.fiscal}`, data.engine.grossFiscal], ['Total retenues', `${SHEET_CALC}!D${K.ded}`, ded], ['Coût employeur estimé', `${SHEET_CALC}!D${K.cost}`, grossAll + emp]];
    y++; b.rowH[y] = ROW_H.cardLabel; cards3.forEach(([l], i) => b.block(y, 1 + i * 2, 2 + i * 2, { v: l, style: id('cardLabel') }));
    y++; b.rowH[y] = ROW_H.cardValue; cards3.forEach(([, f, v], i) => b.block(y, 1 + i * 2, 2 + i * 2, { f, v, style: id('cardMoney') }));
    y++; b.rowH[y] = ROW_H.gap;

    const spans = [[1, 1], [2, 3], [4, 5], [6, 6]];
    const cards4 = [
      ['Cumul brut non imposable', `${SHEET_CALC}!D${K.cumNon}`, data.cardsNum.cumNonTax, 'cardMoney'],
      ['Cumul brut fiscal', `${SHEET_CALC}!D${K.cumFis}`, data.cardsNum.cumFiscal, 'cardMoney'],
      ['Congés acquis à la fin de la période', `${SHEET_CALC}!D${K.rights}`, data.cards.cumRights, 'cardText'],
      ['Solde après congés pris', `${SHEET_CALC}!D${K.bal}`, data.cards.cumLeaveBalance, 'cardText']
    ];
    y++; b.rowH[y] = ROW_H.cardLabelTall; cards4.forEach(([l], i) => b.block(y, spans[i][0], spans[i][1], { v: l, style: id('cardLabel') }));
    y++; b.rowH[y] = ROW_H.cardValue + 8; cards4.forEach(([, f, v, s], i) => b.block(y, spans[i][0], spans[i][1], { f, v, style: id(s) }));
    y++; b.rowH[y] = ROW_H.gap + 8;

    y++; b.rowH[y] = ROW_H.signLabel;
    b.block(y, 1, 2, { v: 'Employeur', style: id('signLabel') }); b.block(y, 4, 5, { v: 'Salarié', style: id('signLabel') });
    y++; b.rowH[y] = ROW_H.signLine;
    b.block(y, 1, 2, { style: id('signLine') }); b.block(y, 4, 5, { style: id('signLine') });
    y++; b.rowH[y] = ROW_H.gap;
    const noteLines = String(data.note || '').split(String.fromCharCode(10)).reduce((t, l) => t + Math.max(1, Math.ceil(l.length / 140)), 0);
    y++; b.rowH[y] = Math.min(400, Math.max(ROW_H.foot, noteLines * 9.5 + 8)); b.block(y, 1, 6, { v: data.note || '', style: id('foot') });
    b.lastRow = y;

    return { sheets: [b, calc, par], styles: st, K, calcLast: last, logo: hasLogo ? data.company.logo : null, totals: { grossAll, ded, emp, net } };
  }

  /* ───────── 5. Validation avant export ───────── */
  function validate(model, data) {
    const issues = [], t = model.totals;
    if (Math.abs(t.net - data.engine.net) > 0.5) issues.push(`Net à payer recalculé (${Math.round(t.net)}) différent du moteur de paie (${Math.round(data.engine.net)}).`);
    if (Math.abs(t.grossAll - data.engine.grossAll) > 0.5) issues.push('Total brut recalculé différent du moteur de paie.');
    if (Math.abs(t.ded - data.engine.totalDeductions) > 0.5) issues.push('Total des retenues recalculé différent du moteur de paie.');
    if (!data.lines.earnings.length) issues.push('Aucune rubrique de gain.');
    model.sheets.forEach((sh) => sh.cells.forEach((c) => {
      if (typeof c.v === 'string' && /^#(REF|VALUE|DIV\/0|NAME|N\/A|NUM)/.test(c.v)) issues.push(`${sh.name}!${ref(c.r, c.c)} contient une erreur.`);
      if (c.f && !/^[A-Za-z_]/.test(c.f) && !/^(SUMIF|ROUND)/.test(c.f)) issues.push(`Formule suspecte ${sh.name}!${ref(c.r, c.c)}.`);
      if (c.f && c.v === undefined) issues.push(`Formule sans résultat en cache ${sh.name}!${ref(c.r, c.c)}.`);
    }));
    model.sheets.forEach((sh) => {
      const seen = new Map();
      sh.merges.forEach((m) => {
        const q = rangeBounds(m);
        for (let r = q.r1; r <= q.r2; r++) for (let c = q.c1; c <= q.c2; c++) {
          const k = r + ':' + c;
          if (seen.has(k)) issues.push(`Fusions qui se chevauchent dans « ${sh.name} » (${seen.get(k)} / ${m}).`);
          seen.set(k, m);
        }
      });
    });
    if (model.sheets[0].lastRow < 40) issues.push('Mise en page incomplète.');
    return issues;
  }

  /* ───────── 6. Écriture XLSX ───────── */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    const w16 = (v) => [v & 255, (v >>> 8) & 255], w32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    Object.keys(files).forEach((name) => {
      const nb = enc.encode(name), raw = files[name], data = raw instanceof Uint8Array ? raw : enc.encode(raw), crc = crc32(data);
      const lh = new Uint8Array([...w32(0x04034b50), ...w16(20), ...w16(0x0800), ...w16(0), ...w16(0), ...w16(0), ...w32(crc), ...w32(data.length), ...w32(data.length), ...w16(nb.length), ...w16(0), ...nb]);
      parts.push(lh, data);
      central.push(new Uint8Array([...w32(0x02014b50), ...w16(20), ...w16(20), ...w16(0x0800), ...w16(0), ...w16(0), ...w16(0), ...w32(crc), ...w32(data.length), ...w32(data.length), ...w16(nb.length), ...w16(0), ...w16(0), ...w16(0), ...w16(0), ...w32(0), ...w32(off), ...nb]));
      off += lh.length + data.length;
    });
    const cl = central.reduce((a, x) => a + x.length, 0);
    const end = new Uint8Array([...w32(0x06054b50), ...w16(0), ...w16(0), ...w16(central.length), ...w16(central.length), ...w32(cl), ...w32(off), ...w16(0)]);
    return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function cellXml(sh, c, styles) {
    const a = ref(c.r, c.c), s = c.style != null ? ` s="${c.style}"` : '';
    if (c.f) {
      const f = `<f>${esc(c.f)}</f>`;
      return typeof c.v === 'string' ? `<c r="${a}"${s} t="str">${f}<v>${esc(c.v)}</v></c>` : `<c r="${a}"${s}>${f}<v>${c.v}</v></c>`;
    }
    if (c.v === undefined || c.v === '') return `<c r="${a}"${s}/>`;
    if (typeof c.v === 'number') return `<c r="${a}"${s}><v>${c.v}</v></c>`;
    return `<c r="${a}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
  }

  function sheetXml(sh, idx, hasDrawing) {
    const byRow = new Map(); sh.cells.forEach((c) => { if (!byRow.has(c.r)) byRow.set(c.r, []); byRow.get(c.r).push(c); });
    const rowsXml = [...byRow.keys()].sort((x, y) => x - y).map((r) => {
      const ht = sh.rowH[r] ? ` ht="${sh.rowH[r]}" customHeight="1"` : '';
      return `<row r="${r}"${ht}>` + byRow.get(r).sort((p, q) => p.c - q.c).map((c) => cellXml(sh, c)).join('') + '</row>';
    }).join('');
    const maxR = sh.maxRow || 1, maxC = Math.max(...[...sh.cells.values()].map((c) => c.c), 1);
    const cols = sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      (sh.print ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') +
      `<dimension ref="A1:${ref(maxR, maxC)}"/><sheetViews><sheetView ${idx === 0 ? 'tabSelected="1" ' : ''}showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
      `<cols>${cols}</cols><sheetData>${rowsXml}</sheetData>` +
      (sh.protect ? '<sheetProtection sheet="1" objects="1" scenarios="1"/>' : '') +
      (sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
      (sh.print ? '<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.55" header="0.25" footer="0.25"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/><headerFooter><oddFooter>&amp;L&amp;8Corinta Pay&amp;R&amp;8Bulletin de paie · page &amp;P / &amp;N</oddFooter></headerFooter>' : '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>') +
      (hasDrawing ? '<drawing r:id="rId1"/>' : '') + '</worksheet>';
  }

  function toBlob(model) {
    const [b, calc, par] = model.sheets, logo = model.logo, REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const files = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + (logo ? '<Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '') + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${SHEET_BULLETIN}" sheetId="1" r:id="rId1"/><sheet name="${SHEET_CALC}" sheetId="2" state="hidden" r:id="rId2"/><sheet name="${esc(SHEET_PARAMS)}" sheetId="3" state="hidden" r:id="rId3"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${SHEET_BULLETIN}'!$A$1:$F$${b.lastRow}</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${REL}/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': model.styles.xml(),
      'xl/worksheets/sheet1.xml': sheetXml(b, 0, !!logo),
      'xl/worksheets/sheet2.xml': sheetXml(calc, 1, false),
      'xl/worksheets/sheet3.xml': sheetXml(par, 2, false)
    };
    if (logo) {
      const be32 = (o) => ((logo[o] << 24) | (logo[o + 1] << 16) | (logo[o + 2] << 8) | logo[o + 3]) >>> 0;
      const iw = be32(16), ih = be32(20), k = Math.min(1, 84 / iw, 56 / ih), cx = Math.round(iw * k * 9525), cy = Math.round(ih * k * 9525);
      files['xl/worksheets/_rels/sheet1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
      files['xl/drawings/drawing1.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>76200</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo entreprise"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
      files['xl/drawings/_rels/drawing1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/image" Target="../media/company-logo.png"/></Relationships>`;
      files['xl/media/company-logo.png'] = logo;
    }
    return zip(files);
  }

  /* ───────── 7. Aperçu HTML (même modèle que le fichier exporté) ───────── */
  function renderPreview(model) {
    const b = model.sheets[0], st = model.styles, px = (w) => Math.round(w * 7 + 5);
    const covered = new Set(), anchors = new Map();
    b.merges.forEach((m) => {
      const [a, z] = m.split(':'), pa = a.match(/([A-Z]+)(\d+)/), pz = z.match(/([A-Z]+)(\d+)/);
      const toN = (s) => s.split('').reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0);
      const c1 = toN(pa[1]), c2 = toN(pz[1]), r1 = +pa[2], r2 = +pz[2];
      anchors.set(r1 + ':' + c1, { cs: c2 - c1 + 1, rs: r2 - r1 + 1 });
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (!(r === r1 && c === c1)) covered.add(r + ':' + c);
    });
    const fmtVal = (c) => {
      const v = c.v; if (v === undefined || v === '') return '';
      if (typeof v !== 'number') return esc(v);
      const n = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(v));
      const d = st.xfs[c.style] && st.xfs[c.style].o, code = d && d.n >= 164 ? st.fmts[d.n - 164].o.code : '';
      return n + (code.includes('FCFA') ? ' FCFA' : '');
    };
    const css = (c) => {
      const o = st.xfs[c.style] ? st.xfs[c.style].o : null; if (!o) return '';
      const f = st.fonts[o.f].o, fill = st.fills[o.fl].o, bo = st.borders[o.b].o, al = o.al || {};
      const side = (n, s) => s ? `border-${n}:1px solid #${s.c};` : '';
      return `font-size:${f.sz}pt;color:#${f.color};${f.b ? 'font-weight:700;' : ''}${f.u ? 'text-decoration:underline;' : ''}${fill.rgb ? `background:#${fill.rgb};` : ''}text-align:${al.h || 'left'};vertical-align:${al.v === 'center' ? 'middle' : al.v === 'bottom' ? 'bottom' : 'top'};${al.wrap ? 'white-space:normal;' : 'white-space:nowrap;'}${al.indent ? `padding-left:${al.indent * 8}px;padding-right:${al.indent * 8}px;` : 'padding:0 4px;'}${side('left', bo.l)}${side('right', bo.r)}${side('top', bo.t)}${side('bottom', bo.b)}`;
    };
    let h = `<table style="border-collapse:collapse;table-layout:fixed;margin:0 auto;font-family:${T.font},sans-serif;background:#fff;width:${b.cols.reduce((t, w) => t + px(w), 0)}px"><colgroup>${b.cols.map((w) => `<col style="width:${px(w)}px">`).join('')}</colgroup>`;
    for (let r = 1; r <= b.lastRow; r++) {
      h += `<tr style="height:${Math.round((b.rowH[r] || 15) * 1.333)}px">`;
      for (let c = 1; c <= b.cols.length; c++) {
        const k = r + ':' + c; if (covered.has(k)) continue;
        const cell = b.cells.get(k) || { style: 0 }, an = anchors.get(k);
        h += `<td${an ? ` colspan="${an.cs}" rowspan="${an.rs}"` : ''} style="${css(cell)}overflow:hidden">${fmtVal(cell)}</td>`;
      }
      h += '</tr>';
    }
    return h + '</table>';
  }

  const api = { buildModel, validate, toBlob, renderPreview, _internals: { Styles, S, T } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaBulletinXlsx = api;
})(typeof window !== 'undefined' ? window : globalThis);
