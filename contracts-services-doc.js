/* Corinta Pay — contrat de prestation de services et lettre de commande : modèles de documents (même moteur que les contrats de travail :
   aperçu, impression, fichier Word). Contenus issus des modèles du cabinet (« Modèle de contrat de prestation de service », « Modèle Lettre de
   commande (LDC) »), améliorés : prestataire indépendant (pas de lien de subordination), honoraires en lettres, échéances en tableau,
   fiscalité, confidentialité, données personnelles (loi 2008-12), propriété intellectuelle (loi 2008-09), pénalités, force majeure, litiges. */
(function (root) {
  'use strict';
  const X = root.CorintaContractsExport; if (!X || !X.H) return;
  const { R, B, BU, P, money, frDate, K: getK } = X.H;
  const str = (v) => (v == null ? '' : String(v).trim());
  const NATURE = { net: 'net', brut: 'brut (avant déduction des retenues à la source)', ht: 'hors taxes', ttc: 'toutes taxes comprises' };

  /** Variables des clauses : {alias} {de} {preavis} {taux} {plafond}. */
  function fillText(text, s) {
    const K = getK();
    const al = str(s.alias), aAl = /^les +/i.test(al) ? al.replace(/^les +/i, 'aux ') : /^le +/i.test(al) ? al.replace(/^le +/i, 'au ') : 'à ' + al;
    return String(text || '').replace(/à \{alias\}/g, aAl).replace(/\{alias\}/g, al).replace(/\{de\}/g, K.deAlias(s.alias)).replace(/\{preavis\}/g, String(Math.round(K.num(s.preavis)) || 15))
      .replace(/\{taux\}/g, String(K.num(s.penaliteTaux))).replace(/\{plafond\}/g, String(K.num(s.penalitePlafond)));
  }
  function context(d) {
    const K = getK(), s = d.service, w = d.worker, j = d.job, e = d.employer, fem = w.sexe === 'F';
    return { K, s, w, j, e, fem, civ: fem ? 'Madame' : (w.civilite || 'Monsieur'), nom: K.fullName(w), totals: K.serviceTotals(d), ne: fem ? 'née' : 'né', denomme: fem ? 'dénommée' : 'dénommé', alias: str(s.alias) || 'le Cabinet' };
  }
  const clause = (c, key, o) => String(fillText(c.s.clauses[key], c.s)).split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => P(x, Object.assign({ a: 'j', sa: 6, ln: 1.15 }, o)));
  const bullet = (text, o) => P(text, Object.assign({ num: '•', numB: 0, li: 40, hang: 16, a: 'j', sa: 2 }, o));
  const employerRuns = (c) => {
    const e = c.e, rep = str(e.representant), m = rep.match(/^(monsieur|madame|mademoiselle|m\.|mme)\s+(.*)$/i);
    return [[e.prefixe, e.name].filter(Boolean).join(' '), e.siege ? ', ayant son siège social à ' + e.siege : '', rep ? ', représenté(e) par ' : '', m ? m[1] + ' ' : '', rep ? B(m ? m[2] : rep) : '', rep && e.qualite ? ', en sa qualité de ' + e.qualite : ''];
  };
  const providerRuns = (c) => {
    const { w, s, K } = c, bits = [];
    bits.push(c.civ + ' ', B(K.fullName(w) || '………'));
    if (K.iso(w.naissance) || str(w.lieuNaissance)) bits.push(', ' + c.ne + (K.iso(w.naissance) ? ' le ' + frDate(w.naissance) : '') + (str(w.lieuNaissance) ? ' à ' + str(w.lieuNaissance) : ''));
    if (str(w.nationalite)) bits.push(', de nationalité ' + str(w.nationalite).toLowerCase());
    if (str(s.cin)) bits.push(', titulaire de la carte nationale d’identité n° ' + str(s.cin));
    if (str(w.domicile)) bits.push(', demeurant à ' + str(w.domicile));
    if (str(s.ninea)) bits.push(', immatriculé(e) sous le NINEA ' + str(s.ninea));
    return bits;
  };
  const amountPhrase = (c) => {
    const t = c.totals, base = t.enLettres + ' (' + money(t.montant) + ') francs CFA ' + NATURE[c.s.nature || 'brut'];
    return c.s.remunMode === 'mensuel' ? 'fixé à la somme de ' + base + ' par mois de prestation effective' : 'fixé à la somme globale et forfaitaire de ' + base + ', pour l’ensemble de la mission';
  };
  const natureNote = (c) => ({ net: 'Le montant étant convenu net, les retenues à la source éventuellement applicables sont supportées par ' + c.alias + '.', ht: 'La taxe sur la valeur ajoutée, si le Prestataire y est assujetti, s’ajoute au montant hors taxes dans les conditions de la législation fiscale en vigueur.', ttc: 'Ce montant inclut la taxe sur la valeur ajoutée applicable, le cas échéant.', brut: '' }[c.s.nature || 'brut'] || '');
  const durationText = (c) => {
    const { j, K } = c, a = K.iso(j.dateEngagement), b = K.iso(j.dateFin), dur = K.durationWords(a, b);
    return 'La mission débute le ' + (a ? K.longDate(a) : '………') + (b ? ' et s’achève le ' + K.longDate(b) + (dur ? ' (durée : ' + dur + ')' : '') : ' et se poursuit jusqu’à l’achèvement des prestations') + '.';
  };
  const supervisor = (c) => str(c.s.supervision) || 'un référent désigné par ' + c.alias;
  /* contractions : « à le » → « au », « à les » → « aux », « de le » → « du », « de les » → « des », élision devant une voyelle */
  const aa = (x) => (/^les +/i.test(x) ? String(x).replace(/^les +/i, 'aux ') : /^le +/i.test(x) ? String(x).replace(/^le +/i, 'au ') : 'à ' + x);
  const dd = (x) => (/^les +/i.test(x) ? String(x).replace(/^les +/i, 'des ') : /^le +/i.test(x) ? String(x).replace(/^le +/i, 'du ') : getK().deAlias(x));
  const lst = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' ou ' + a[a.length - 1] : a.join(''));
  const tasks = (c, o) => (c.s.taches.length ? c.s.taches : ['(à préciser)']).map((t) => bullet(t, o));
  const place = (c) => str(c.j.lieuSignature) || 'Dakar';
  const sigBlock = (c, left, right) => ({ k: 'sign', cols: [
    [P([B(left)], { a: 'c', sa: 40, kn: 1 }), P(c.nom, { a: 'c', sa: 2 }), P('(Signature précédée de la mention', { a: 'c', sz: 9 }), P('« Lu et approuvé »)', { a: 'c', sz: 9 })],
    [P([B(right)], { a: 'c', sa: 40, kn: 1 }), P(str(c.e.representant).replace(/^(monsieur|madame|mademoiselle|m\.|mme)\s+/i, ''), { a: 'c', sa: 2 })]] });
  const jalonsTable = (c, withTotal) => {
    const t = c.totals, rows = [[[R('Part')], [R('Livrable / condition de paiement')], [R('Montant (FCFA)')]]].concat(t.jalons.map((x) => [[R(x.pct + ' %')], [R(x.libelle || '—')], [R(money(x.montant))]]));
    if (withTotal) rows.push([[B('100 %')], [B('Total des honoraires')], [B(money(t.montant))]]);
    return { k: 'tab', border: 1, head: 1, widths: [48, 290, 115], right: [2], rows };
  };

  /* ───────── Contrat de prestation de services ───────── */
  function prestationModel(d) {
    const c = context(d), { s, j, totals: t } = c, blocks = []; let n = 0;
    const art = (title) => P([BU('Article ' + (++n)), B(' : ' + title)], { a: 'l', sb: 12, sa: 6, kn: 1 });
    const body = (txt, o) => P(txt, Object.assign({ a: 'j', sa: 6, ln: 1.15 }, o));
    blocks.push({ k: 'box', lines: ['CONTRAT DE PRESTATION', 'DE SERVICES'] });
    blocks.push(P(['Entre ', employerRuns(c), ','], { a: 'j', sb: 30, sa: 6, ln: 1.15 }), body(['Ci-après dénommé(e) « ', B(c.alias), ' »,']), P('Et', { a: 'l', sa: 6 }));
    blocks.push(body([providerRuns(c), ', ' + c.denomme + ' ci-après « ', B('le Prestataire'), ' ».']), body('Il a été convenu et arrêté ce qui suit :', { sb: 4 }));

    blocks.push(art('Objet du contrat'));
    blocks.push(body([c.alias + ' requiert les services de ' + c.civ + ' ', B(c.nom), ', ci-après le Prestataire, en qualité ', B(dd(str(j.emploi) || '………')), ', pour la mission suivante : ', B(str(s.intitule) || '………'), '.']));
    if (str(s.client) || str(s.contratPrincipal)) blocks.push(body([c.alias + ' s’est vu confier par ' + (str(s.client) || 'son client') + ' (ci-après « le Client »)' + (str(s.contratPrincipal) ? ', aux termes du contrat de prestation intitulé « ' + str(s.contratPrincipal) + ' »' : '') + ', une mission dans le cadre de laquelle intervient le Prestataire.']));
    if (str(s.projet)) blocks.push(body('Cette mission s’inscrit dans le projet « ' + str(s.projet) + ' ».'));
    blocks.push(...clause(c, 'nature'));

    blocks.push(art('Missions et responsabilités du Prestataire'));
    blocks.push(body('Il assure, en particulier, les activités suivantes :', { sa: 3 }), ...tasks(c));
    blocks.push(body('Normes d’exécution — dans le cadre de l’exécution du contrat, le Prestataire :', { sb: 6, sa: 3 }));
    String(fillText(s.clauses.normes, s)).split(/\n+/).filter(Boolean).forEach((x) => blocks.push(bullet(x.trim())));

    blocks.push(art('Engagements de ' + c.alias));
    blocks.push(body(c.alias + ' met à la disposition du Prestataire les informations, accès et moyens nécessaires à l’accomplissement de la mission. Le Prestataire rend compte de l’avancement de ses travaux (points d’étape, remise des livrables) ' + aa(supervisor(c)) + ', interlocuteur chargé de la coordination et de la validation des livrables ; cette coordination ne crée aucun lien de subordination.'));

    blocks.push(art('Honoraires'));
    blocks.push(body('En contrepartie des prestations réalisées, ' + c.alias + ' paie au Prestataire des honoraires dont le montant est ' + amountPhrase(c) + '.' + (s.remunMode === 'mensuel' ? ' Tout mois incomplet est payé au prorata du nombre de jours de prestation effective.' : '')));
    if (natureNote(c)) blocks.push(body(natureNote(c)));
    if (t.perdiem > 0) blocks.push(body(c.alias + ' verse directement au Prestataire un per diem, au taux maximal de ' + t.perdiemEnLettres + ' (' + money(t.perdiem) + ') francs CFA par nuitée passée sur le terrain à sa demande, destiné à couvrir forfaitairement ses dépenses de restauration, d’hébergement et ses frais de téléphone.'));
    blocks.push(...clause(c, 'fiscal'));

    blocks.push(art('Modalités et moyens de paiement'));
    const mo = [s.moyens.virement && 'Virement bancaire', s.moyens.cheque && 'Chèque', s.moyens.mobile && 'Paiement mobile'].filter(Boolean);
    blocks.push(body('Les moyens de paiement acceptés par le Prestataire sont les suivants :', { sa: 3 }), ...(mo.length ? mo : ['À convenir entre les parties']).map((x) => bullet(x)));
    if (t.jalons.length) {
      blocks.push(body('Les règlements s’effectuent sur présentation de facture, après validation par ' + supervisor(c) + ', selon l’échéancier suivant :', { sb: 6, sa: 4 }), jalonsTable(c, true));
    } else blocks.push(body(s.remunMode === 'mensuel' ? 'Les honoraires sont payables mensuellement à terme échu, sur présentation de la facture et de la feuille de temps visée par ' + supervisor(c) + '.' : 'Les honoraires sont payables à l’achèvement de la mission, sur présentation de la facture, après remise et validation des livrables par ' + supervisor(c) + '.', { sb: 6 }));
    blocks.push(body('Le règlement intervient dans un délai de ' + (Math.round(c.K.num(s.delaiPaiement)) || 30) + ' jours à compter de la réception de la facture validée' + (s.apresClient ? ' et du paiement correspondant par le Client' : '') + '. L’absence ou la non-conformité des pièces justificatives peut entraîner la retenue des montants concernés.'));

    blocks.push(art('Durée et lieu des prestations'));
    blocks.push(body('Les prestations sont exécutées ' + (str(j.lieu) ? 'à ' + str(j.lieu) : 'au lieu convenu entre les parties') + '. ' + durationText(c) + ' Le contrat ne se renouvelle pas tacitement : toute prolongation fait l’objet d’un avenant écrit.'));

    blocks.push(art('Indépendance et statut du Prestataire')); blocks.push(...clause(c, 'independance'));
    blocks.push(art('Régularité de l’activité du Prestataire')); blocks.push(...clause(c, 'regularite'));
    blocks.push(art('Personnel et sous-traitance')); blocks.push(...clause(c, 'personnel'));
    if (s.risques) { blocks.push(art('Sécurité et santé au travail')); blocks.push(...clause(c, 'securite')); }
    blocks.push(art('Conflit d’intérêts')); blocks.push(...clause(c, 'conflit'));
    blocks.push(art('Confidentialité et protection des données personnelles')); blocks.push(...clause(c, 'confidentialite'), ...clause(c, 'donnees'));
    blocks.push(art('Propriété intellectuelle')); blocks.push(...clause(c, 'propriete'));
    blocks.push(art('Retards et pénalités'));
    if (c.K.num(s.penaliteTaux) > 0) blocks.push(...clause(c, 'penalites'));
    else blocks.push(body('Si le Prestataire est dans l’impossibilité d’assurer les prestations dans les délais prévus, il en avise ' + c.alias + ' immédiatement et, en tout état de cause, avant l’expiration du délai, en soumettant dans le même temps à son appréciation les justifications (force majeure ou autre) qu’il pourrait fournir. Cette prescription est impérative.'));
    blocks.push(art('Force majeure')); blocks.push(...clause(c, 'forceMajeure'));
    blocks.push(art('Résiliation')); blocks.push(...clause(c, 'resiliation'));
    blocks.push(art('Loi applicable et règlement des litiges'));
    blocks.push(body('Le présent contrat est régi par le droit sénégalais. Les parties s’efforcent de régler à l’amiable tout différend relatif à son interprétation ou à son exécution.'));
    blocks.push(body(s.litige === 'arbitrage' ? 'À défaut d’accord dans un délai de trente (30) jours à compter de la notification écrite du différend, celui-ci est tranché définitivement par arbitrage, conformément à l’Acte uniforme de l’OHADA relatif au droit de l’arbitrage ; le tribunal arbitral siège à Dakar, statue en droit sénégalais et en langue française.' : 'À défaut d’accord dans un délai de trente (30) jours à compter de la notification écrite du différend, celui-ci est soumis aux juridictions compétentes de Dakar.'));
    blocks.push(art('Dispositions finales')); blocks.push(...clause(c, 'finales'));

    blocks.push(P('Fait à ' + place(c) + ', le ' + (c.K.longDate(j.dateContrat || j.dateEngagement) || '………') + ', en ' + c.K.withDigits(j.exemplaires || 2) + ' exemplaires originaux.', { a: 'l', sb: 18, sa: 20, kn: 1 }));
    blocks.push(sigBlock(c, 'Le Prestataire', str(c.e.signataire) || 'Le Directeur Général'));
    return { kind: 'contract', blocks, font: 'Times New Roman', sz: 11, margin: 2.5 };
  }

  /* ───────── Lettre de commande de services ───────── */
  function ldcModel(d) {
    const c = context(d), { s, j, w, totals: t } = c, blocks = []; let n = 0;
    const art = (title) => P([B('Article ' + (++n) + ' : ' + title)], { a: 'l', sb: 12, sa: 5, kn: 1 });
    const sub = (num, title) => P([B(num + ' ' + title)], { a: 'l', sb: 6, sa: 3, kn: 1 });
    const body = (txt, o) => P(txt, Object.assign({ a: 'j', sa: 5, ln: 1.1 }, o));
    const numero = str(s.numero) || str(d.number) || '………';
    blocks.push(P([R('LETTRE DE COMMANDE DE SERVICES N° ' + numero, { b: 1, sz: 14 })], { a: 'c', sa: 8 }));
    blocks.push(P('Date : Le ' + (c.K.longDate(j.dateContrat || j.dateEngagement) || '………'), { a: 'r', sa: 4 }));
    blocks.push(P([R('Montant : ' + money(t.montant) + ' F CFA' + (s.remunMode === 'mensuel' ? ' par mois' : ''), { b: 1, sz: 12 })], { a: 'c', sa: 8 }));
    const row = (l, v) => [[B(l)], [R(v || '—')]];
    blocks.push({ k: 'tab', border: 1, widths: [150, 303], rows: [
      row('Prestataire', c.civ + ' ' + c.nom), row('Date et lieu de naissance', [frDate(w.naissance), str(w.lieuNaissance) && 'à ' + str(w.lieuNaissance)].filter(Boolean).join(' ')),
      row('Adresse', str(w.domicile)), row('Tél / Mail', [str(s.tel), str(s.email)].filter(Boolean).join(' · ')), row('CIN / NINEA', [str(s.cin) && 'CIN ' + str(s.cin), str(s.ninea) && 'NINEA ' + str(s.ninea)].filter(Boolean).join(' · ')),
      row('Titre de l’activité', '« ' + (str(s.intitule) || '………') + ' »'), row('Fonction du prestataire', str(j.emploi)),
      row('Durée des prestations', c.K.durationWords(j.dateEngagement, j.dateFin) || '—'), row('Personne responsable', supervisor(c)), row('Lieu d’exécution', str(j.lieu)),
      row('Début d’exécution', c.K.longDate(j.dateEngagement)), row('Fin prévue', c.K.longDate(j.dateFin)), row('Projet', str(s.projet)), row('Payeur', c.alias)] });

    blocks.push(art('Parties contractantes'));
    blocks.push(body([employerRuns(c), ', ci-après « ', B(c.alias), ' »,']), P('ET', { a: 'c', sa: 4 }), body([providerRuns(c), ', ci-après « ', B('le Prestataire'), ' ».']));
    blocks.push(art('Objet de la commande'));
    blocks.push(sub('2.1.', 'Définition de la prestation'));
    blocks.push(body([c.alias + ' requiert les services de ', B(c.nom), ', ' + c.denomme + ' ici Prestataire, en qualité ' + dd(str(j.emploi) || '………') + ', dans le cadre de « ' + (str(s.intitule) || '………') + ' »' + (str(s.client) ? ', confié à ' + c.alias + ' par ' + str(s.client) + ' (ci-après « le Client »)' : '') + (str(s.contratPrincipal) ? ', aux termes du contrat de prestation intitulé « ' + str(s.contratPrincipal) + ' »' : '') + '.']));
    blocks.push(...clause(c, 'nature', { sa: 5 }));
    blocks.push(sub('2.2.', 'Description des tâches du Prestataire'));
    blocks.push(body('Les tâches du Prestataire sont les suivantes :', { sa: 3 }), ...tasks(c));

    blocks.push(art('Durée et lieu des prestations'));
    blocks.push(sub('3.1.', 'Lieu des prestations'));
    blocks.push(body('Les prestations sont réalisées ' + (str(j.lieu) ? 'à ' + str(j.lieu) : 'au lieu convenu entre les parties') + ', en coordination avec ' + supervisor(c) + '.'));
    blocks.push(sub('3.2.', 'Dates et durée prévues des prestations'));
    blocks.push(body(durationText(c) + ' Toute prolongation fait l’objet d’un avenant écrit.'));

    blocks.push(art('Prix'));
    blocks.push(sub('4.1.', 'Prix'));
    blocks.push(body('Le montant de la prestation est ' + amountPhrase(c) + '.' + (natureNote(c) ? ' ' + natureNote(c) : '')));
    if (t.perdiem > 0) { blocks.push(sub('4.2.', 'Per diem')); blocks.push(body(c.alias + ' verse directement au Prestataire un per diem, au taux maximal de ' + t.perdiemEnLettres + ' (' + money(t.perdiem) + ') francs CFA par nuitée passée sur le terrain, destiné à couvrir forfaitairement ses dépenses de restauration, d’hébergement et ses frais de téléphone.')); }

    blocks.push(art('Modalités de règlement'));
    blocks.push(sub('5.1.', 'Mode de règlement'));
    const mo = [s.moyens.virement && 'virement bancaire', s.moyens.cheque && 'chèque', s.moyens.mobile && 'paiement mobile'].filter(Boolean);
    blocks.push(body('Les paiements sont faits sur présentation de factures originales (ou de notes d’honoraires) pour les prestations réalisées, par ' + (lst(mo) || 'le moyen convenu entre les parties') + ', dans un délai de ' + (Math.round(c.K.num(s.delaiPaiement)) || 30) + ' jours à compter de la réception de la facture validée' + (s.apresClient ? ' et du paiement correspondant par le Client' : '') + '.'));
    blocks.push(body('Pièces justificatives — tous les justificatifs originaux nécessaires sont fournis avec les factures, notamment :', { sa: 3 }), bullet('la facture ou la note d’honoraires ;'), bullet(s.remunMode === 'mensuel' ? 'les feuilles de temps faisant apparaître les jours de travail effectif, visées par ' + supervisor(c) + ' ;' : 'les livrables ou rapports validés par ' + supervisor(c) + '.'));
    blocks.push(body('L’absence ou la non-conformité des pièces justificatives peut entraîner la retenue des montants concernés.', { sb: 3 }));
    blocks.push(sub('5.2.', 'Paiement'));
    if (t.jalons.length) blocks.push(body('Les règlements s’effectuent sur présentation de facture après validation du coordonnateur du projet, comme suit :', { sa: 4 }), jalonsTable(c, false));
    else blocks.push(body(s.remunMode === 'mensuel' ? 'Les honoraires sont payables mensuellement à terme échu, après validation de la feuille de temps.' : 'Les honoraires sont payables à l’achèvement de la prestation, après validation des livrables.'));
    blocks.push(...clause(c, 'fiscal', { sb: 3 }));

    blocks.push(art('Obligations du titulaire'));
    blocks.push(sub('6.1.', 'Réalisation de la prestation')); blocks.push(...clause(c, 'qualite'));
    blocks.push(sub('6.2.', 'Indépendance')); blocks.push(...clause(c, 'independance'));
    blocks.push(sub('6.3.', 'Régularité de l’activité du Prestataire')); blocks.push(...clause(c, 'regularite'));
    blocks.push(sub('6.4.', 'Personnel et sous-traitance')); blocks.push(...clause(c, 'personnel'));
    let k6 = 4; const nx = () => '6.' + (++k6) + '.';
    if (s.risques) { blocks.push(sub(nx(), 'Sécurité et santé au travail')); blocks.push(...clause(c, 'securite')); }
    blocks.push(sub(nx(), 'Confidentialité, données personnelles et propriété des livrables')); blocks.push(...clause(c, 'confidentialite'), ...clause(c, 'donnees'), ...clause(c, 'propriete'));
    blocks.push(sub(nx(), 'Conflit d’intérêts')); blocks.push(...clause(c, 'conflit'));

    blocks.push(art('Pénalités'));
    if (c.K.num(s.penaliteTaux) > 0) blocks.push(...clause(c, 'penalites'));
    else blocks.push(body('Si le Prestataire est dans l’impossibilité d’assurer les prestations qui lui sont confiées dans les délais prévus à l’article 3.2, il en avise ' + c.alias + ' immédiatement et, en tout état de cause, avant l’expiration du délai, et soumet dans le même temps à son appréciation les justifications présentant un caractère de force majeure ou autre qu’il pourrait fournir. Cette prescription est impérative.'));
    blocks.push(art('Force majeure')); blocks.push(...clause(c, 'forceMajeure'));
    blocks.push(art('Résiliation')); blocks.push(...clause(c, 'resiliation'));
    blocks.push(art('Loi applicable et litiges'));
    blocks.push(body('La présente lettre de commande est régie par le droit sénégalais. En l’absence de règlement amiable dans un délai de trente (30) jours à compter de la notification écrite du différend, ' + (s.litige === 'arbitrage' ? 'celui-ci est tranché par arbitrage conformément à l’Acte uniforme de l’OHADA relatif au droit de l’arbitrage (siège : Dakar ; droit sénégalais ; langue française).' : 'celui-ci est soumis aux juridictions compétentes de Dakar, désignées d’accord parties, pour toute contestation relative à l’interprétation ou à l’exécution de la présente lettre de commande.')));

    blocks.push(P('Fait en ' + c.K.withDigits(j.exemplaires || 2) + ' exemplaires originaux à ' + place(c) + ' le ' + (c.K.longDate(j.dateContrat || j.dateEngagement) || '………') + '.', { a: 'l', sb: 14, sa: 18, kn: 1 }));
    blocks.push(sigBlock(c, 'Le Prestataire de Services', 'Le Directeur du Cabinet'));
    return { kind: 'contract', blocks, font: 'Arial', sz: 10, margin: 2.5 };
  }

  /* ───────── Bulletin de paiement d'honoraires (prestataire indépendant : ce n'est pas un bulletin de salaire) ───────── */
  function honorairesModel(d, rec) {
    const c = context(d), s = d.service, K = c.K, h = K.computeHonoraires(d, rec), blocks = [], kind = d.job.type === 'LDC' ? 'Lettre de commande' : 'Contrat de prestation';
    const sgn = (n) => (n < 0 ? '− ' : '') + money(Math.abs(n)), row = (l, v) => [[B(l)], [R(v || '—')]];
    blocks.push({ k: 'box', lines: ['BULLETIN DE PAIEMENT', 'D’HONORAIRES'] });
    blocks.push(P([R('Prestataire indépendant : ce document n’est pas un bulletin de salaire.', { i: 1, sz: 9 })], { a: 'c', sb: 4, sa: 10 }));
    blocks.push({ k: 'tab', border: 1, widths: [150, 303], rows: [
      row('N° du bulletin', str(rec.numero)), row('Date d’émission', K.longDate(rec.date)), row('Entreprise', [d.employer.name, d.employer.siege].filter(Boolean).join(' — ')),
      row('Prestataire', c.civ + ' ' + c.nom + (str(s.ninea) ? ' (NINEA ' + str(s.ninea) + ')' : '')), row(kind, str(d.number) + (str(s.numero) ? ' (n° ' + str(s.numero) + ')' : '')),
      row('Projet', str(s.projet)), row('Client', str(s.client)), row('Mission', str(s.intitule)), row('Période / objet', str(rec.periode)),
      row('Rémunération prévue', s.remunMode === 'mensuel' ? 'Honoraires mensuels : ' + money(c.totals.montant) + ' FCFA' : 'Prix global : ' + money(c.totals.montant) + ' FCFA')] });
    blocks.push(P('', { sa: 8 }));
    blocks.push({ k: 'tab', border: 1, head: 1, widths: [215, 128, 110], right: [2], rows: [[[R('Désignation')], [R('Détail')], [R('Montant (FCFA)')]]].concat(
      h.lines.map((l) => [[R(l.label)], [R(l.detail || '')], [R(l.amount === 0 && l.info != null ? '(' + money(l.info) + ')' : sgn(l.amount))]]), [[[B('NET À PAYER')], [R('')], [B(money(h.net))]]]) });
    blocks.push(P(['Arrêté le présent bulletin à la somme de ', B(h.netEnLettres + ' francs CFA'), '.'], { a: 'l', sb: 4, sa: 8, kn: 1 }));
    const nat = { brut: 'Honoraires bruts : la retenue à la source, lorsqu’elle s’applique, est déduite et reversée à l’administration fiscale par ' + c.alias + '.', net: 'Honoraires convenus nets : les retenues à la source éventuelles sont supportées par ' + c.alias + ' et ne sont pas déduites.', ht: 'Honoraires hors taxes : la TVA, si le prestataire y est assujetti, est ajoutée au taux indiqué.', ttc: 'Honoraires toutes taxes comprises.' }[s.nature || 'brut'];
    blocks.push(P([R('Calcul établi d’après le ' + kind.toLowerCase() + ' ' + str(d.number) + (s.remunMode === 'mensuel' ? ' (prorata sur la base d’un mois de 30 jours). ' : '. ') + nat + ' Les impôts, taxes et cotisations propres à l’activité indépendante du prestataire restent à sa charge, conformément au contrat.', { sz: 9 })], { a: 'j', sa: 14 }));
    blocks.push({ k: 'sign', cols: [[P([B('Le Prestataire')], { a: 'c', sa: 36, kn: 1 }), P(c.nom, { a: 'c', sa: 2 }), P('(Bon pour acquit)', { a: 'c', sz: 9 })], [P([B(str(d.employer.signataire) || 'Le Directeur Général')], { a: 'c', sa: 36, kn: 1 }), P(str(d.employer.representant).replace(/^(monsieur|madame|mademoiselle|m\.|mme)\s+/i, ''), { a: 'c', sa: 2 })]] });
    return { kind: 'contract', blocks, font: 'Arial', sz: 10, margin: 2.5 };
  }
  X.honorairesModel = honorairesModel;
  X.serviceModels.PRESTATION = prestationModel;
  X.serviceModels.LDC = ldcModel;
})(typeof window !== 'undefined' ? window : globalThis);
