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

  const uid = () => 'ct-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

  /** Contrat vierge, pré-rempli avec le profil de l'entreprise. */
  function blankContract(company, today) {
    const p = (company && company.profile) || {};
    return {
      id: uid(), number: '', status: 'brouillon', createdAt: today || '', updatedAt: today || '',
      employer: { name: str((company && (company.employer || company.name))), siege: str(p.siege), representant: str(p.representant), qualite: str(p.qualite) || 'gérant(e)', activite: str(p.activite), signataire: str(p.signataire) || 'Le Directeur Général' },
      worker: { civilite: 'Monsieur', nom: '', prenoms: '', sexe: 'M', naissance: '', lieuNaissance: '', pays: 'Sénégal', nationalite: 'Sénégalaise', pere: '', mere: '', domicile: '', famille: 'celibataire', enfants: 0, conjointRevenus: false, epouses: 0, nomsEpouses: '', nomsEnfants: '' },
      job: { emploi: '', classification: '', convention: 'Convention collective nationale du commerce du 16 novembre 1956', dateEngagement: '', type: 'CDI', dateFin: '', essaiMois: 3, essaiRenouvelable: true, horaire: 40, lieu: str(p.siege), lieuSignature: str(p.ville) || 'Dakar', dateContrat: '', exemplaires: 4 },
      salary: { base: 0, sursalaire: 0, logement: 0, anciennetePct: 0, transport: 0 },
      clauses: { references: CLAUSES.references.slice(), conges: CLAUSES.conges, prevoyance: CLAUSES.prevoyance, discipline: CLAUSES.discipline, mobilite: CLAUSES.mobilite },
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
    return out;
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
        type: j.type === 'CDD' ? 'CDD' : 'CDI', dateDebut: iso(j.dateEngagement), dateFin: j.type === 'CDD' ? iso(j.dateFin) : '',
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
      if (j.type === 'CDD' && iso(j.dateFin)) { const d = dayDiff(today, j.dateFin); if (d < 0) out.push({ id: c.id, level: 'late', text: 'Le CDD de ' + name + ' est arrivé à échéance depuis ' + Math.abs(d) + ' j : renouveler ou clôturer.' }); else if (d <= 30) out.push({ id: c.id, level: d <= 7 ? 'urgent' : 'soon', text: 'Le CDD de ' + name + ' arrive à échéance le ' + j.dateFin.split('-').reverse().join('/') + ' (' + d + ' j).' }); }
      if (!c.dmt || c.dmt.status !== 'établie') out.push({ id: c.id, level: 'info', text: 'DMT à établir pour ' + name + '.' });
    });
    return out;
  }

  const api = { STATUS, FAMILLE, OBJETS, CLAUSES, DMT_EXTRA, blankContract, normalize, fullName, salaryTotals, trialEnd, addMonths, validate, nextNumber, dmtView, dmtMissing, alertsOf, num, iso };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaContracts = api;
})(typeof window !== 'undefined' ? window : globalThis);
