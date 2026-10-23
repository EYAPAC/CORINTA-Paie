/*
 * Corinta Pay — gestion des contrats de travail et DMT (interface du dossier d'entreprise).
 *
 * Menu du dossier › Contrats :
 *   • Élaboration de contrat : formulaire du contrat (modèle CDI/CDD) puis onglet DMT. Les informations saisies dans le contrat
 *     sont reprises automatiquement dans la DMT (lecture seule) ; la DMT ne demande que les compléments (immatriculations,
 *     pièce d'identité, visas, situation militaire…).
 *   • Gestion des contrats : liste, filtres, alertes (fin d'essai, échéance de CDD, DMT à établir), statuts, impression.
 *
 * Données : company.contracts (dans le dossier de l'entreprise : isolation par entreprise, sauvegarde et synchronisation
 * identiques aux autres données). Règles pures : contracts-core.js (testées).
 */
(function () {
  'use strict';
  const K = window.CorintaContracts, WS = window.CorintaWS, D = window.CorintaDash;
  if (!K || !WS || !D || typeof WS.registerModule !== 'function') { console.error('contracts.js : modules requis introuvables'); return; }

  const $ = (id) => document.getElementById(id);
  const esc = D.esc, icon = D.icon;
  const todayISO = () => new Date().toLocaleDateString('sv-SE');
  const str = (v) => (v == null ? '' : String(v).trim());
  const frDate = (iso) => { const p = String(iso || '').split('-'); return p.length === 3 && p[0] ? p[2] + '/' + p[1] + '/' + p[0] : ''; };
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const longDate = (iso) => { const p = String(iso || '').split('-').map(Number); return p.length === 3 && p[0] ? String(p[2]).padStart(2, '0') + ' ' + MOIS[p[1] - 1][0].toUpperCase() + MOIS[p[1] - 1].slice(1) + ' ' + p[0] : ''; };
  const money = (v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(Number(v) || 0)).replace(/ | /g, ' ');
  const WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'];
  const inWords = (n) => { n = Math.round(Number(n) || 0); return (WORDS[n] || String(n)) + ' (' + String(n).padStart(2, '0') + ')'; };

  /* ───────── État de l'écran (par entreprise) ───────── */
  const view = { companyId: '', draft: null, tab: 'contract', q: '', fStatus: '', fType: '', msg: '', timer: 0, derivedTimer: 0, dirty: false };
  const company = () => ORG.items.find((c) => c.id === WS.state.companyId);
  const contractsOf = (c) => (Array.isArray(c.contracts) ? c.contracts : (c.contracts = []));
  function ensureView() {
    const c = company();
    if (view.companyId !== (c && c.id)) { Object.assign(view, { companyId: c && c.id, draft: null, tab: 'contract', q: '', fStatus: '', fType: '', msg: '', dirty: false }); }
    if (!view.draft && c) view.draft = K.blankContract(c, todayISO());
    return c;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = v; }

  /* ───────── Enregistrement ───────── */
  function commit(opts) {
    const c = company(), d = view.draft; if (!c || !d) return false;
    if (!str(d.worker.nom) || !str(d.worker.prenoms)) { setMsg('Saisissez le nom et les prénoms : l’enregistrement est alors automatique.', true); return false; }
    const list = contractsOf(c);
    d.updatedAt = todayISO(); if (!d.createdAt) d.createdAt = d.updatedAt;
    if (!d.number) d.number = K.nextNumber(list, d.updatedAt);
    const i = list.findIndex((x) => x.id === d.id); if (i >= 0) list[i] = clone(d); else list.unshift(clone(d));
    c.profile = Object.assign({}, c.profile, { siege: d.employer.siege, representant: d.employer.representant, qualite: d.employer.qualite, activite: d.employer.activite, signataire: d.employer.signataire, ville: d.job.lieuSignature });
    persistOrg(); view.dirty = false;
    setMsg('Enregistré · ' + new Date().toLocaleTimeString('fr-FR') + ' · ' + d.number); refreshMeta();
    return true;
  }
  function setMsg(text, bad) { view.msg = text; const el = $('ctStatus'); if (el) { el.textContent = text; el.style.color = bad ? '#8a5300' : ''; } }
  const queueCommit = () => { clearTimeout(view.timer); view.timer = setTimeout(() => commit(), 450); };

  /* ───────── Calcul du net estimé avec le moteur de paie (sans toucher à la saisie en cours) ───────── */
  function payFields(d) {
    const w = d.worker, s = d.salary, t = K.salaryTotals(s), married = w.famille === 'marie';
    const spouse = !married ? 'single' : (w.sexe === 'F' ? (w.conjointRevenus ? 'husband-income' : 'husband-no-income') : (w.conjointRevenus ? 'wife-income' : 'wife-no-income'));
    const rub = [];
    if (t.logement > 0) rub.push({ name: 'Indemnité de logement', type: 'g', value: t.logement });
    if (t.anciennete > 0) rub.push({ name: 'Prime d’ancienneté', type: 'g', value: t.anciennete });
    return { name: K.fullName(w), job: d.job.emploi, hire: K.iso(d.job.dateEngagement), period: (K.iso(d.job.dateEngagement) || todayISO()).slice(0, 7), base: String(t.base), extra: String(t.sursalaire), transport: String(t.transport), days: '30', children: String(Math.max(0, Math.round(K.num(w.enfants)))), trimfStatus: spouse, married: married ? '1' : '0', extraRubrics: rub };
  }
  function estimateNet(d) {
    try {
      const keep = employeeFields(), keepName = $('companyName').value, keepEmp = ACTIVE_EMPLOYEE;
      try { restorePayrollFields(payFields(d), true); return { net: Math.round(window.payrollSnapshot.net), ded: Math.round(window.payrollSnapshot.totalDeductions) }; }
      finally { ACTIVE_EMPLOYEE = keepEmp; $('companyName').value = keepName; restorePayrollFields(keep, true); }
    } catch (e) { console.error('Estimation du net', e); return null; }
  }
  function prepareBulletin() {
    const d = view.draft, v = K.validate(d); if (!commit()) return;
    if (!v.valid) { setMsg('Complétez le contrat avant de préparer le bulletin.', true); render(); return; }
    ACTIVE_EMPLOYEE = ''; restorePayrollFields(payFields(d), false);
    $('companyName').value = d.employer.name || $('companyName').value;
    activateView('pay'); toast('Bulletin préparé depuis le contrat ' + d.number + ' : vérifiez puis enregistrez');
  }

  /* ───────── Documents imprimables (modèles fournis) ───────── */
  const DOC_CSS = '.ctdoc{background:#fff;color:#111;box-sizing:border-box;width:100%;max-width:794px;margin:0 auto;padding:34px 44px;font:12.5px/1.5 "Times New Roman",Times,serif}.ctdoc *{box-sizing:border-box}.ctdoc h1{font-size:19px;text-align:center;margin:0;letter-spacing:.5px}.ctdoc h2{font-size:14px;text-align:center;margin:2px 0 16px}.ctdoc p{margin:0 0 7px;text-align:justify}.ctdoc .row{margin:2px 0}.ctdoc .u{border-bottom:1px solid #111;padding:0 6px;font-weight:700}.ctdoc .art{margin:11px 0 3px;font-weight:700}.ctdoc ol{margin:3px 0 6px 18px;padding:0}.ctdoc li{margin-bottom:4px;text-align:justify}.ctdoc table.sal{border-collapse:collapse;margin:6px 0}.ctdoc table.sal td{padding:2px 22px 2px 0}.ctdoc .sign{display:flex;justify-content:space-between;margin-top:26px}.ctdoc .sign div{width:44%;min-height:110px}.ctdoc .center{text-align:center}' +
    '.ctdoc.dmt{font:9.4px/1.35 Arial,Helvetica,sans-serif;padding:22px 30px}.ctdoc.dmt h1{font-size:13px;text-align:left}.ctdoc.dmt .top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.ctdoc.dmt .stamp{width:42%;min-height:70px;border:1px solid #111;padding:5px 7px;text-align:center;font-size:9px}.ctdoc.dmt .refs{font-size:8.6px;margin:5px 0}.ctdoc.dmt .box{display:inline-block;min-width:20px;border:1px solid #111;text-align:center;padding:1px 4px;margin-right:2px}.ctdoc.dmt .objet span{display:inline-block;margin:1px 8px 1px 0}.ctdoc.dmt .objet span.sel{border:1.5px solid #111;padding:0 4px;font-weight:700}.ctdoc.dmt .sec{font-weight:700;margin:7px 0 2px;text-transform:uppercase}.ctdoc.dmt .l{margin:1.5px 0;display:flex;flex-wrap:wrap;gap:3px 14px}.ctdoc.dmt .l b{font-weight:700}.ctdoc.dmt .fill{border-bottom:1px dotted #111;padding:0 4px;min-width:90px;display:inline-block;font-weight:700}.ctdoc.dmt table.sal{width:74%;border-collapse:collapse;margin:3px 0}.ctdoc.dmt table.sal td{border:1px solid #111;padding:2px 6px}.ctdoc.dmt table.sal td:last-child{text-align:right;font-weight:700;width:30%}.ctdoc.dmt .note{font-size:8px;margin-top:6px}.ctdoc.dmt .sign{margin-top:12px}.ctdoc.dmt .sign div{min-height:62px}';
  const val = (v, w) => '<span class="u">' + (esc(str(v)) || '&nbsp;'.repeat(w || 8)) + '</span>';

  function contractDoc(d) {
    const w = d.worker, j = d.job, e = d.employer, s = K.salaryTotals(d.salary), cdd = j.type === 'CDD';
    const fem = w.sexe === 'F', fa = fem ? 'Madame' : (w.civilite || 'Monsieur');
    const fam = (K.FAMILLE[w.famille] || '') + (K.num(w.enfants) > 0 ? ', ' + String(Math.round(K.num(w.enfants))).padStart(2, '0') + ' enfant' + (K.num(w.enfants) > 1 ? 's' : '') : '');
    const essai = K.num(j.essaiMois) > 0
      ? 'Le présent contrat est conclu avec une période d’essai de ' + inWords(j.essaiMois) + ' mois' + (j.essaiRenouvelable ? ', renouvelable tacitement' : '') + ', au cours de laquelle chacune des parties pourra y mettre fin conformément aux dispositions légales et réglementaires en vigueur.'
      : 'Le présent contrat est conclu sans période d’essai.';
    const horaire = K.num(j.horaire) > 0 ? 'L’horaire de travail est en principe de ' + K.num(j.horaire) + ' heures par semaine' + (K.num(j.horaire) === 40 ? ', soit 173,33 heures le mois' : '') + '.' : '';
    const refs = (d.clauses.references || []).filter((r) => str(r)).map((r, i) => '<li>' + esc(r) + '</li>').join('');
    const salRows = [['Salaire de base', s.base], ['Sursalaire', s.sursalaire]].concat(s.logement > 0 ? [['Indemnité de logement', s.logement]] : [], s.anciennete > 0 ? [['Prime d’ancienneté (' + K.num(d.salary.anciennetePct) + ' %)', s.anciennete]] : [], [['Indemnité de transport', s.transport]]);
    return '<div class="ctdoc"><h1>CONTRAT DE TRAVAIL</h1><h2>' + (cdd ? 'A DUREE DETERMINEE' : 'A DUREE INDETERMINEE') + '</h2>' +
      '<p><b>Entre les Soussignés :</b></p><p>' + esc(e.name) + (e.siege ? ' dont le siège social est situé à ' + esc(e.siege) : '') + (e.representant ? ', représenté par ' + esc(e.representant) + (e.qualite ? ', en sa qualité de ' + esc(e.qualite) : '') : '') + '</p><p><b>Désigné(e) ci-après « L’employeur »</b></p>' +
      '<p><b>Et,</b></p><p>' + esc(fa) + ',</p>' +
      '<div class="row">Nom : ' + val(str(w.nom).toUpperCase(), 14) + '</div><div class="row">Prénoms : ' + val(w.prenoms, 14) + '</div>' +
      '<div class="row">Date et Lieu de Naissance : ' + val((frDate(w.naissance) || '') + (w.lieuNaissance ? ' à ' + w.lieuNaissance : ''), 14) + '</div><div class="row">Nationalité : ' + val(w.nationalite, 10) + '</div>' +
      '<div class="row">Filiation : ' + val((fem ? 'Fille de ' : 'Fils de ') + (w.pere || '…') + ' et ' + (w.mere || '…'), 14) + '</div><div class="row">Situation de Famille : ' + val(fam, 10) + '</div><div class="row">Domicilié(e) : ' + val(w.domicile, 14) + '</div>' +
      '<p style="margin-top:8px"><b>Désigné(e) ci-après « LE TRAVAILLEUR »</b></p>' +
      '<p>Il a été conclu le Contrat de Travail aux clauses ci-dessous, conformément aux dispositions du décret N° 63-00-118 /MFPT/DTSS du 19 Février 1963 fixant les formes et modalités d’établissement du contrat du travail et de l’engagement à l’essai.</p>' +
      '<div class="row"><b>I. EMPLOI TENU :</b> ' + val(j.emploi, 14) + '</div><div class="row"><b>II. CLASSIFICATION PROFESSIONNELLE :</b> ' + val(j.classification, 12) + '</div><div class="row"><b>III. DATE DE L’ENGAGEMENT :</b> ' + val(frDate(j.dateEngagement), 10) + '</div>' +
      '<div class="row"><b>IV. DUREE DU CONTRAT :</b> ' + val(cdd ? 'Durée déterminée, du ' + frDate(j.dateEngagement) + ' au ' + frDate(j.dateFin) : 'Durée Indéterminée', 12) + '</div>' +
      '<div class="art">V. REFERENCES AUX TEXTES REGISSANT LE CONTRAT :</div><ol>' + refs + '</ol>' +
      '<div class="art">VI. CONDITIONS PARTICULIERES</div><p>' + esc(essai) + ' ' + esc(horaire) + '</p>' +
      '<p><b>Lieu et durée de travail :</b> ' + esc(fa) + ' ' + esc(K.fullName(w)) + ' est amené(e) à assumer la fonction ' + esc(j.emploi) + (j.lieu ? ' à l’adresse suivante : ' + esc(j.lieu) : '') + '.</p>' +
      (str(d.clauses.mobilite) ? '<p>' + esc(d.clauses.mobilite) + '</p>' : '') +
      '<p><b>Régime des congés payés :</b> ' + esc(d.clauses.conges) + '</p><p><b>Prévoyance sociale :</b> ' + esc(d.clauses.prevoyance) + '</p><p><b>Discipline - Secret professionnel :</b> ' + esc(d.clauses.discipline) + '</p>' +
      '<div class="art">VII. SALAIRE</div><p>Le salaire brut mensuel est ainsi décomposé :</p><table class="sal">' + salRows.map(([l, v]) => '<tr><td>' + esc(l) + '</td><td style="text-align:right"><b>' + money(v) + '</b> FCFA</td></tr>').join('') + '<tr><td><b>Total brut mensuel</b></td><td style="text-align:right"><b>' + money(s.brutContrat) + '</b> FCFA</td></tr></table>' +
      '<div class="art">VIII.</div><p>' + esc(fa) + ' ' + esc(K.fullName(w)) + ' déclare formellement n’être lié(e) à aucun employeur et être libre de tout engagement.</p>' +
      '<p class="center">Le présent contrat est établi à ' + esc(j.lieuSignature) + ' en ' + esc(inWords(j.exemplaires)) + ' exemplaires originaux.</p><p class="center">' + esc(j.lieuSignature) + ', le ' + esc(longDate(j.dateContrat || j.dateEngagement)) + '</p>' +
      '<div class="sign"><div><b>' + esc(e.signataire || 'L’employeur') + '</b></div><div><b>Le travailleur</b><br><small>(Signature précédée de la mention « Lu et Approuvé »)</small></div></div></div>';
  }

  function dmtDoc(d, co) {
    const v = K.dmtView(d, co), s = v.synced, x = v.extra, cdd = s.type === 'CDD';
    const mat = str(x.matricule).toUpperCase().padEnd(6, ' ').slice(0, 6).split('');
    const L = (label, value) => '<span>' + esc(label) + ' <span class="fill">' + (esc(str(value)) || '&nbsp;') + '</span></span>';
    const hor = [40, 42, 44, 48].map((h) => '<span class="' + (s.horaire === h ? 'box' : '') + '" style="margin-right:10px">' + h + ' heures</span>').join('');
    return '<div class="ctdoc dmt"><div class="top"><div><h1>DECLARATION DE MOUVEMENT DU TRAVAILLEUR</h1><div class="row">N° ' + (esc(x.numero) || '..................') + ' du ' + (frDate(x.date) || '..................') + '</div></div><div class="stamp"><b>Cachet et raison sociale de l’employeur</b><br>' + esc(s.raisonSociale) + '<br>' + esc(s.adresseEtablissement) + '</div></div>' +
      '<div class="refs"><b>REFERENCES</b><br>Article 193 (Alinéas 2, 3, 4) du Code du Travail (loi n° 61-34 du 15 juin 1961). Arrêté ministériel n° 7301 du 17 mai 1963 déterminant les modalités des déclarations de mouvements de travailleurs (J.O. 22 juin 1963, p. 825).</div>' +
      '<div class="l"><b>N° d’immatriculation du travailleur au fichier central de la main-d’œuvre</b> ' + '<span style="white-space:nowrap">' + mat.map((ch, i) => '<span><small>' + 'ABCDEF'[i] + '</small><span class="box">' + (esc(ch.trim()) || '&nbsp;') + '</span></span>').join('') + '</span></div>' +
      '<div class="sec">Objet de la présente déclaration</div><div class="objet">' + K.OBJETS.map((o) => '<span class="' + (o === x.objet ? 'sel' : '') + '">' + esc(o) + '</span>').join('') + '</div><div class="refs">IMMATRICULATION : si le travailleur n’a pas encore été immatriculé, la mention « Immatriculation » devra être portée dans le blanc ci-dessus.</div>' +
      '<div class="sec">Concernant le travailleur</div>' +
      '<div class="l">' + L('Nom :', s.nom) + L('Prénoms :', s.prenoms) + L('Sexe :', s.sexe) + '</div>' +
      '<div class="l">' + L('Né(e) le', frDate(s.naissance)) + L('à', s.lieuNaissance) + L('Pays', s.pays) + L('Nationalité :', s.nationalite) + '</div>' +
      '<div class="l">' + L('Fils (fille) de (père)', s.pere) + L('et de (mère)', s.mere) + L('Groupe ethnique :', x.ethnie) + '</div>' +
      '<div class="l">' + L('Adresse (très précise) :', s.adresse) + '</div>' +
      '<div class="l">' + L('Carte d’identité n°', x.cni) + L('Délivrée à', x.cniLieu) + L('Le', frDate(x.cniDate)) + L('Par :', x.cniPar) + '</div>' +
      '<div class="l">' + L('N° d’immatriculation à la C.C.P.F. - A.T.', x.ccpf) + L('N° d’immatriculation à l’A.G.R.O.M.', x.agrom) + '</div>' +
      '<div class="l">' + L('Situation de famille :', s.famille) + L('Nombre d’épouses :', s.epouses || '') + L('Nom des épouses :', s.nomsEpouses) + '</div>' +
      '<div class="l">' + L('Nombre d’enfants à charge :', s.enfants) + L('Noms des enfants à charge :', s.nomsEnfants) + '</div>' +
      '<div class="l">' + L('Date d’entrée dans l’établissement :', frDate(s.dateEntree)) + L('N° et date de la déclaration d’embauche effectuée lors de l’engagement :', x.declEmbauche) + '</div>' +
      '<div class="l">' + L('Profession :', s.profession) + L('Emploi dans l’établissement :', s.emploi) + L('Catégorie :', s.categorie) + '</div>' +
      '<div class="l">' + L('Convention collective :', s.convention) + L('Éventuellement, date du contrat :', frDate(s.dateContrat)) + '</div>' +
      '<div class="l">' + L('N° et date du visa d’approbation par l’Inspecteur du Travail et de la Sécurité Sociale :', x.visaApprobation) + '</div>' +
      '<div class="l">' + L('N° et date du visa d’enregistrement à la section locale de la main-d’œuvre :', x.visaEnregistrement) + '</div>' +
      '<div class="l">' + L('Raison sociale et adresse précise de l’établissement de l’employeur :', s.raisonSociale + (s.adresseEtablissement ? ', ' + s.adresseEtablissement : '')) + L('Activité de l’établissement :', s.activite) + '</div>' +
      '<div class="l"><b>Durée du contrat :</b> ' + L('à durée déterminée du', cdd ? frDate(s.dateDebut) : '') + L('au', cdd ? frDate(s.dateFin) : '') + '<span class="' + (!cdd ? 'box' : '') + '">ou à durée indéterminée : CDI</span></div>' +
      '<div class="l">' + L('Nom et adresse du précédent employeur :', x.precedentEmployeur) + '</div>' +
      '<div class="l"><b>Si le travailleur bénéficie de l’article 107 du Code du Travail :</b> ' + L('Lieu de résidence habituelle :', x.art107Lieu || s.residence) + L('Date d’entrée au Sénégal :', frDate(x.art107Date)) + '</div>' +
      '<div class="l"><b>Situation militaire :</b> ' + L('Classe de recrutement :', x.militaireClasse) + L('Service militaire effectué :', x.militaireService) + L('Armée d’appartenance :', x.militaireArmee) + L('Grade dans la réserve :', x.militaireGrade) + '</div>' +
      '<div class="sec">Dispositions particulières concernant l’engagement</div><div class="l">1) Le salaire du travailleur sera celui fixé pour la catégorie ' + esc(s.categorie) + ' de la ' + esc(s.convention) + ' en fonction d’un horaire de travail hebdomadaire de : ' + hor + '</div>' +
      '<table class="sal"><tr><td>1) BASE (' + money(s.tauxHoraire) + ' × 173,33 =)</td><td>' + money(s.base) + '</td></tr><tr><td>2) SURSALAIRE</td><td>' + (s.sursalaire ? money(s.sursalaire) : '-') + '</td></tr><tr><td>3) INDEMNITE DE LOGEMENT</td><td>' + (s.logement ? money(s.logement) : '-') + '</td></tr><tr><td>4) ANCIENNETE (' + (s.anciennetePct || 0) + ' %)</td><td>' + (s.ancienneteMontant ? money(s.ancienneteMontant) : '-') + '</td></tr><tr><td>5) SALAIRE BRUT</td><td>' + money(s.brut) + '</td></tr><tr><td>6) PRIME DE TRANSPORT</td><td>' + (s.transport ? money(s.transport) : '-') + '</td></tr><tr><td>7) SALAIRE NET</td><td>' + (view.netCache && view.netCache.id === d.id ? money(view.netCache.net) : '—') + '</td></tr></table>' +
      '<div class="sign"><div><b>Signature du travailleur</b><br><small>(Précédée de la mention manuscrite pour accord)</small></div><div><b>Signature de l’employeur</b></div></div>' +
      '<div class="note"><b>P.S. – N.B. :</b> 1) La déclaration de mouvement du travailleur est à établir en trois exemplaires dûment signés par l’employeur et le travailleur. Un exemplaire est remis au travailleur. Le second est conservé par l’employeur. Le troisième est déposé : dans l’intérieur, à la Section locale de la Main-d’œuvre, à l’Inspection Régionale du Travail et de la Sécurité Sociale du ressort ; à Dakar, au Bureau Central du Service de la Main-d’œuvre. 2) L’employeur doit OBLIGATOIREMENT délivrer une ampliation de la déclaration du mouvement au travailleur. 3) Sont provisoirement exemptés de la déclaration de mouvement : les travailleurs journaliers effectivement payés tous les jours ; les manœuvres ordinaires dans toutes les branches d’activité.</div></div>';
  }

  /* Aperçu et impression (zone dédiée : aucune fenêtre externe, compatible avec la politique de sécurité du site) */
  function ensureDocUi() {
    if ($('ctPreview')) return;
    const st = document.createElement('style'); st.id = 'ctDocCss'; st.textContent = DOC_CSS + '#docPrint{display:none}@media print{body.printing-doc > *:not(#docPrint){display:none!important}body.printing-doc #docPrint{display:block!important}body.printing-doc #docPrint .ctdoc{max-width:none;padding:0}}';
    document.head.appendChild(st);
    const m = document.createElement('div'); m.id = 'ctPreview'; m.className = 'modal hidden'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Aperçu du document');
    m.innerHTML = '<div class="modal-card" style="width:min(900px,96vw);max-height:94vh;display:flex;flex-direction:column;gap:10px"><div class="modal-actions" style="justify-content:space-between"><b id="ctPreviewTitle">Aperçu</b><span><button type="button" class="btn primary" data-ctp="print">Imprimer / PDF</button> <button type="button" class="btn" data-ctp="close">Fermer</button></span></div><div id="ctPreviewBody" style="overflow:auto;background:#e8edf5;padding:12px;border-radius:10px"></div></div>';
    document.body.appendChild(m);
    const pr = document.createElement('div'); pr.id = 'docPrint'; document.body.appendChild(pr);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-ctp=close]')) m.classList.add('hidden'); if (e.target.closest('[data-ctp=print]')) printHtml($('ctPreviewBody').innerHTML, $('ctPreviewTitle').textContent); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') m.classList.add('hidden'); });
  }
  function showDoc(html, title) { ensureDocUi(); $('ctPreviewTitle').textContent = title; $('ctPreviewBody').innerHTML = html; $('ctPreview').classList.remove('hidden'); }
  function printHtml(html, title) {
    ensureDocUi(); const pr = $('docPrint'), t = document.title; pr.innerHTML = html; document.title = title;
    const done = () => { window.removeEventListener('afterprint', done); document.body.classList.remove('printing-doc'); document.title = t; pr.innerHTML = ''; };
    window.addEventListener('afterprint', done); setTimeout(() => { document.title = t; }, 60000);
    document.body.classList.add('printing-doc'); setTimeout(() => window.print(), 50);
  }
  function docFor(kind, d) {
    const co = company(), name = (K.fullName(d.worker) || 'travailleur').replace(/[^\p{L}\p{N}]+/gu, '-');
    if (kind === 'dmt') { view.netCache = { id: d.id, net: (estimateNet(d) || {}).net || 0 }; return { html: dmtDoc(d, co), title: 'DMT-' + name }; }
    return { html: contractDoc(d), title: 'Contrat-' + (d.number || 'brouillon') + '-' + name };
  }
  function openDoc(kind, d, print) {
    const v = K.validate(d);
    if (!v.valid) { setMsg(v.errors[0], true); toast(v.errors[0]); if (WS.state.module === 'contract-new') render(); return; }
    const x = docFor(kind, d); if (print) printHtml(x.html, x.title); else showDoc(x.html, (kind === 'dmt' ? 'DMT · ' : 'Contrat · ') + K.fullName(d.worker));
  }

  /* ───────── Formulaires ───────── */
  const fld = (path, label, o) => {
    o = o || {}; const d = view.draft, v = getPath(d, path), type = o.type || 'text', id = 'ct_' + path.replace(/\./g, '_'), ro = o.readonly ? ' readonly' : '';
    const cls = 'ws-field' + (o.wide ? ' wide' : ''), attrs = ' data-ct-f="' + path + '"' + (o.redraw ? ' data-ct-r="1"' : '') + (o.title ? ' title="' + esc(o.title) + '"' : '');
    if (type === 'select') return '<div class="' + cls + '"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '"' + attrs + '>' + o.options.map(([k, l]) => '<option value="' + esc(k) + '"' + (String(v) === String(k) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>';
    if (type === 'textarea') return '<div class="' + cls + ' wide"><label for="' + id + '">' + esc(label) + '</label><textarea id="' + id + '" rows="' + (o.rows || 3) + '"' + attrs + '>' + esc(Array.isArray(v) ? v.join('\n') : v) + '</textarea></div>';
    if (type === 'checkbox') return '<label class="ws-check"><input type="checkbox" id="' + id + '"' + attrs + (v ? ' checked' : '') + '> ' + esc(label) + '</label>';
    return '<div class="' + cls + '"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" type="' + type + '"' + (type === 'number' ? ' min="0" step="any"' : '') + attrs + ' value="' + esc(v == null ? '' : v) + '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + ro + '></div>';
  };
  const card = (title, sub, body) => '<article class="cp-card ws-form"><h2>' + esc(title) + '</h2>' + (sub ? '<p class="cp-sub">' + sub + '</p>' : '') + '<div class="ws-grid-fields">' + body + '</div></article>';

  function issuesHTML(d) {
    const v = K.validate(d);
    return (v.errors.length ? '<ul class="ct-issues err">' + v.errors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '<p class="ct-ok">✔ Informations essentielles complètes.</p>') + (v.warnings.length ? '<ul class="ct-issues">' + v.warnings.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '');
  }
  function derivedHTML(d) {
    const t = K.salaryTotals(d.salary), te = K.trialEnd(d), n = view.net;
    return '<div class="ct-derived"><div><span>Brut mensuel du contrat (transport compris)</span><b>' + money(t.brutContrat) + ' FCFA</b></div><div><span>Brut DMT (hors transport)</span><b>' + money(t.brutDmt) + ' FCFA</b></div><div><span>Taux horaire (base ÷ 173,33)</span><b>' + money(t.tauxHoraire) + ' FCFA</b></div><div><span>Net estimé (moteur de paie)</span><b>' + (n ? money(n.net) + ' FCFA' : '—') + '</b></div>' + (te ? '<div><span>Fin de la période d’essai</span><b>' + frDate(te) + '</b></div>' : '') + '</div>';
  }
  function updateDerived() {
    const d = view.draft; if (!d || WS.state.module !== 'contract-new') return;
    const n = K.salaryTotals(d.salary).base > 0 ? estimateNet(d) : null; view.net = n;
    const a = $('ctDerived'), b = $('ctIssues'); if (a) a.innerHTML = derivedHTML(d); if (b) b.innerHTML = issuesHTML(d); refreshMeta();
  }

  function contractTab(d) {
    const W = (p, l, o) => fld('worker.' + p, l, o), J = (p, l, o) => fld('job.' + p, l, o), E = (p, l, o) => fld('employer.' + p, l, o), S = (p, l, o) => fld('salary.' + p, l, o);
    const married = d.worker.famille === 'marie';
    return card('Employeur', 'Repris du profil de l’entreprise ; enregistré pour les prochains contrats.',
      E('name', 'Raison sociale de l’employeur') + E('siege', 'Siège social', { placeholder: 'Dakar, Immeuble…' }) + E('representant', 'Représenté par', { placeholder: 'Madame … / Monsieur …' }) + E('qualite', 'En sa qualité de') + E('signataire', 'Signataire du contrat', { title: 'Texte affiché au-dessus de la signature' }) + E('activite', 'Activité de l’établissement (DMT)')) +
      card('Travailleur', 'Ces informations sont reprises automatiquement dans la DMT.',
        W('civilite', 'Civilité', { type: 'select', options: [['Monsieur', 'Monsieur'], ['Madame', 'Madame'], ['Mademoiselle', 'Mademoiselle']] }) + W('sexe', 'Sexe', { type: 'select', options: [['M', 'Masculin'], ['F', 'Féminin']], redraw: true }) + W('nom', 'Nom') + W('prenoms', 'Prénoms') +
        W('naissance', 'Date de naissance', { type: 'date' }) + W('lieuNaissance', 'Lieu de naissance') + W('pays', 'Pays de naissance') + W('nationalite', 'Nationalité') + W('pere', 'Père (fils/fille de)') + W('mere', 'Mère') + W('domicile', 'Domicile / adresse précise', { wide: true }) +
        W('famille', 'Situation de famille', { type: 'select', redraw: true, options: Object.entries(K.FAMILLE) }) + W('enfants', 'Enfants à charge', { type: 'number' }) +
        (married ? W('conjointRevenus', 'Le conjoint a un revenu professionnel (IR et TRIMF du bulletin)', { type: 'checkbox' }) : '')) +
      card('Emploi et durée', 'Modèle : contrat de travail à durée indéterminée (CDI) ou déterminée (CDD).',
        J('emploi', 'I. Emploi tenu') + J('classification', 'II. Classification professionnelle', { placeholder: '7ème B de la convention du commerce' }) + J('convention', 'Convention collective') + J('dateEngagement', 'III. Date de l’engagement', { type: 'date' }) +
        J('type', 'IV. Durée du contrat', { type: 'select', redraw: true, options: [['CDI', 'Durée indéterminée (CDI)'], ['CDD', 'Durée déterminée (CDD)']] }) + (d.job.type === 'CDD' ? J('dateFin', 'Date de fin du CDD', { type: 'date' }) : '') +
        J('essaiMois', 'Période d’essai (mois, 0 = aucune)', { type: 'number' }) + J('essaiRenouvelable', 'Renouvelable tacitement', { type: 'checkbox' }) + J('horaire', 'Horaire hebdomadaire (heures)', { type: 'number' }) + J('lieu', 'Lieu de travail (adresse)') + J('lieuSignature', 'Contrat établi à') + J('dateContrat', 'Date du contrat', { type: 'date', title: 'Par défaut : date de l’engagement' }) + J('exemplaires', 'Nombre d’exemplaires', { type: 'number' })) +
      card('VII. Salaire', 'Montants mensuels bruts en FCFA.',
        S('base', 'Salaire de base') + S('sursalaire', 'Sursalaire') + S('logement', 'Indemnité de logement') + S('anciennetePct', 'Ancienneté (%)', { type: 'number' }) + S('transport', 'Indemnité de transport') + '<div class="wide" id="ctDerived">' + derivedHTML(d) + '</div>') +
      '<details class="cp-card ws-form"><summary><b>Clauses du contrat</b> (reprises du modèle, modifiables)</summary><div class="ws-grid-fields">' +
      fld('clauses.references', 'V. Références aux textes (une par ligne)', { type: 'textarea', rows: 6 }) + fld('clauses.conges', 'Régime des congés payés', { type: 'textarea' }) + fld('clauses.prevoyance', 'Prévoyance sociale', { type: 'textarea' }) + fld('clauses.discipline', 'Discipline – secret professionnel', { type: 'textarea', rows: 5 }) + fld('clauses.mobilite', 'Lieu de travail – mobilité', { type: 'textarea' }) +
      '</div><p class="cp-sub">Les références juridiques sont celles de votre modèle (Code du travail de 1997) : vérifiez-les si le nouveau Code du travail (loi n° 15/2026) s’applique à ce contrat.</p></details>';
  }

  function dmtTab(d) {
    const co = company(), v = K.dmtView(d, co), s = v.synced, miss = K.dmtMissing(d, co);
    const ro = (l, val) => '<div class="ct-ro"><span>' + esc(l) + '</span><b>' + (esc(str(val)) || '—') + '</b></div>';
    const X = (p, l, o) => fld('dmt.' + p, l, Object.assign({}, o));
    const synced = '<article class="cp-card ws-form"><div class="cp-card-head"><div><h2>Repris du contrat</h2><p class="cp-sub">Synchronisé automatiquement : pour modifier une de ces informations, changez-la dans le contrat.</p></div><button type="button" class="cp-btn sm" data-ct="tab:contract">Modifier dans le contrat</button></div><div class="ct-ro-grid">' +
      ro('Nom', s.nom) + ro('Prénoms', s.prenoms) + ro('Sexe', s.sexe) + ro('Né(e) le', frDate(s.naissance)) + ro('À', s.lieuNaissance) + ro('Nationalité', s.nationalite) + ro('Père', s.pere) + ro('Mère', s.mere) + ro('Adresse', s.adresse) +
      ro('Situation de famille', s.famille) + ro('Enfants à charge', s.enfants) + ro('Date d’entrée', frDate(s.dateEntree)) + ro('Emploi', s.emploi) + ro('Catégorie', s.categorie) + ro('Convention collective', s.convention) + ro('Date du contrat', frDate(s.dateContrat)) +
      ro('Employeur', s.raisonSociale) + ro('Adresse de l’établissement', s.adresseEtablissement) + ro('Durée', s.type === 'CDD' ? 'CDD du ' + frDate(s.dateDebut) + ' au ' + frDate(s.dateFin) : 'CDI') + ro('Horaire', s.horaire + ' h / semaine') +
      ro('Base', money(s.base)) + ro('Sursalaire', money(s.sursalaire)) + ro('Logement', money(s.logement)) + ro('Ancienneté', s.anciennetePct + ' % (' + money(s.ancienneteMontant) + ')') + ro('Salaire brut (hors transport)', money(s.brut)) + ro('Prime de transport', money(s.transport)) + '</div></article>';
    const extras = card('À compléter pour la DMT', 'Seules les informations propres à la DMT sont à saisir ici.',
      X('numero', 'N° de la déclaration') + X('date', 'Date de la déclaration', { type: 'date' }) + X('matricule', 'N° d’immatriculation au fichier central (6 caractères A à F)', { placeholder: 'ABCDEF' }) +
      X('objet', 'Objet de la déclaration', { type: 'select', options: K.OBJETS.map((o) => [o, o]) }) + X('ethnie', 'Groupe ethnique') + X('cni', 'Carte d’identité n°') + X('cniLieu', 'Délivrée à') + X('cniDate', 'Délivrée le', { type: 'date' }) + X('cniPar', 'Par') +
      X('ccpf', 'N° d’immatriculation à la C.C.P.F. – A.T. (CSS)') + X('agrom', 'N° d’immatriculation à l’A.G.R.O.M. (IPRES)') + fld('worker.nomsEpouses', 'Nom des épouses', {}) + fld('worker.nomsEnfants', 'Noms des enfants à charge', {}) +
      X('declEmbauche', 'N° et date de la déclaration d’embauche') + X('profession', 'Profession (par défaut : emploi)', { placeholder: str(d.job.emploi) }) + X('activite', 'Activité de l’établissement', { placeholder: str(d.employer.activite) }) +
      X('visaApprobation', 'N° et date du visa d’approbation (Inspecteur du Travail)') + X('visaEnregistrement', 'N° et date du visa d’enregistrement (main-d’œuvre)') + X('precedentEmployeur', 'Nom et adresse du précédent employeur') +
      X('art107Lieu', 'Art. 107 : lieu de résidence habituelle') + X('art107Date', 'Art. 107 : date d’entrée au Sénégal', { type: 'date' }) +
      X('militaireClasse', 'Situation militaire : classe de recrutement') + X('militaireService', 'Service militaire effectué ?') + X('militaireArmee', 'Armée d’appartenance') + X('militaireGrade', 'Grade dans la réserve'));
    return '<div class="ct-missing" id="ctMissing">' + (miss.length ? '<b>Informations encore à compléter (recommandé) :</b> ' + miss.map(esc).join(' · ') : '✔ Les informations usuelles de la DMT sont renseignées.') + '</div>' + synced + extras;
  }

  const subText = (c, d) => esc(c.name) + ' · ' + (contractsOf(c).some((x) => x.id === d.id) ? esc(d.number) : 'nouveau contrat (enregistrement automatique dès le nom et les prénoms saisis)');
  const pickOptions = (c, d) => '<option value="">Nouveau contrat</option>' + contractsOf(c).map((x) => '<option value="' + esc(x.id) + '"' + (x.id === d.id ? ' selected' : '') + '>' + esc((x.number || 'Brouillon') + ' · ' + K.fullName(x.worker)) + '</option>').join('');
  function refreshMeta() {
    const c = company(), d = view.draft; if (!c || !d || WS.state.module !== 'contract-new') return;
    const s = $('ctSub'); if (s) s.innerHTML = subText(c, d);
    const p = $('ctPick'); if (p) p.innerHTML = pickOptions(c, d);
    const m = $('ctMissing'); if (m) { const miss = K.dmtMissing(d, c); m.innerHTML = miss.length ? '<b>Informations encore à compléter (recommandé) :</b> ' + miss.map(esc).join(' · ') : '✔ Les informations usuelles de la DMT sont renseignées.'; }
  }
  function elaborationHTML(c) {
    const d = view.draft, list = contractsOf(c), saved = list.some((x) => x.id === d.id), dmtOk = d.dmt && d.dmt.status === 'établie';
    const picker = '<div class="ws-field"><label for="ctPick">Contrat</label><select id="ctPick" data-ct-pick="1">' + pickOptions(c, d) + '</select></div>';
    return '<div class="ws-page-head"><div><h1>Élaboration de contrat</h1><p id="ctSub">' + subText(c, d) + '</p></div><div class="ws-tools">' + picker +
      '<div class="ws-field"><label for="ctStatusSel">Statut</label><select id="ctStatusSel" data-ct-f="status">' + K.STATUS.map((s) => '<option' + (d.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div></div></div>' +
      '<div class="ct-tabs" role="tablist"><button type="button" role="tab" aria-selected="' + (view.tab === 'contract') + '" data-ct="tab:contract">1. Contrat de travail</button><button type="button" role="tab" aria-selected="' + (view.tab === 'dmt') + '" data-ct="tab:dmt">2. DMT' + (dmtOk ? ' ✔' : '') + '</button><span id="ctStatus" class="cp-sub" role="status">' + esc(view.msg) + '</span></div>' +
      '<div class="ct-bar">' + (view.tab === 'contract'
        ? '<button type="button" class="cp-btn primary" data-ct="save">' + icon('check') + 'Enregistrer</button><button type="button" class="cp-btn" data-ct="preview:contract">' + icon('eye') + 'Aperçu du contrat</button><button type="button" class="cp-btn" data-ct="print:contract">' + icon('printer') + 'Imprimer / PDF</button><button type="button" class="cp-btn" data-ct="tab:dmt">Créer la DMT →</button><button type="button" class="cp-btn" data-ct="bulletin">' + icon('file2') + 'Préparer le bulletin de paie</button>'
        : '<button type="button" class="cp-btn primary" data-ct="save">' + icon('check') + 'Enregistrer</button><button type="button" class="cp-btn" data-ct="preview:dmt">' + icon('eye') + 'Aperçu de la DMT</button><button type="button" class="cp-btn" data-ct="print:dmt">' + icon('printer') + 'Imprimer / PDF</button><button type="button" class="cp-btn" data-ct="dmt-done">' + (dmtOk ? 'DMT établie ✔ (rouvrir)' : 'Marquer la DMT comme établie') + '</button><button type="button" class="cp-btn" data-ct="tab:contract">← Retour au contrat</button>') + '</div>' +
      '<div id="ctIssues">' + issuesHTML(d) + '</div>' + (view.tab === 'contract' ? contractTab(d) : dmtTab(d));
  }

  /* ───────── Gestion des contrats ───────── */
  const DMT_LABEL = (c) => (!c.dmt ? ['Non créée', 'neutral'] : c.dmt.status === 'établie' ? ['Établie', 'success'] : ['À compléter', 'warning']);
  const STATUS_TONE = { 'brouillon': 'neutral', 'signé': 'info', 'en cours': 'success', 'terminé': 'neutral' };
  function listHTML(c) {
    const all = contractsOf(c).map((x) => K.normalize(x, c)), q = view.q.trim().toLocaleLowerCase('fr');
    const rows = all.filter((x) => (!view.fStatus || x.status === view.fStatus) && (!view.fType || x.job.type === view.fType) && (!q || (K.fullName(x.worker) + ' ' + x.job.emploi + ' ' + x.number).toLocaleLowerCase('fr').includes(q)))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const alerts = K.alertsOf(all, todayISO()).filter((a) => a.level !== 'info' || all.length <= 12);
    const kpi = (l, v) => '<div class="ws-sum"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>';
    const act = (a, ic, label, id) => '<button type="button" class="cp-act' + (a === 'del' ? ' danger' : '') + '" title="' + esc(label) + '" aria-label="' + esc(label) + '" data-ct="' + a + ':' + esc(id) + '">' + icon(ic) + '</button>';
    const body = rows.map((x) => {
      const dm = DMT_LABEL(x), te = K.trialEnd(x), end = x.job.type === 'CDD' ? frDate(x.job.dateFin) : (te ? 'Essai jusqu’au ' + frDate(te) : '—');
      return '<tr><td class="nw">' + esc(x.number || '—') + '</td><td><button type="button" class="cp-person cp-person-btn" data-ct="edit:' + esc(x.id) + '" title="Ouvrir le contrat pour le modifier"><span class="cp-avatar">' + esc(D.initials(K.fullName(x.worker))) + '</span><div><b>' + esc(K.fullName(x.worker) || '—') + '</b><span>' + esc(x.job.emploi || '—') + '</span></div></button></td><td>' + esc(x.job.type) + '</td><td class="nw">' + esc(frDate(x.job.dateEngagement) || '—') + '</td><td>' + esc(end) + '</td>' +
        '<td><select class="ct-mini" aria-label="Statut du contrat de ' + esc(K.fullName(x.worker)) + '" data-ct-status="' + esc(x.id) + '">' + K.STATUS.map((s) => '<option' + (x.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></td><td><span class="cp-badge ' + dm[1] + '">' + dm[0] + '</span></td>' +
        '<td><div class="cp-actions">' + act('edit', 'eye', 'Ouvrir / modifier le contrat', x.id) + act('print-contract', 'printer', 'Imprimer le contrat (PDF)', x.id) + act('dmt', 'file', 'Créer ou ouvrir la DMT', x.id) + act('dup', 'plus', 'Dupliquer comme modèle', x.id) + act('del', 'trash', 'Supprimer le contrat', x.id) + '</div></td></tr>';
    }).join('');
    return '<div class="ws-page-head"><div><h1>Gestion des contrats</h1><p>' + esc(c.name) + ' · ' + all.length + ' contrat' + (all.length > 1 ? 's' : '') + '</p></div><div class="ws-tools"><button type="button" class="cp-btn primary" data-ct="new">' + icon('plus') + 'Nouveau contrat</button></div></div>' +
      '<div class="ws-sums">' + kpi('Contrats', String(all.length)) + kpi('En cours', String(all.filter((x) => x.status === 'en cours').length)) + kpi('Brouillons', String(all.filter((x) => x.status === 'brouillon').length)) + kpi('DMT à établir', String(all.filter((x) => x.status !== 'terminé' && !(x.dmt && x.dmt.status === 'établie')).length)) + '</div>' +
      (alerts.length ? '<article class="cp-card"><div class="cp-card-head"><h2>Alertes</h2></div><ul class="cp-alerts">' + alerts.map((a) => '<li class="cp-alert ' + (a.level === 'info' ? 'info' : a.level === 'late' ? 'danger' : 'warn') + '"><span class="ico">' + icon(a.level === 'info' ? 'clock' : 'alert') + '</span><button type="button" class="main-act" data-ct="edit:' + esc(a.id) + '">' + esc(a.text) + '</button><span></span></li>').join('') + '</ul></article>' : '') +
      '<div class="ws-tools ws-filters"><div class="ws-field"><label for="ctQ">Rechercher</label><input id="ctQ" type="search" placeholder="Nom, emploi ou n°" value="' + esc(view.q) + '" autocomplete="off"></div><div class="ws-field"><label for="ctFS">Statut</label><select id="ctFS"><option value="">Tous</option>' + K.STATUS.map((s) => '<option' + (view.fStatus === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div><div class="ws-field"><label for="ctFT">Type</label><select id="ctFT"><option value="">Tous</option><option' + (view.fType === 'CDI' ? ' selected' : '') + '>CDI</option><option' + (view.fType === 'CDD' ? ' selected' : '') + '>CDD</option></select></div></div>' +
      '<article class="cp-card">' + (rows.length ? '<div class="cp-table-wrap"><table class="cp-table" style="min-width:900px"><thead><tr><th>N°</th><th>Travailleur</th><th>Type</th><th>Engagement</th><th>Échéance</th><th>Statut</th><th>DMT</th><th>Actions</th></tr></thead><tbody>' + body + '</tbody></table></div>'
        : '<div class="cp-empty"><b>' + (all.length ? 'Aucun contrat pour ce filtre' : 'Aucun contrat enregistré') + '</b><span>' + (all.length ? 'Modifiez la recherche ou les filtres.' : 'Utilisez « Nouveau contrat » : la DMT se prépare ensuite automatiquement à partir du contrat.') + '</span></div>') + '</article>';
  }

  /* ───────── Actions ───────── */
  function openDraft(id, tab) {
    const c = company(), x = contractsOf(c).find((k) => k.id === id); if (!x) return;
    view.draft = K.normalize(clone(x), c); view.tab = tab || 'contract'; view.msg = ''; view.net = null; WS.go('contract-new'); setTimeout(updateDerived, 30);
  }
  function newDraft() { const c = company(); view.draft = K.blankContract(c, todayISO()); view.tab = 'contract'; view.msg = ''; view.net = null; WS.go('contract-new'); }
  function click(e) {
    const mod = WS.state.module; if (mod !== 'contract-new' && mod !== 'contract-list') return false;
    const b = e.target.closest('[data-ct]'); if (!b) return false;
    const [a, arg] = b.dataset.ct.split(/:(.*)/s), c = company(), list = c ? contractsOf(c) : [];
    if (a === 'tab') { commit(); view.tab = arg; render(); setTimeout(updateDerived, 30); }
    else if (a === 'save') { if (commit()) { toast('Contrat enregistré'); render(); } else toast(view.msg); }
    else if (a === 'preview' || a === 'print') { commit(); openDoc(arg, view.draft, a === 'print'); }
    else if (a === 'dmt-done') { const d = view.draft; d.dmt = Object.assign({}, d.dmt || {}); d.dmt.status = d.dmt.status === 'établie' ? 'brouillon' : 'établie'; commit(); toast(d.dmt.status === 'établie' ? 'DMT marquée comme établie' : 'DMT rouverte'); render(); }
    else if (a === 'bulletin') prepareBulletin();
    else if (a === 'new') newDraft();
    else if (a === 'edit') openDraft(arg, 'contract');
    else if (a === 'dmt') openDraft(arg, 'dmt');
    else if (a === 'print-contract') { const x = list.find((k) => k.id === arg); if (x) openDoc('contract', K.normalize(clone(x), c), true); }
    else if (a === 'dup') { const x = list.find((k) => k.id === arg); if (x) { const n = K.normalize(clone(x), c); Object.assign(n, { id: K.blankContract(c, '').id, number: '', status: 'brouillon', dmt: null, createdAt: todayISO() }); Object.assign(n.worker, { nom: '', prenoms: '', naissance: '', lieuNaissance: '', pere: '', mere: '', domicile: '', nomsEpouses: '', nomsEnfants: '' }); n.job.dateEngagement = ''; n.job.dateContrat = ''; n.job.dateFin = ''; view.draft = n; view.tab = 'contract'; view.msg = 'Modèle dupliqué : renseignez le nouveau travailleur.'; WS.go('contract-new'); } }
    else if (a === 'del') { const x = list.find((k) => k.id === arg); if (x && confirm('Supprimer définitivement le contrat ' + (x.number || '') + ' de ' + K.fullName(x.worker) + ' ?')) { c.contracts = list.filter((k) => k.id !== arg); persistOrg(); if (view.draft && view.draft.id === arg) view.draft = null; toast('Contrat supprimé'); render(); } }
    else return false;
    return true;
  }
  function change(e) {
    const t = e.target, mod = WS.state.module;
    if (mod === 'contract-list') {
      if (t.dataset.ctStatus) { const c = company(), x = contractsOf(c).find((k) => k.id === t.dataset.ctStatus); if (x && K.STATUS.includes(t.value)) { x.status = t.value; x.updatedAt = todayISO(); persistOrg(); toast('Statut du contrat : ' + t.value); render(); } return true; }
      if (t.id === 'ctFS') { view.fStatus = t.value; render(); return true; } if (t.id === 'ctFT') { view.fType = t.value; render(); return true; }
      return false;
    }
    if (mod !== 'contract-new') return false;
    if (t.dataset.ctPick !== undefined) { if (t.value) openDraft(t.value, view.tab); else newDraft(); return true; }
    if (t.dataset.ctF) { applyField(t); if (t.dataset.ctR) render(); setTimeout(updateDerived, 30); return true; }
    return false;
  }
  function applyField(t) {
    const p = t.dataset.ctF; let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'number') v = v === '' ? 0 : Number(v);
    if (p === 'clauses.references') v = String(v).split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (p.indexOf('dmt.') === 0 && !view.draft.dmt) view.draft.dmt = {};
    setPath(view.draft, p, v); view.dirty = true; queueCommit();
  }
  function input(e) {
    const t = e.target, mod = WS.state.module;
    if (mod === 'contract-list' && t.id === 'ctQ') { view.q = t.value; render(); const f = $('ctQ'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } return true; }
    if (mod === 'contract-new' && t.dataset.ctF && t.tagName !== 'SELECT' && t.type !== 'checkbox') { applyField(t); clearTimeout(view.derivedTimer); view.derivedTimer = setTimeout(updateDerived, 500); return true; }
    return false;
  }
  const render = () => WS.render();

  WS.registerModule('contract-new', { render: (c) => { ensureView(); return elaborationHTML(c); }, click, change, input, after: () => { if (!view.net) setTimeout(updateDerived, 30); } });
  WS.registerModule('contract-list', { render: (c) => { ensureView(); return listHTML(c); }, click, change, input });
  window.CorintaContractsUI = { newDraft, openDraft, prepareBulletin, view };
})();
