/*
 * Corinta Pay — contrats de travail et DMT : règles métier pures (testées sous Node, sans DOM).
 *
 * Un contrat est la source unique des informations : la Déclaration de Mouvement du Travailleur (DMT) en est déduite
 * (dmtView) et ne demande que les informations complémentaires propres à la DMT (immatriculations, pièce d'identité,
 * visas, situation militaire…).
 *
 * Modèles : « Contrat de travail à durée indéterminée » (décret n° 63-00-118 du 19/02/1963, Code du travail) et
 * « Déclaration de mouvement du travailleur » (art. 193 du Code du travail de 1961, arrêté n° 7301 du 17/05/1963).
 */
(function (root) {
  'use strict';
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const str = (v) => (v == null ? '' : String(v).trim());
  const iso = (v) => (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(str(v)) ? str(v) : '');

  const STATUS = ['brouillon', 'signé', 'en cours', 'terminé'];
  /* Types de contrat : CDI, CDD à terme précis, CDD conclu pour la durée d'un projet (modèle CDD du cabinet). */
  const TYPE_LABEL = { CDI: 'CDI — durée indéterminée', CDD: 'CDD — terme précis (dates)', CDD_PROJET: 'CDD — pour la durée d’un projet' };
  const TYPE_SHORT = { CDI: 'CDI', CDD: 'CDD', CDD_PROJET: 'CDD projet' };
  const isCdd = (t) => t === 'CDD' || t === 'CDD_PROJET';
  const WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const TENS = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
  function numWords(n) {
    n = Math.round(Number(n) || 0); if (n < 0 || n > 99) return String(n);
    if (n <= 16) return WORDS[n]; if (n < 20) return 'dix-' + WORDS[n - 10];
    if (n >= 70) { const r = n - (n >= 80 ? 80 : 60); const base = n >= 80 ? 'quatre-vingt' : 'soixante'; if (n === 80) return 'quatre-vingts'; return base + (n === 71 ? ' et ' : '-') + numWords(r); }
    const d = Math.floor(n / 10), u = n % 10; return TENS[d] + (u === 0 ? '' : (u === 1 ? ' et ' : '-') + WORDS[u]);
  }
  const withDigits = (n) => numWords(n) + ' (' + String(Math.round(Number(n) || 0)).padStart(2, '0') + ')';
  const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function longDate(isoDate) { const p = String(isoDate || '').split('-').map(Number); return p.length === 3 && p[0] ? String(p[2]).padStart(2, '0') + ' ' + MOIS_FR[p[1] - 1][0].toUpperCase() + MOIS_FR[p[1] - 1].slice(1) + ' ' + p[0] : ''; }
  const FAMILLE = { celibataire: 'Célibataire', marie: 'Marié(e)', divorce: 'Divorcé(e)', veuf: 'Veuf(ve)' };
  const OBJETS = ['Embauchage', 'Licenciement', 'Expiration normale du contrat', 'Démission', 'Mutation', 'Changement de catégorie professionnelle', 'Modification du contrat de travail', 'Changement de situation de famille', 'Changement de résidence habituelle', 'Changement d’emploi', 'Décès'];

  /* Clauses du modèle (modifiables contrat par contrat). */
  const CLAUSES = {
    references: [
      'Loi n° 97-17 du 1er décembre 1997 instituant le Code du travail du Sénégal et ses textes d’application. L’entrée en vigueur du présent contrat et sa prise d’effet entre les parties sont subordonnées, conformément aux articles L33 et L34 du Code du travail, à l’obtention du visa d’approbation de l’autorité compétente.',
      'La Convention collective nationale interprofessionnelle du 30 décembre 2019.',
      'La Convention collective nationale du commerce du 16 novembre 1956.',
      'Les accords et règlements de l’entreprise.'
    ],
    conges: 'Le travailleur bénéficiera de congés payés conformément aux articles L148 et L150 du Code du travail, ainsi qu’aux dispositions prévues par la Convention collective nationale interprofessionnelle.',
    prevoyance: 'Le travailleur bénéficie des dispositions légales et réglementaires en vigueur sur : les risques professionnels, la retraite, la maladie, y compris pour son conjoint et ses enfants à charge, suivant les statuts et le règlement intérieur de l’Institution de prévoyance maladie.',
    discipline: 'Le travailleur s’engage au respect de la discipline. Sauf dans le cadre de ses obligations professionnelles, il gardera le secret sur les informations dont il a eu connaissance par le fait ou à l’occasion de l’exercice de ses fonctions, notamment sur les procédés et résultats de travaux réalisés par l’entreprise. De même, le travailleur accepte de mettre en pratique l’obligation de non-concurrence tant au moment de l’exécution de son contrat de travail qu’après sa rupture.',
    mobilite: 'Cependant, il pourrait servir dans tout établissement appartenant à l’employeur et situé sur le territoire sénégalais. Les parties considèrent que l’affectation à un autre établissement n’est pas consécutive d’une modification des clauses contractuelles.'
  };

  /* Clauses propres aux contrats à durée déterminée (modèle CDD) ; {duree} {debut} {fin} {projet} {objet} {finPrevue} sont remplacés à l'édition. */
  const CLAUSES_CDD = {
    conges: 'Le travailleur bénéficiera de congés payés conformément aux articles 54 et suivants de la Convention collective nationale interprofessionnelle.',
    mobilite: 'Cependant, il pourrait servir dans tout bureau ou établissement de l’employeur situé dans la zone d’affectation indiquée ci-dessus. Les parties considèrent que l’affectation à un autre bureau ou établissement de l’employeur n’est pas consécutive à une modification des clauses contractuelles.',
    duree: {
      CDD: 'Le présent contrat est prévu pour une durée de {duree}, du {debut} au {fin}.',
      CDD_PROJET: 'Le présent contrat est conclu pour la durée du projet « {projet} »{objet}. Il prend effet le {debut} et prend fin de plein droit à l’achèvement du projet{finPrevue}. Cette date n’est donnée qu’à titre prévisionnel : toute prolongation au-delà de la fin du projet ou de cette date fait l’objet d’un avenant écrit.'
    }
  };
  const cddClause = (k, type) => (k === 'duree' ? (CLAUSES_CDD.duree[type] || '') : (isCdd(type) ? CLAUSES_CDD[k] : CLAUSES[k]));
  const uid = () => 'ct-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

  /** Contrat vierge, pré-rempli avec le profil de l'entreprise. */
  function blankContract(company, today) {
    const p = (company && company.profile) || {};
    return {
      id: uid(), number: '', status: 'brouillon', createdAt: today || '', updatedAt: today || '',
      employer: { prefixe: str(p.prefixe), name: str((company && (company.employer || company.name))), siege: str(p.siege), representant: str(p.representant), qualite: str(p.qualite) || 'gérant(e)', activite: str(p.activite), signataire: str(p.signataire) || 'Le Directeur Général' },
      worker: { civilite: 'Monsieur', nom: '', prenoms: '', sexe: 'M', naissance: '', lieuNaissance: '', pays: 'Sénégal', nationalite: 'Sénégalaise', pere: '', mere: '', domicile: '', famille: 'celibataire', enfants: 0, conjointRevenus: false, epouses: 0, nomsEpouses: '', nomsEnfants: '' },
      job: { projetNom: '', projetObjet: '', fonctionDetail: '', copieInspection: false, emploi: '', classification: '', convention: 'Convention collective nationale du commerce du 16 novembre 1956', dateEngagement: '', type: 'CDI', dateFin: '', essaiMois: 3, essaiRenouvelable: true, horaire: 40, lieu: str(p.siege), lieuSignature: str(p.ville) || 'Dakar', dateContrat: '', exemplaires: 4 },
      salary: { base: 0, sursalaire: 0, logement: 0, anciennetePct: 0, transport: 0 },
      clauses: { references: CLAUSES.references.slice(), conges: CLAUSES.conges, prevoyance: CLAUSES.prevoyance, discipline: CLAUSES.discipline, mobilite: CLAUSES.mobilite, duree: '' },
      dmt: null
    };
  }

  /** Complète un contrat enregistré avec les valeurs par défaut manquantes (anciens enregistrements). */
  function normalize(c, company) {
    const b = blankContract(company, '');
    const out = Object.assign({}, b, c);
    ['employer', 'worker', 'job', 'salary', 'clauses'].forEach((k) => { out[k] = Object.assign({}, b[k], (c && c[k]) || {}); });
    if (!Array.isArray(out.clauses.references)) out.clauses.references = CLAUSES.references.slice();
    if (!STATUS.includes(out.status)) out.status = 'brouillon';
    if (!TYPE_LABEL[out.job.type]) out.job.type = 'CDI';
    if (isCdd(out.job.type) && !str(out.clauses.duree)) out.clauses.duree = CLAUSES_CDD.duree[out.job.type];
    return out;
  }

  /** Change le type de contrat en adaptant les valeurs par défaut non personnalisées (clauses, essai, copie à l'inspection). */
  function switchType(c, type) {
    if (!TYPE_LABEL[type]) return c;
    const old = c.job.type; c.job.type = type;
    ['conges', 'mobilite'].forEach((k) => { if (c.clauses[k] === cddClause(k, old)) c.clauses[k] = cddClause(k, type); });
    if (!str(c.clauses.duree) || c.clauses.duree === cddClause('duree', old)) c.clauses.duree = cddClause('duree', type);
    if (isCdd(type) && num(c.job.essaiMois) === 3) c.job.essaiMois = 0;
    if (type === 'CDI' && num(c.job.essaiMois) === 0) c.job.essaiMois = 3;
    if (isCdd(type) && !isCdd(old)) c.job.copieInspection = true; if (type === 'CDI') c.job.copieInspection = false;
    return c;
  }
  const fullName = (w) => [str(w.prenoms), str(w.nom).toUpperCase()].filter(Boolean).join(' ');
  const anciennete = (s) => Math.round(num(s.base) * num(s.anciennetePct) / 100);
  /** Salaire brut du contrat (transport compris) et brut « DMT » (hors prime de transport, comme dans le modèle). */
  function salaryTotals(s) {
    const base = num(s.base), sur = num(s.sursalaire), log = num(s.logement), anc = anciennete(s), tr = num(s.transport);
    return { base, sursalaire: sur, logement: log, anciennete: anc, transport: tr, brutDmt: base + sur + log + anc, brutContrat: base + sur + log + anc + tr, tauxHoraire: Math.round((base / 173.33) * 100) / 100 };
  }

  function addMonths(isoDate, n) {
    const d = iso(isoDate); if (!d) return '';
    const [y, m, day] = d.split('-').map(Number), t = y * 12 + (m - 1) + n, ny = Math.floor(t / 12), nm = (t % 12) + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return ny + '-' + String(nm).padStart(2, '0') + '-' + String(Math.min(day, last)).padStart(2, '0');
  }
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const dayDiffIso = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  /** Durée entre deux dates en toutes lettres (« deux (02) ans », « six (06) mois »…) ; la date de fin est inclusive si elle clôt un mois entier. */
  function durationWords(start, end) {
    const a = iso(start), b = iso(end); if (!a || !b || b <= a) return '';
    const tryEnd = (e) => { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = e.split('-').map(Number); let months = (y2 - y1) * 12 + (m2 - m1); if (d2 < d1) months--; const days = dayDiffIso(addMonths(a, months), e); return { months, days }; };
    let r = tryEnd(new Date(Date.parse(b) + 864e5).toISOString().slice(0, 10)); if (r.days !== 0 || r.months <= 0) r = tryEnd(b);
    if (r.months > 0 && r.days === 0) return r.months % 12 === 0 ? withDigits(r.months / 12) + (r.months / 12 > 1 ? ' ans' : ' an') : withDigits(r.months) + ' mois';
    const total = dayDiffIso(a, b) + 1; return r.months > 0 ? withDigits(r.months) + ' mois et ' + withDigits(r.days) + ' jour' + (r.days > 1 ? 's' : '') : withDigits(total) + ' jour' + (total > 1 ? 's' : '');
  }
  const monthsBetween = (a, b) => { if (!iso(a) || !iso(b)) return 0; const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1) + (d2 >= d1 ? 0 : -1); };
  /** Texte de la clause de durée (CDD) avec ses variables remplacées. */
  function dureeText(c) {
    const j = c.job; if (!isCdd(j.type)) return '';
    const tpl = str(c.clauses && c.clauses.duree) || CLAUSES_CDD.duree[j.type];
    return tpl.replace(/\{duree\}/g, durationWords(j.dateEngagement, j.dateFin) || '…').replace(/\{debut\}/g, longDate(j.dateEngagement) || '…').replace(/\{fin\}/g, longDate(j.dateFin) || '…')
      .replace(/\{projet\}/g, str(j.projetNom) || '…').replace(/\{objet\}/g, str(j.projetObjet) ? ', ' + str(j.projetObjet).replace(/[.\s]+$/, '') : '').replace(/\{finPrevue\}/g, longDate(j.dateFin) ? ', prévue le ' + longDate(j.dateFin) : '');
  }

  /** Dernier jour de la période d'essai (engagement + n mois − 1 jour). */
  function trialEnd(c) {
    const j = c.job || {}; if (!iso(j.dateEngagement) || !(num(j.essaiMois) > 0)) return '';
    const e = addMonths(j.dateEngagement, Math.round(num(j.essaiMois)));
    return new Date(Date.parse(e) - 864e5).toISOString().slice(0, 10);
  }

  /** Contrôles de saisie : errors bloquent l'impression, warnings sont affichés. */
  function validate(c) {
    const errors = [], warnings = [], w = c.worker || {}, j = c.job || {}, s = c.salary || {}, e = c.employer || {};
    if (!str(w.nom)) errors.push('Le nom du travailleur est obligatoire.');
    if (!str(w.prenoms)) errors.push('Les prénoms du travailleur sont obligatoires.');
    if (!str(j.emploi)) errors.push('L’emploi tenu est obligatoire.');
    if (!iso(j.dateEngagement)) errors.push('La date d’engagement est obligatoire.');
    if (!(num(s.base) > 0)) errors.push('Le salaire de base doit être supérieur à 0.');
    if (j.type === 'CDD') {
      if (!iso(j.dateFin)) errors.push('Un contrat à durée déterminée doit avoir une date de fin.');
      else if (iso(j.dateEngagement) && j.dateFin <= j.dateEngagement) errors.push('La date de fin doit être postérieure à la date d’engagement.');
    }
    if (j.type === 'CDD_PROJET') {
      if (!str(j.projetNom)) errors.push('Le nom du projet est obligatoire pour un CDD pour la durée d’un projet.');
      if (!iso(j.dateFin)) warnings.push('Fin prévisionnelle du projet non renseignée : indiquez-la (le contrat prend fin à l’achèvement du projet).');
      else if (iso(j.dateEngagement) && j.dateFin <= j.dateEngagement) errors.push('La fin prévisionnelle du projet doit être postérieure à la date d’engagement.');
      if (!str(j.projetObjet)) warnings.push('Objet du projet non renseigné.');
    }
    if (isCdd(j.type) && monthsBetween(j.dateEngagement, j.dateFin) > 24) warnings.push('Durée supérieure à 24 mois : vérifiez la durée maximale légale des contrats à durée déterminée (renouvellements compris).');
    ['base', 'sursalaire', 'logement', 'anciennetePct', 'transport'].forEach((k) => { if (num(s[k]) < 0) errors.push('Le montant « ' + k + ' » ne peut pas être négatif.'); });
    if (iso(w.naissance)) { const age = dayDiff(w.naissance, (j.dateEngagement && iso(j.dateEngagement)) || new Date().toISOString().slice(0, 10)) / 365.25; if (age < 15) errors.push('Le travailleur doit avoir au moins 15 ans à la date d’engagement.'); if (age > 75) warnings.push('Âge supérieur à 75 ans : vérifiez la date de naissance.'); }
    else warnings.push('Date de naissance non renseignée.');
    if (!str(w.lieuNaissance)) warnings.push('Lieu de naissance non renseigné.');
    if (!str(w.domicile)) warnings.push('Domicile non renseigné.');
    if (!str(e.siege)) warnings.push('Siège de l’employeur non renseigné.');
    if (!str(e.representant)) warnings.push('Représentant de l’employeur non renseigné.');
    if (!str(j.classification)) warnings.push('Classification professionnelle non renseignée.');
    if (!(num(j.horaire) > 0)) warnings.push('Horaire hebdomadaire non renseigné.');
    if (num(w.enfants) < 0) errors.push('Le nombre d’enfants ne peut pas être négatif.');
    return { errors, warnings, valid: errors.length === 0 };
  }

  /** Numéro de contrat suivant : CT-AAAA-NNN (par entreprise et par année). */
  function nextNumber(list, today) {
    const y = String(today || '').slice(0, 4) || String(new Date().getFullYear());
    const used = (list || []).map((c) => { const m = /^CT-([0-9]{4})-([0-9]+)$/.exec(str(c.number)); return m && m[1] === y ? Number(m[2]) : 0; });
    return 'CT-' + y + '-' + String(Math.max(0, ...used) + 1).padStart(3, '0');
  }

  /** Valeurs de la DMT reprises du contrat (lecture seule dans la DMT) + compléments propres à la DMT. */
  const DMT_EXTRA = { numero: '', date: '', matricule: '', objet: 'Embauchage', ethnie: '', cni: '', cniLieu: '', cniDate: '', cniPar: 'L’autorité administrative', ccpf: '', agrom: '', declEmbauche: '', profession: '', activite: '', visaApprobation: '', visaEnregistrement: '', precedentEmployeur: '', art107Lieu: '', art107Date: '', militaireClasse: '', militaireService: '', militaireArmee: '', militaireGrade: '', status: 'brouillon' };
  function dmtView(c, company) {
    const w = c.worker, j = c.job, e = c.employer, tot = salaryTotals(c.salary);
    const extra = Object.assign({}, DMT_EXTRA, c.dmt || {});
    const prof = str(extra.profession) || str(j.emploi);
    return {
      extra,
      synced: {
        nom: str(w.nom).toUpperCase(), prenoms: str(w.prenoms), sexe: w.sexe === 'F' ? 'Féminin' : 'Masculin',
        naissance: iso(w.naissance), lieuNaissance: str(w.lieuNaissance), pays: str(w.pays), nationalite: str(w.nationalite),
        pere: str(w.pere), mere: str(w.mere), adresse: str(w.domicile),
        famille: FAMILLE[w.famille] || '', epouses: w.famille === 'marie' ? (num(w.epouses) || 1) : 0, nomsEpouses: str(w.nomsEpouses),
        enfants: Math.max(0, Math.round(num(w.enfants))), nomsEnfants: str(w.nomsEnfants),
        dateEntree: iso(j.dateEngagement), profession: prof, emploi: str(j.emploi), categorie: str(j.classification), convention: str(j.convention),
        dateContrat: iso(j.dateContrat) || iso(j.dateEngagement), raisonSociale: str(e.name), adresseEtablissement: str(e.siege), activite: str(extra.activite) || str(e.activite),
        type: isCdd(j.type) ? 'CDD' : 'CDI', dateDebut: iso(j.dateEngagement), dateFin: isCdd(j.type) ? iso(j.dateFin) : '',
        residence: str(w.domicile), horaire: num(j.horaire) || 40,
        base: tot.base, sursalaire: tot.sursalaire, logement: tot.logement, anciennetePct: num(c.salary.anciennetePct), ancienneteMontant: tot.anciennete, brut: tot.brutDmt, transport: tot.transport, tauxHoraire: tot.tauxHoraire
      }
    };
  }
  /** Informations que l'utilisateur doit encore compléter dans la DMT (indicatif). */
  function dmtMissing(c, company) {
    const v = dmtView(c, company), s = v.synced, x = v.extra, out = [];
    if (!str(x.cni)) out.push('Carte d’identité n°');
    if (!str(x.ccpf)) out.push('N° d’immatriculation à la CSS (C.C.P.F. – A.T.)');
    if (!str(x.agrom)) out.push('N° d’immatriculation IPRES (A.G.R.O.M.)');
    if (!s.activite) out.push('Activité de l’établissement');
    return out;
  }

  /** Alertes de gestion : fin de période d'essai, échéance de CDD, DMT à établir. */
  function alertsOf(contracts, today) {
    const out = [];
    (contracts || []).forEach((c) => {
      if (c.status === 'terminé') return;
      const name = fullName(c.worker || {}) || 'Travailleur', j = c.job || {};
      const te = trialEnd(c);
      if (te) { const d = dayDiff(today, te); if (d >= 0 && d <= 15) out.push({ id: c.id, level: d <= 7 ? 'urgent' : 'soon', text: 'Fin de période d’essai de ' + name + ' le ' + te.split('-').reverse().join('/') + ' (' + d + ' j).' }); }
      if (isCdd(j.type) && iso(j.dateFin)) { const d = dayDiff(today, j.dateFin), what = j.type === 'CDD_PROJET' ? 'La fin prévisionnelle du projet' + (str(j.projetNom) ? ' « ' + str(j.projetNom) + ' »' : '') + ' (CDD de ' + name + ')' : 'Le CDD de ' + name; if (d < 0) out.push({ id: c.id, level: 'late', text: what + ' est dépassé' + (j.type === 'CDD_PROJET' ? 'e' : '') + ' depuis ' + Math.abs(d) + ' j : renouveler ou clôturer.' }); else if (d <= 30) out.push({ id: c.id, level: d <= 7 ? 'urgent' : 'soon', text: what + ' arrive à échéance le ' + j.dateFin.split('-').reverse().join('/') + ' (' + d + ' j).' }); }
      if (!c.dmt || c.dmt.status !== 'établie') out.push({ id: c.id, level: 'info', text: 'DMT à établir pour ' + name + '.' });
    });
    return out;
  }

  const api = { TYPE_LABEL, TYPE_SHORT, isCdd, switchType, durationWords, dureeText, numWords, withDigits, longDate, CLAUSES_CDD, STATUS, FAMILLE, OBJETS, CLAUSES, DMT_EXTRA, blankContract, normalize, fullName, salaryTotals, trialEnd, addMonths, validate, nextNumber, dmtView, dmtMissing, alertsOf, num, iso };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaContracts = api;
})(typeof window !== 'undefined' ? window : globalThis);
