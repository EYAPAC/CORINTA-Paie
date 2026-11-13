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
  const TYPE_LABEL = { CDI: 'CDI — durée indéterminée', CDD: 'CDD — terme précis (dates)', CDD_PROJET: 'CDD — pour la durée d’un projet', PRESTATION: 'Contrat de prestation de services', LDC: 'Lettre de commande de services' };
  const TYPE_SHORT = { CDI: 'CDI', CDD: 'CDD', CDD_PROJET: 'CDD projet', PRESTATION: 'Prestation', LDC: 'Lettre de commande' };
  const isCdd = (t) => t === 'CDD' || t === 'CDD_PROJET';
  /* Prestations de services : contrat d'entreprise (indépendant), hors Code du travail — ni salaire, ni DMT, ni bulletin. */
  const isService = (t) => t === 'PRESTATION' || t === 'LDC';
  const WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const TENS = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
  function numWords(n) {
    n = Math.round(Number(n) || 0); if (n < 0 || n > 99) return String(n);
    if (n <= 16) return WORDS[n]; if (n < 20) return 'dix-' + WORDS[n - 10];
    if (n >= 70) { const r = n - (n >= 80 ? 80 : 60); const base = n >= 80 ? 'quatre-vingt' : 'soixante'; if (n === 80) return 'quatre-vingts'; return base + (n === 71 ? ' et ' : '-') + numWords(r); }
    const d = Math.floor(n / 10), u = n % 10; return TENS[d] + (u === 0 ? '' : (u === 1 ? ' et ' : '-') + WORDS[u]);
  }
  const withDigits = (n) => numWords(n) + ' (' + String(Math.round(Number(n) || 0)).padStart(2, '0') + ')';
  const U19 = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  function below100(n, final) {
    if (n < 20) return U19[n]; const t = Math.floor(n / 10), u = n % 10;
    if (t <= 6) { const T = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][t]; return u === 0 ? T : (u === 1 ? T + ' et un' : T + '-' + U19[u]); }
    if (t === 7) return u === 1 ? 'soixante et onze' : 'soixante-' + U19[10 + u];
    if (t === 8) return u === 0 ? 'quatre-vingt' + (final ? 's' : '') : 'quatre-vingt-' + U19[u];
    return 'quatre-vingt-' + U19[10 + u];
  }
  function below1000(n, final) {
    const h = Math.floor(n / 100), r = n % 100, out = [];
    if (h > 0) out.push((h > 1 ? U19[h] + ' ' : '') + 'cent' + (h > 1 && r === 0 && final ? 's' : ''));
    if (r > 0) out.push(below100(r, final)); return out.join(' ');
  }
  /** Montant entier en toutes lettres (« cent quatre-vingt mille », « deux millions ») ; au-delà de 999 999 999 999 : chiffres. */
  function amountWords(v) {
    const n = Math.round(Number(v) || 0); if (n < 0 || n >= 1e12) return String(n); if (n === 0) return 'zéro';
    const bn = Math.floor(n / 1e9), mi = Math.floor((n % 1e9) / 1e6), th = Math.floor((n % 1e6) / 1000), rest = n % 1000, out = [];
    if (bn) out.push(below1000(bn, true) + ' milliard' + (bn > 1 ? 's' : ''));
    if (mi) out.push((mi === 1 ? 'un' : below1000(mi, true)) + ' million' + (mi > 1 ? 's' : ''));
    if (th) out.push(th === 1 ? 'mille' : below1000(th, false) + ' mille');
    if (rest) out.push(below1000(rest, true)); return out.join(' ');
  }
  /** Désignation courte de l'entreprise dans les contrats de prestation (« MSA », « le Cabinet »…) : nom sans forme juridique, sinon initiales. */
  function deriveAlias(name) {
    const base = str(name).replace(/\b(cabinet|entreprise|soci[ée]t[ée]|sarl|sas|sa|groupe)\b/gi, ' ').replace(/\s+/g, ' ').trim() || str(name);
    if (!base) return 'le Cabinet'; if (base.length <= 16) return base;
    const w = base.split(/\s+/).filter((x) => /^[A-ZÀ-Ý]/.test(x)); if (w.length && /^[A-ZÀ-Ý]{2,}$/.test(w[0])) return w[0]; return w.length >= 2 ? w.map((x) => x[0]).join('').toUpperCase() : base.slice(0, 16);
  }
  const deAlias = (a) => (/^[aeiouyhàâéèêîôû]/i.test(str(a)) ? 'd’' : 'de ') + str(a);
  const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function longDate(isoDate) { const p = String(isoDate || '').split('-').map(Number); return p.length === 3 && p[0] ? String(p[2]).padStart(2, '0') + ' ' + MOIS_FR[p[1] - 1][0].toUpperCase() + MOIS_FR[p[1] - 1].slice(1) + ' ' + p[0] : ''; }
  const FAMILLE = { celibataire: 'Célibataire', marie: 'Marié(e)', divorce: 'Divorcé(e)', veuf: 'Veuf(ve)' };
  const OBJETS = ['Embauchage', 'Licenciement', 'Expiration normale du contrat', 'Démission', 'Mutation', 'Changement de catégorie professionnelle', 'Modification du contrat de travail', 'Changement de situation de famille', 'Changement de résidence habituelle', 'Changement d’emploi', 'Décès'];

  /* Clauses du modèle (modifiables contrat par contrat). */
  const CLAUSES = {
    references: [
      'Loi n° 2026-18 du 3 septembre 2026 portant Code du travail du Sénégal et ses textes d’application.',
      'La Convention collective nationale interprofessionnelle du 30 décembre 2019.',
      'La Convention collective nationale du commerce du 16 novembre 1956.',
      'Les accords et règlements de l’entreprise.'
    ],
    conges: 'Le travailleur bénéficiera de congés payés conformément aux articles 248 et 249 du Code du travail (deux (02) jours ouvrables par mois de service effectif, sauf stipulations plus favorables de la convention collective), ainsi qu’aux dispositions prévues par la Convention collective nationale interprofessionnelle.',
    prevoyance: 'Le travailleur bénéficie des dispositions légales et réglementaires en vigueur sur : les risques professionnels, la retraite, la maladie, y compris pour son conjoint et ses enfants à charge, suivant les statuts et le règlement intérieur de l’Institution de prévoyance maladie.',
    discipline: 'Le travailleur s’engage au respect de la discipline. Sauf dans le cadre de ses obligations professionnelles, il gardera le secret sur les informations dont il a eu connaissance par le fait ou à l’occasion de l’exercice de ses fonctions, notamment sur les procédés et résultats de travaux réalisés par l’entreprise.\nPendant l’exécution du contrat, le travailleur consacre toute son activité professionnelle à l’entreprise, sauf dérogation stipulée au contrat ; il lui est loisible d’exercer, en dehors de son temps de travail, toute activité professionnelle non susceptible de concurrencer l’entreprise ou de nuire à la bonne exécution des services convenus (article 295 du Code du travail).',
    mobilite: 'Cependant, il pourrait servir dans tout établissement appartenant à l’employeur et situé sur le territoire sénégalais. Les parties considèrent que l’affectation à un autre établissement n’est pas consécutive d’une modification des clauses contractuelles.'
  };

  /* Clauses propres aux contrats à durée déterminée (modèle CDD) ; {duree} {debut} {fin} {projet} {objet} {finPrevue} sont remplacés à l'édition. */
  const CLAUSES_CDD = {
    conges: 'Le travailleur bénéficiera de congés payés conformément aux articles 248 et 249 du Code du travail (deux (02) jours ouvrables par mois de service effectif, sauf stipulations plus favorables de la convention collective) et aux articles 54 et suivants de la Convention collective nationale interprofessionnelle.',
    mobilite: 'Cependant, il pourrait servir dans tout bureau ou établissement de l’employeur situé dans la zone d’affectation indiquée ci-dessus. Les parties considèrent que l’affectation à un autre bureau ou établissement de l’employeur n’est pas consécutive à une modification des clauses contractuelles.',
    duree: {
      CDD: 'Le présent contrat est prévu pour une durée de {duree}, du {debut} au {fin}. Il ne peut faire l’objet que d’un seul renouvellement ou d’une seule prolongation, par écrit et dans les conditions des articles 100, 102 et 103 du Code du travail ; la poursuite des services au-delà du terme, hors ces cas, vaut contrat à durée indéterminée (article 101).',
      CDD_PROJET: 'Le présent contrat est conclu pour la durée du projet « {projet} »{objet}. Il prend effet le {debut} et prend fin de plein droit à l’achèvement du projet{finPrevue}. Cette date n’est donnée qu’à titre prévisionnel. Conclu pour l’exécution d’un ouvrage déterminé, le contrat ne peut être ni renouvelé ni prolongé (article 100 du Code du travail) ; la poursuite des services après l’achèvement du projet vaut contrat à durée indéterminée (article 101).'
    }
  };
  /* Clauses des contrats de prestation de services et lettres de commande (modifiables). Variables : {alias} {de} {preavis} {taux} {plafond}.
     Une ligne = un paragraphe. Références légales citées : seules celles dont le texte a été vérifié (loi n° 2008-09 et loi n° 2008-12 du 25 janvier 2008). */
  const SERVICE_CLAUSES = {
    nature: 'Le présent contrat est un contrat de prestation de services (contrat d’entreprise) soumis au droit sénégalais, notamment au Code des obligations civiles et commerciales. Il ne constitue ni un contrat de travail, ni un mandat, ni un contrat de société ; le Prestataire exerce sa mission en toute indépendance et n’est placé sous l’autorité hiérarchique ou disciplinaire ni {de}, ni du Client.\nAu sens de l’article 3 du Code du travail (loi n° 2026-18 du 3 septembre 2026), le contrat de travail suppose que le travailleur mette son activité professionnelle sous la direction et l’autorité de l’employeur ; tel n’est pas l’objet du présent contrat, que les parties s’engagent à exécuter dans le respect de cette qualification.',
  
    independance: 'Le Prestataire organise librement son travail, ses horaires et ses méthodes, dans le respect des délais, des livrables et des exigences de qualité fixés au présent contrat. Il utilise ses propres moyens, sauf ceux que {alias} met expressément à sa disposition pour les besoins de la mission.\n{alias} définit les objectifs, les livrables et le calendrier de remise ; {alias} ne donne pas d’ordres sur la manière d’exécuter la prestation et n’exerce aucun pouvoir disciplinaire.\nLe Prestataire reste libre d’exercer d’autres activités, sous réserve de l’article relatif aux conflits d’intérêts. Il ne peut se faire remplacer ou assister qu’avec l’accord écrit préalable {de}.',
    regularite: 'Le Prestataire déclare exercer son activité de prestation de services de manière régulière : il est immatriculé lorsque la réglementation l’exige (registre du commerce et du crédit mobilier, registre des métiers, NINEA) et effectue les déclarations requises auprès des institutions de prévoyance sociale et de l’inspection du travail et de la sécurité sociale, conformément à la réglementation en vigueur.\nLe Code du travail interdisant le travail dissimulé et le recours sciemment, directement ou par personne interposée, aux services d’une personne qui l’exerce (articles 284 et 285), le Prestataire remet à {alias}, avant le premier paiement, copie de ses justificatifs d’immatriculation et de déclaration, et l’informe sans délai de toute modification. À défaut, le commanditaire peut suspendre tout règlement, sans que le retard qui en résulte puisse lui être reproché.',
    personnel: 'La mission est confiée au Prestataire à titre personnel : il l’exécute sans recourir à des salariés ni à des sous-traitants, sauf accord écrit préalable {de}. Si un tel accord est donné, le Prestataire demeure seul employeur de son personnel, supporte seul le paiement des salaires, des congés payés et des cotisations sociales, et remet à {alias}, avant le démarrage puis tous les six (06) mois, l’attestation de régularité sociale délivrée par l’inspection du travail et de la sécurité sociale du lieu d’exécution (articles 287 et 291 du Code du travail).\nLa prestation n’a pas pour objet la fourniture de main-d’œuvre : le Prestataire l’exécute avec son savoir-faire propre et dans le cadre d’une organisation autonome, de sorte qu’elle ne constitue pas une opération de marchandage au sens de l’article 291 du Code du travail. Le Prestataire garantit {alias} contre toute réclamation de son personnel ou des institutions de prévoyance sociale (articles 288 et 289).',
    securite: 'Lorsque la mission comporte des interventions dans les locaux, établissements ou chantiers {de} ou du Client pouvant présenter des risques particuliers, {alias} et le Prestataire définissent conjointement, avant l’intervention, les mesures de prévention appropriées (article 313 du Code du travail). Avant sa première intervention, le Prestataire suit la formation pratique aux risques particuliers que l’entreprise utilisatrice lui dispense (article 314), respecte les consignes de sécurité du site et signale sans délai tout accident ou incident. En cas d’accident, l’avis à l’inspecteur du travail et de la sécurité sociale est donné par l’employeur de l’entreprise où s’exécute l’intervention (article 316).',
    fiscal: 'Le Prestataire est seul responsable de ses obligations fiscales et sociales (immatriculation, déclarations, impôts, taxes et cotisations dus au titre de son activité indépendante) ; il indique son numéro d’identification (NINEA) lorsqu’il en dispose.\nLes sommes dues sont réglées sur présentation d’une facture ou d’une note d’honoraires régulière, sous déduction, le cas échéant, des retenues à la source prévues par la législation fiscale sénégalaise en vigueur, que {alias} opère et reverse à l’administration fiscale.',
    normes: 'Réalisera les prestations et remplira les obligations découlant du présent contrat de façon diligente, efficace et économique, conformément aux règles de l’art et aux pratiques généralement acceptées dans sa profession ;\nSe comportera toujours en partenaire loyal {de} et l’informera sans délai de toute difficulté de nature à compromettre l’exécution de la mission.',
    qualite: 'Le Prestataire gère librement son temps dans l’exécution des prestations qui lui sont confiées. {alias}, en tant que commanditaire, fixe le calendrier de remise des livrables et peut, à tout moment, contrôler leur conformité et apprécier leur qualité ; le Prestataire corrige à ses frais les non-conformités qui lui sont imputables.',
    conflit: 'Le Prestataire s’abstiendra de toute relation susceptible de compromettre son indépendance dans le cadre de l’exécution de sa mission.\nPendant la durée du contrat et à son issue, il s’interdit de fournir des biens, travaux ou services destinés à tout projet découlant des prestations objet du présent contrat ou ayant un rapport étroit avec elles, sauf accord écrit {de} (à l’exception de l’exécution de ces prestations et de leur éventuelle continuation).',
    confidentialite: 'Le Prestataire s’engage à garder totalement confidentiels, et ce sans limitation de durée, les documents et informations reçus ou portés à sa connaissance dans le cadre de la mission et du présent contrat.\nIl ne pourra à aucun moment, sauf consentement écrit du Client, rendre publiques des informations sur les recommandations formulées au cours ou par suite des prestations réalisées.\nIl ne pourra, sauf dans la mesure nécessaire à l’exécution de la mission, ni publier ni divulguer aucun élément du présent contrat sans le consentement préalable écrit {de}.',
    donnees: 'Dans le cadre de la mission, le Prestataire peut avoir accès à des données à caractère personnel (notamment celles des personnes concernées par le projet). Il s’engage à les traiter uniquement pour les besoins de la mission et sur instruction {de}, conformément à la loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel, à en garantir la sécurité et la confidentialité, à ne les copier ni les conserver à l’issue de la mission et à signaler sans délai toute perte ou divulgation.',
    propriete: 'Les rapports, études, données, bases de données, documents et autres livrables produits par le Prestataire dans le cadre du présent contrat sont la propriété {de} et, le cas échéant, du Client.\nLe Prestataire cède à {alias}, à titre exclusif et au fur et à mesure de leur réalisation, les droits patrimoniaux d’auteur qu’il pourrait détenir sur ces livrables, pour toute la durée de protection légale, pour tous pays et sur tous supports, conformément à la loi n° 2008-09 du 25 janvier 2008 sur le droit d’auteur et les droits voisins. Cette cession est comprise dans les honoraires. Le Prestataire conserve ses droits moraux ainsi que son savoir-faire antérieur à la mission.',
    penalites: 'Si le Prestataire est dans l’impossibilité d’assurer les prestations qui lui sont confiées dans les délais prévus, il en avise {alias} immédiatement et, en tout état de cause, avant l’expiration du délai, en soumettant dans le même temps à son appréciation les justifications (force majeure ou autre) qu’il pourrait fournir. Cette prescription est impérative.\nÀ défaut de justification admise, et après mise en demeure écrite restée sans effet, une pénalité de {taux} pour mille du montant des honoraires est due par jour de retard imputable au Prestataire, dans la limite de {plafond} % de ce montant. Cette pénalité constitue une clause pénale, sans préjudice du pouvoir d’appréciation du juge.',
    forceMajeure: 'Aucune des parties n’est responsable d’un manquement à ses obligations dû à un cas de force majeure, c’est-à-dire à un événement imprévisible, irrésistible et extérieur à la partie qui l’invoque. Cette dernière le notifie à l’autre par écrit dans les meilleurs délais ; les obligations concernées sont suspendues pendant la durée de l’événement.\nSi l’empêchement dépasse trente (30) jours, chaque partie peut résilier le contrat sans indemnité, les prestations déjà réalisées restant dues.',
    resiliation: 'Chaque partie peut mettre fin au contrat à tout moment, par écrit, moyennant un préavis de {preavis} jours.\nEn cas de manquement grave de l’une des parties à ses obligations, ou de manquements répétés préjudiciables à la bonne exécution de la mission, l’autre partie peut résilier le contrat sans préavis, après mise en demeure écrite restée sans effet pendant huit (08) jours.\nEn cas de résiliation, les prestations régulièrement exécutées jusqu’à la date d’effet sont rémunérées au prorata ; le Prestataire remet à {alias} les travaux en cours et restitue les documents, données et matériels qui lui ont été confiés.',
    finales: 'Le présent contrat exprime l’intégralité de l’accord des parties sur son objet. Toute modification ou prolongation fait l’objet d’un avenant écrit signé des deux parties. Si l’une de ses stipulations était déclarée nulle, les autres demeureraient applicables.'
  };
  const serviceDefaults = (p, name) => ({
    alias: str(p && p.alias) || deriveAlias(name), cin: '', tel: '', email: '', ninea: '', numero: '',
    intitule: '', client: '', contratPrincipal: '', taches: [], supervision: '', risques: false,
    remunMode: 'global', montant: 0, nature: 'brut', perdiem: 0, jalons: [], delaiPaiement: 30, apresClient: false,
    moyens: { virement: true, cheque: true, mobile: false }, penaliteTaux: 0, penalitePlafond: 10, preavis: 15, litige: 'tribunal',
    clauses: Object.assign({}, SERVICE_CLAUSES)
  });
  const cddClause = (k, type) => (k === 'duree' ? (CLAUSES_CDD.duree[type] || '') : (isCdd(type) ? CLAUSES_CDD[k] : CLAUSES[k]));
  const uid = () => 'ct-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

  /** Contrat vierge, pré-rempli avec le profil de l'entreprise. */
  function blankContract(company, today) {
    const p = (company && company.profile) || {};
    return {
      id: uid(), number: '', status: 'brouillon', createdAt: today || '', updatedAt: today || '',
      employer: { prefixe: str(p.prefixe), name: str((company && (company.employer || company.name))), siege: str(p.siege), representant: str(p.representant), qualite: str(p.qualite) || 'gérant(e)', activite: str(p.activite), signataire: str(p.signataire) || 'Le Directeur Général' },
      worker: { civilite: 'Monsieur', nom: '', prenoms: '', sexe: 'M', naissance: '', lieuNaissance: '', pays: 'Sénégal', nationalite: 'Sénégalaise', pere: '', mere: '', domicile: '', famille: 'celibataire', enfants: 0, conjointRevenus: false, epouses: 0, nomsEpouses: '', nomsEnfants: '' },
      job: { projetNom: '', projetObjet: '', fonctionDetail: '', copieInspection: false, emploi: '', classification: '', convention: 'Convention collective nationale du commerce du 16 novembre 1956', dateEngagement: '', type: 'CDI', dateFin: '', essaiMois: 3, essaiRenouvelable: true, horaire: 40, lieu: str(p.siege), lieuSignature: str(p.ville) || 'Dakar', dateContrat: '', exemplaires: 4, ncActif: false, ncMois: 6, ncKm: 30, ncMontant: 0 },
      salary: { base: 0, sursalaire: 0, logement: 0, anciennetePct: 0, transport: 0 },
      service: serviceDefaults(p, company && (company.employer || company.name)),
      clauses: { references: CLAUSES.references.slice(), conges: CLAUSES.conges, prevoyance: CLAUSES.prevoyance, discipline: CLAUSES.discipline, mobilite: CLAUSES.mobilite, duree: '' },
      dmt: null
    };
  }

  /* Textes par défaut de l'ancien Code du travail (loi n° 97-17, abrogée par la loi n° 2026-18) : remplacés à l'ouverture d'un contrat enregistré, sauf s'ils ont été personnalisés. */
  const LEGACY = {
    ref0: 'Loi n° 2026-18 du 3 septembre 2026 portant Code du travail du Sénégal et ses textes d’application.',
    conges: ['Le travailleur bénéficiera de congés payés conformément aux articles L148 et L150 du Code du travail, ainsi qu’aux dispositions prévues par la Convention collective nationale interprofessionnelle.', 'Le travailleur bénéficiera de congés payés conformément aux articles 54 et suivants de la Convention collective nationale interprofessionnelle.'],
    discipline: 'Le travailleur s’engage au respect de la discipline. Sauf dans le cadre de ses obligations professionnelles, il gardera le secret sur les informations dont il a eu connaissance par le fait ou à l’occasion de l’exercice de ses fonctions, notamment sur les procédés et résultats de travaux réalisés par l’entreprise.\nPendant l’exécution du contrat, le travailleur consacre toute son activité professionnelle à l’entreprise, sauf dérogation stipulée au contrat ; il lui est loisible d’exercer, en dehors de son temps de travail, toute activité professionnelle non susceptible de concurrencer l’entreprise ou de nuire à la bonne exécution des services convenus (article 295 du Code du travail).',
    duree: ['Le présent contrat est prévu pour une durée de {duree}, du {debut} au {fin}.', 'Le présent contrat est conclu pour la durée du projet « {projet} »{objet}. Il prend effet le {debut} et prend fin de plein droit à l’achèvement du projet{finPrevue}. Cette date n’est donnée qu’à titre prévisionnel. Conclu pour l’exécution d’un ouvrage déterminé, le contrat ne peut être ni renouvelé ni prolongé (article 100 du Code du travail) ; la poursuite des services après l’achèvement du projet vaut contrat à durée indéterminée (article 101).']
  };
  const isForeign = (n) => { const s = str(n).toLowerCase(); return !!s && !/s[ée]n[ée]gal/.test(s); };
  /** Complète un contrat enregistré avec les valeurs par défaut manquantes (anciens enregistrements). */
  function normalize(c, company) {
    const b = blankContract(company, '');
    const out = Object.assign({}, b, c);
    ['employer', 'worker', 'job', 'salary', 'clauses'].forEach((k) => { out[k] = Object.assign({}, b[k], (c && c[k]) || {}); });
    if (!Array.isArray(out.clauses.references)) out.clauses.references = CLAUSES.references.slice();
    out.service = Object.assign({}, b.service, (c && c.service) || {});
    out.service.clauses = Object.assign({}, b.service.clauses, (c && c.service && c.service.clauses) || {});
    out.service.moyens = Object.assign({}, b.service.moyens, (c && c.service && c.service.moyens) || {});
    ['taches', 'jalons'].forEach((k) => { if (!Array.isArray(out.service[k])) out.service[k] = []; });
    if (out.clauses.references[0] === LEGACY.ref0) out.clauses.references[0] = CLAUSES.references[0];
    if (LEGACY.conges.includes(out.clauses.conges)) out.clauses.conges = cddClause('conges', out.job.type);
    if (out.clauses.discipline === LEGACY.discipline) out.clauses.discipline = CLAUSES.discipline;
    if (LEGACY.duree.includes(out.clauses.duree)) out.clauses.duree = cddClause('duree', out.job.type);
    if (!STATUS.includes(out.status)) out.status = 'brouillon';
    if (!TYPE_LABEL[out.job.type]) out.job.type = 'CDI';
    if (isCdd(out.job.type) && !str(out.clauses.duree)) out.clauses.duree = CLAUSES_CDD.duree[out.job.type];
    return out;
  }

  /** Change le type de contrat en adaptant les valeurs par défaut non personnalisées (clauses, essai, copie à l'inspection). */
  function switchType(c, type) {
    if (!TYPE_LABEL[type]) return c;
    const old = c.job.type; c.job.type = type;
    if (isService(type)) { c.job.essaiMois = 0; c.job.copieInspection = false; if (type === 'LDC' && num(c.job.exemplaires) === 4) c.job.exemplaires = 2; if (type === 'PRESTATION' && num(c.job.exemplaires) === 2) c.job.exemplaires = 4; return c; }
    if (isService(old)) { c.job.essaiMois = type === 'CDI' ? 3 : 0; c.job.copieInspection = isCdd(type); if (num(c.job.exemplaires) === 2) c.job.exemplaires = 4; }
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

  /** Montants d'un contrat de prestation : honoraires, en lettres, échéances (en %) converties en FCFA, per diem. */
  function serviceTotals(c) {
    const s = (c && c.service) || {}, montant = Math.max(0, Math.round(num(s.montant))), jalons = (s.jalons || []).map((x) => ({ pct: num(x.pct), libelle: str(x.libelle), montant: Math.round(montant * num(x.pct) / 100) }));
    const pct = jalons.reduce((a, x) => a + x.pct, 0);
    return { montant, enLettres: amountWords(montant), jalons, pctTotal: Math.round(pct * 100) / 100, perdiem: Math.max(0, Math.round(num(s.perdiem))), perdiemEnLettres: amountWords(s.perdiem) };
  }
  /** « 30 | Livrable 1 : rapport de démarrage » (une échéance par ligne) ↔ [{ pct, libelle }]. */
  const parseJalons = (text) => String(text == null ? '' : text).split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => { const m = /^(\d+(?:[.,]\d+)?)\s*(?:%|\|)?\s*[|:–-]?\s*(.*)$/.exec(l); return m ? { pct: num(m[1]), libelle: str(m[2]) } : { pct: 0, libelle: l }; });
  const jalonsText = (arr) => (arr || []).map((x) => num(x.pct) + ' | ' + str(x.libelle)).join('\n');

  function validateService(c) {
    const errors = [], warnings = [], w = c.worker || {}, j = c.job || {}, s = c.service || {}, e = c.employer || {}, t = serviceTotals(c);
    const label = j.type === 'LDC' ? 'la lettre de commande' : 'le contrat';
    if (!str(w.nom)) errors.push('Le nom du prestataire est obligatoire.');
    if (!str(w.prenoms)) errors.push('Les prénoms du prestataire sont obligatoires.');
    if (!str(s.intitule)) errors.push('L’intitulé de la mission (titre de l’activité) est obligatoire.');
    if (!iso(j.dateEngagement)) errors.push('La date de début d’exécution est obligatoire.');
    if (iso(j.dateFin) && iso(j.dateEngagement) && j.dateFin <= j.dateEngagement) errors.push('La date de fin doit être postérieure à la date de début.');
    if (!(t.montant > 0)) errors.push('Le montant des honoraires doit être supérieur à 0.');
    if (num(s.perdiem) < 0) errors.push('Le per diem ne peut pas être négatif.');
    if (t.jalons.length && Math.abs(t.pctTotal - 100) > 0.01) errors.push('Les échéances de paiement doivent totaliser 100 % (actuellement ' + t.pctTotal + ' %).');
    if (num(s.penaliteTaux) < 0 || num(s.penalitePlafond) < 0) errors.push('Les pénalités ne peuvent pas être négatives.');
    if (!str(j.emploi)) warnings.push('Fonction / profil du prestataire non renseigné (ex. Assistant de projet, Ingénieur HSE).');
    if (!(s.taches || []).length) warnings.push('Aucune tâche listée : décrivez les activités confiées au prestataire.');
    if (!str(s.client)) warnings.push('Client final non renseigné (contrat principal à l’origine de la mission).');
    if (!iso(j.dateFin)) warnings.push('Date de fin non renseignée : la durée de la mission n’est pas précisée dans ' + label + '.');
    if (!str(s.cin)) warnings.push('N° de pièce d’identité (CIN) du prestataire non renseigné.');
    if (!str(s.ninea)) warnings.push('NINEA / immatriculation non renseignés : sans justificatif de régularité, l’entreprise qui recourt à ses services s’expose au grief de travail dissimulé (articles 284 et 285 du Code du travail) ; vérifiez aussi le statut fiscal (retenue à la source, facture).');
    if (!str(s.tel) && !str(s.email)) warnings.push('Aucun moyen de contact (téléphone ou e-mail) pour le prestataire.');
    if (!str(w.domicile)) warnings.push('Adresse du prestataire non renseignée.');
    if (!str(e.siege)) warnings.push('Siège de l’entreprise non renseigné.');
    if (!str(e.representant)) warnings.push('Représentant de l’entreprise non renseigné.');
    const mois = iso(j.dateEngagement) && iso(j.dateFin) ? Math.round((dayDiff(j.dateEngagement, j.dateFin) + 1) / 30.44) : 0;
    if (s.remunMode === 'mensuel' && mois >= 6) warnings.push('Risque de requalification : des honoraires mensuels fixes sur ' + mois + ' mois ressemblent à un salaire. Si le prestataire est en pratique subordonné (horaires imposés, exclusivité, hiérarchie), le juge peut y voir un contrat de travail : privilégiez un prix global par livrable et l’autonomie d’organisation.');
    if (/supervision directe|sous (?:la )?(?:direction|autorit)/i.test(str(s.supervision))) warnings.push('Le mot « supervision directe / autorité » suggère un lien de subordination : parlez plutôt de coordination et de validation des livrables.');
    return { errors, warnings, valid: errors.length === 0 };
  }

  /** Contrôles de saisie : errors bloquent l'impression, warnings sont affichés. */
  function validate(c) {
    if (isService((c.job || {}).type)) return validateService(c);
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
    if (j.type === 'CDD' && iso(j.dateEngagement) && iso(j.dateFin) && Math.round((dayDiff(j.dateEngagement, j.dateFin) + 1) / 30.44) > 24) errors.push('Un CDD à terme précis ne peut pas dépasser deux (02) ans (article 100 du Code du travail) : raccourcissez-le, ou choisissez « CDD pour la durée d’un projet » si le contrat porte sur un ouvrage déterminé.');
    if (isCdd(j.type)) warnings.push('Rappel CDD : il ne peut pas pourvoir durablement un emploi lié à l’activité normale et permanente de l’entreprise, sous peine de valoir CDI (article 97), et doit être déposé à l’inspection du travail avant tout début d’exécution (article 99).');
    if (num(j.essaiMois) > 6) errors.push('La période d’essai ne peut pas dépasser six (06) mois, renouvellement et prolongation compris (article 94 du Code du travail).');
    else if (j.essaiRenouvelable && num(j.essaiMois) * 2 > 6) warnings.push('Essai renouvelable : renouvellement compris, la durée totale ne peut pas dépasser six (06) mois (article 94) ; le renouvellement devra être limité en conséquence.');
    if (num(j.horaire) > 40) warnings.push('Horaire supérieur à la durée légale de 40 heures par semaine (article 241) : les heures au-delà sont des heures supplémentaires (article 244).');
    if (isForeign(w.nationalite)) warnings.push('Travailleur étranger : le contrat doit être écrit et visé par le Directeur général du Travail et de la Sécurité sociale avant tout début d’exécution, sous peine de nullité (article 105 du Code du travail).');
    if (j.ncActif) {
      if (num(j.ncMois) <= 0 || num(j.ncMois) > 6) errors.push('Interdiction de concurrence après le contrat : six (06) mois au maximum (article 295 du Code du travail).');
      if (num(j.ncKm) <= 0 || num(j.ncKm) > 30) errors.push('Interdiction de concurrence après le contrat : rayon de trente (30) kilomètres au maximum autour du lieu de travail (article 295).');
      if (!(num(j.ncMontant) > 0)) errors.push('Interdiction de concurrence après le contrat : une compensation financière, convenue à la signature, est obligatoire (article 295) ; à défaut la clause est nulle.');
    }
    ['base', 'sursalaire', 'logement', 'anciennetePct', 'transport'].forEach((k) => { if (num(s[k]) < 0) errors.push('Le montant « ' + k + ' » ne peut pas être négatif.'); });
    if (iso(w.naissance)) { const age = dayDiff(w.naissance, (j.dateEngagement && iso(j.dateEngagement)) || new Date().toISOString().slice(0, 10)) / 365.25; if (age < 15) errors.push('Le travailleur doit avoir au moins 15 ans à la date d’engagement.'); if (age > 75) warnings.push('Âge supérieur à 75 ans : vérifiez la date de naissance.'); if (age >= 15 && age < 18) warnings.push('Jeune travailleur (moins de 18 ans) : le contrat est signé par son représentant légal et visé par l’inspecteur du travail et de la sécurité sociale avant tout début d’exécution, sous peine de nullité (article 106 du Code du travail).'); }
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
  function nextNumber(list, today, type) {
    const y = String(today || '').slice(0, 4) || String(new Date().getFullYear()), pre = { LDC: 'LDC', PRESTATION: 'PS' }[type] || 'CT', re = new RegExp('^' + pre + '-([0-9]{4})-([0-9]+)$');
    const used = (list || []).map((c) => { const m = re.exec(str(c.number)); return m && m[1] === y ? Number(m[2]) : 0; });
    return pre + '-' + y + '-' + String(Math.max(0, ...used) + 1).padStart(3, '0');
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
      if (isService(j.type)) {
        if (iso(j.dateFin)) { const d = dayDiff(today, j.dateFin), what = (j.type === 'LDC' ? 'La lettre de commande' : 'La mission') + ' de ' + name; if (d < 0) out.push({ id: c.id, level: 'late', text: what + ' est arrivée à échéance depuis ' + Math.abs(d) + ' j : clôturer, ou prolonger par avenant écrit.' }); else if (d <= 30) out.push({ id: c.id, level: d <= 7 ? 'urgent' : 'soon', text: what + ' prend fin le ' + j.dateFin.split('-').reverse().join('/') + ' (' + d + ' j).' }); }
        return;
      }
      const te = trialEnd(c);
      if (te) { const d = dayDiff(today, te); if (d >= 0 && d <= 15) out.push({ id: c.id, level: d <= 7 ? 'urgent' : 'soon', text: 'Fin de période d’essai de ' + name + ' le ' + te.split('-').reverse().join('/') + ' (' + d + ' j).' }); }
      if (isCdd(j.type) && iso(j.dateFin)) { const d = dayDiff(today, j.dateFin), what = j.type === 'CDD_PROJET' ? 'La fin prévisionnelle du projet' + (str(j.projetNom) ? ' « ' + str(j.projetNom) + ' »' : '') + ' (CDD de ' + name + ')' : 'Le CDD de ' + name; if (d < 0) out.push({ id: c.id, level: 'late', text: what + ' est dépassé' + (j.type === 'CDD_PROJET' ? 'e' : '') + ' depuis ' + Math.abs(d) + ' j : renouveler par écrit (un seul renouvellement, articles 100 et 103) ou clôturer — la poursuite des services vaudrait CDI de plein droit (article 101).' }); else if (d <= 30) out.push({ id: c.id, level: d <= 7 ? 'urgent' : 'soon', text: what + ' arrive à échéance le ' + j.dateFin.split('-').reverse().join('/') + ' (' + d + ' j).' }); }
      if (!c.dmt || c.dmt.status !== 'établie') out.push({ id: c.id, level: 'info', text: 'DMT à établir pour ' + name + '.' });
    });
    return out;
  }

  const api = { isForeign, LEGACY, TYPE_LABEL, TYPE_SHORT, isCdd, isService, amountWords, deriveAlias, deAlias, SERVICE_CLAUSES, serviceTotals, parseJalons, jalonsText, monthsBetween, switchType, durationWords, dureeText, numWords, withDigits, longDate, CLAUSES_CDD, STATUS, FAMILLE, OBJETS, CLAUSES, DMT_EXTRA, blankContract, normalize, fullName, salaryTotals, trialEnd, addMonths, validate, nextNumber, dmtView, dmtMissing, alertsOf, num, iso };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CorintaContracts = api;
})(typeof window !== 'undefined' ? window : globalThis);
