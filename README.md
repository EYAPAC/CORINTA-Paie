# Corinta Pay

Application web avec deux choix administrateur : stockage local sur l’appareil ou synchronisation avec PostgreSQL Neon relié au projet Vercel.

## Déploiement

Relier ce dépôt Git à Vercel (la racine du dépôt est le projet : `index.html`, `api/`, `vercel.json`). Les variables attendues sont listées dans `.env.example`. Les tests de l’API se lancent avec `npm install && npm test`. Choisir **Other**, sans commande de build, et `.` comme répertoire de sortie. Vercel sert `index.html` et la fonction `api/store.js`.

Pour activer la base cloud :

1. Relier une base Neon/PostgreSQL depuis le Vercel Marketplace. L’intégration fournit le secret serveur `DATABASE_URL`.
2. Créer `APP_ADMIN_TOKEN` dans les variables d’environnement du projet Vercel avec une longue clé aléatoire. Ne pas mettre cette clé dans les fichiers.
3. Déployer, ouvrir **Paramétrage → Stockage des données**, choisir le cloud, saisir cette clé pour la session puis cliquer **Tester / synchroniser le cloud**. La première synchronisation demande confirmation avant d’envoyer les dossiers, salariés, paramètres et bulletins du navigateur à la base cloud.

La clé PostgreSQL reste côté serveur. Le mode cloud utilise une clé administrateur partagée, sans comptes nominatifs ni permissions par entreprise. Le contrôle de révision bloque un écrasement silencieux si une session plus ancienne tente d’écrire. Le choix **Local** conserve le stockage navigateur et arrête la synchronisation distante.

## Fonctionnalités

- Dossiers par entreprise, fiches salariés et archives de bulletins associées.
- **Deux niveaux de tableau de bord** (barre supérieure globale : recherche, entreprise active, période, alertes) :
  - **Tableau de bord général** (menu « Tableau de bord », écran d'arrivée) : toutes les entreprises ensemble — entreprises, salariés, masse salariale brute et variation, bulletins par statut, évolution de la masse salariale, répartition des charges, raccourcis, alertes de toutes les entreprises et liste des dossiers (bouton « Ouvrir »). Ses totaux sont la somme exacte des tableaux de chaque dossier.
  - **Tableau de bord d'une entreprise**, à l'intérieur de son dossier (Entreprise → clic sur un dossier, onglet « Tableau de bord ») : salariés, masse salariale, bulletins, prochaine échéance, cycle de paie, courbe d'évolution (brute, nette, charges patronales, coût total ; 6 mois, 12 mois ou plage au choix), anneau de répartition des charges, et la **liste des salariés** (salarié et poste, période, net à payer, statut, actions Voir / Télécharger) classée par statut (Payé, Validé, À valider, Brouillon, puis sans bulletin). Les autres onglets du dossier (Salariés, Bulletins de paie, Charges fiscales et sociales) restent accessibles.
  - **Aucune donnée inventée** : tout est calculé à partir des bulletins et salariés enregistrés (`dashboard.js`, testé) ; sans donnée, un état vide est affiché. Les mois sans bulletin ne sont pas tracés.
  - **Statuts de bulletin** : Brouillon, À valider (par défaut à l'enregistrement), Validé, Payé ; « Erreur » est automatique si le brut ou le net est nul. Le statut se change depuis le tableau.
  - **Échéances légales** : IPRES et CSS dans les 15 premiers jours du mois suivant si l'employeur occupe 20 salariés ou plus, du **trimestre** suivant sinon (CSS art. 93) ; impôts retenus (IR, TRIMF) et CFCE avant le 15 du mois suivant (CGI art. 185 et 268), ou du trimestre suivant selon le mode choisi dans Paramétrage (réel simplifié, contribution globale unique, retenues ≤ 20 000 FCFA par mois). Les 6 derniers mois traités sont suivis ; une échéance dépassée depuis plus de 45 jours est supposée réglée ; chaque échéance se marque « faite » (par trimestre quand elle est trimestrielle).
  - **Design system** : `design-system.css` (jetons de couleur, typographie, cartes, KPI, badges, tableaux, boutons, graphiques, alertes, états vide/chargement/erreur, responsive). Les nouveaux écrans utilisent les classes `cp-*`.
- Export/import d’une sauvegarde JSON en mode local.
- Cumuls annuels bruts fiscaux et non imposables, droits de congés acquis et solde de jours disponibles.
- TRIMF selon la situation familiale choisie.
- **Synchronisation formulaire → bulletin** : tout champ de la préparation met le bulletin à jour (événements `input`, `change`, `keyup`, `paste`, `cut`, `blur`, y compris pour les champs ajoutés dynamiquement). Les états invalides du formulaire sont réparés, une erreur de recalcul est affichée au lieu d’être silencieuse, un témoin « Bulletin synchronisé · hh:mm:ss » est visible, et le bouton **Actualiser le bulletin** force un recalcul complet. Sous la date d’embauche et les congés pris, l’ancienneté, les congés acquis et le solde s’affichent en direct.
- **Export Excel du bulletin** (skill `corinta-pay-bulletin-excel`) : module `excel-bulletin.js`, séparé du moteur de paie, qui ne fait que présenter les résultats de `update()` (index.html). Le classeur contient la feuille visible « Bulletin de paie » (A4 portrait, une page, mise en page fidèle au modèle) et deux feuilles masquées et protégées : « Calculs » (lignes de paie, formules SOMME.SI, net recalculé, contrôle d'écart) et « Paramètres » (taux, barèmes, références légales). Les montants sont de vrais nombres, reliés par formules à « Calculs », avec recalcul à l'ouverture. Avant l'export, une validation compare le net recalculé au net du moteur et refuse le fichier en cas d'écart, d'erreur de formule ou de fusions qui se chevauchent. Le bouton **Aperçu Excel** affiche le rendu avant téléchargement. Pour changer le design : modifier uniquement les constantes `T`, `COL_WIDTHS`, `ROW_H` et `S` en tête du module.

Le repère initial des droits congés est de 2 jours ouvrables par mois de service, valeur paramétrable. Vérifiez les règles applicables à la convention collective et au salarié.

## Navigation à deux niveaux

- **Menu principal** (barre bleue, `shell.js`) : Tableau de bord (général), Entreprises (liste alphabétique, recherche, création), Paramètres (paramètres de paie).
- **Barre du dossier** (apparaît à l'ouverture d'une entreprise, visuellement distincte) : Tableau de bord · Employés · Bulletins de paie · Déclarations sociales et fiscales · Charges et cotisations · Documents · Informations de l'entreprise · Paramètres de l'entreprise, plus un retour à la liste.
- « Créer un bulletin » est un bouton des pages Employés et Bulletins de paie ; « Archives » est une carte de Documents (l'onglet Documents reste actif sur cet écran).
- Tableau de bord du dossier : 4 cartes + 3 panneaux, largeur minimale fixe avec défilement horizontal sur écran étroit (pas d'empilement). Thème bleu commun ; sur mobile le menu devient un tiroir.

## Skills de travail (`.claude/skills/`)

`corenta-audit-existing-app`, `corenta-dashboard-design`, `corenta-pay-data-integrity`, `corenta-functional-navigation`, `corenta-regression-testing` : procédures à suivre pour toute évolution (audit sans reconstruction, composition du tableau de bord, intégrité des données, navigation fonctionnelle, tests). Claude Code les charge au lancement depuis ce dossier.

Le menu principal est rétractable (bouton en haut du menu ou Ctrl+B) : il se réduit en rail d'icônes, préférence mémorisée, réduit par défaut sous 1 180 px. « Paramètres » déplie un sous-menu qui défile jusqu'à la carte voulue (stockage, barèmes, taux, IR, TRIMF, rubriques). Sous 900 px, le menu devient un tiroir. Aucune dépendance ajoutée (modèles inspirés de shadcn/ui « icon rail » et Flowbite « sidebar »).

## Espace dossier d'entreprise

Ouvrir un dossier (« Ouvrir » ou clic dans la liste) affiche un espace dédié (`workspace.js` / `workspace.css`) : menu latéral (Tableau de bord, Employés, Paie, Déclarations sociales, Documents, Paramètres), barre de recherche limitée au dossier, cloche d'échéances, KPI, graphique d'évolution, répartition des charges, raccourcis, derniers bulletins, informations importantes et carte d'aide. Toutes les valeurs viennent des bulletins et paramètres existants (aucune donnée inventée : états vides sinon). Le bouton « Contacter le support » utilise l'e-mail saisi dans Paramètres de paie → Tableau de bord.

## Conformité légale stricte

- **Source unique** : `legal-rules.js` contient les barèmes et règles (IR, parts, TRIMF, IPRES RG et RCC, CSS, CFCE, échéances) avec l'article de référence. Le moteur de paie n'a plus de barème en dur ailleurs.
- **Vérifié par test** : `tests/legal-rules.test.mjs` compare le module à une implémentation de référence indépendante (plus de 4 000 combinaisons salaire × parts, toutes les frontières de tranche TRIMF, cas calculés à la main). Un test de bout en bout dans le navigateur a de plus comparé le **bulletin affiché** à ce calcul indépendant sur près de 500 cas.
- **Barèmes verrouillés** : dans Paramétrage, l'IR, la TRIMF, l'IPRES, les parts, la CSS et la CFCE sont en lecture seule (seul le taux d'accident du travail, 1, 3 ou 5 %, se règle). Tout barème altéré (import, ancienne sauvegarde, modification détournée) est détecté et **rétabli à l'ouverture et à chaque enregistrement**. Un **mode dérogatoire** explicite (arrêté, convention) permet de personnaliser ; il est signalé sur chaque bulletin.
- **Base légale sur chaque bulletin** : bases, taux, plafonds et articles de l'IR, de la TRIMF, de l'IPRES (régime général et complémentaire), de la CSS et de la CFCE, imprimés avec le bulletin et repris dans l'export Excel.
- **À actualiser ici** si un arrêté ou une loi de finances modifie un taux ou un plafond (taux et plafonds IPRES/CSS fixés par arrêté, CSS art. 74).
- **Non modélisé** : plafond de 1,5 part des non-résidents (CGI art. 176), parts spéciales des parents isolés (art. 175), abattements des agents diplomatiques, exonérations de CFCE des entreprises nouvelles ou minières (art. 263-264).

## Règles de calcul (références)

Vérifiées sur le CGI du Sénégal annoté (octobre 2025) et le Code du travail :

- **IR** (CGI art. 173) : barème progressif 0/20/30/35/37/40 % jusqu’à 50 M FCFA puis 43 %, base arrondie au millier inférieur ; abattement de 30 % plafonné à 900 000 FCFA/an, représentatif des cotisations de retraite et des frais (pas de déduction IPRES séparée) ; l’impôt ne peut excéder 43 % du revenu imposable.
- **Parts et réduction familiale** (art. 174) : célibataire 1 part, marié 1 part, +0,5 part si un seul conjoint a des revenus, +0,5 part par enfant, 5 parts maximum ; réduction de 10 % à 45 % avec minimum et maximum selon le nombre de parts.
- **TRIMF** (art. 275 à 282) : 6 tranches sur le revenu brut annuel (traitements, indemnités et avantages ; remboursements de frais justifiés exclus, car sans caractère de salaire) ; le salarié paie aussi pour un conjoint sans revenus (art. 276).
- **CFCE** (art. 265 à 269) : 3 % du brut, remboursements de frais et prestations familiales exclus ; versée avec l'IR.
- **CSS** (art. 73 et 75) : prestations familiales 7 % et accident du travail 1, 3 ou 5 % selon l'activité, plafond 63 000 FCFA, à la charge exclusive de l'employeur.
- **IPRES** : régime général 5,6 % salarié / 8,4 % employeur jusqu’à 432 000 FCFA ; régime complémentaire (RCC) 2,4 % / 3,6 % de 432 000 à 1 296 000 FCFA, appliqué **automatiquement à tout salarié dont le salaire dépasse le plafond du régime général** et en service depuis au moins 30 jours (nouveau Code de la sécurité sociale, art. 243 ; partage 60/40, art. 245), sans condition de statut. Une exclusion manuelle reste possible au cas par cas (champ « Régime complémentaire IPRES »).
- **Mise en conformité des archives** : Archives → « Recalculer les bulletins archivés » affiche l’écart de net et de congés acquis bulletin par bulletin ; vous cochez ceux à modifier, une sauvegarde JSON est téléchargée avant l’écriture.
- **Congés** (règle unique dans `leave-rules.js`, couverte par `tests/leave-rules.test.mjs`) : 2 jours ouvrables × le nombre de **mois civils écoulés depuis le mois d’embauche, mois de la période exclu** ; le jour d’embauche dans le mois est sans effet (ex. embauche le 01/07/2026 : bulletin de février 2027 = 7 mois = 14 jours ; embauche en avril, bulletin d’octobre = 6 mois = 12 jours). Le détail du calcul est affiché sous la date d’embauche et imprimé sur le bulletin ; la version de l’application est visible en bas du menu. Le congé est exigible après 12 mois de service effectif (nouveau Code du travail, art. 248-249, publié au JO du 17/09/2026) : le bulletin indique la date d’exigibilité tant que ce délai n’est pas atteint.
- **Sécurité sociale** : le nouveau Code de la sécurité sociale (en vigueur depuis le 17/09/2026) renvoie les taux et plafonds à des textes d’application non encore publiés ; les taux IPRES/CSS actuels sont conservés.
- **Non encore intégrés (à confirmer par décret ou convention)** : jours de congé supplémentaires (jeunes travailleurs, mères de famille), majorations d’heures supplémentaires, congé de maternité de 18 semaines.

## Données et contrôle d’accès

En local, les données restent dans le navigateur. En cloud, la sauvegarde JSON de l’application est stockée dans la base Neon du projet. Cette première version vise un administrateur unique ou une équipe partageant une clé protégée ; pour plusieurs gestionnaires RH, ajouter une authentification individuelle, des rôles par entreprise, un journal d’audit et une politique de sauvegarde avant l’usage en production.

Le déploiement réel nécessite un compte Vercel connecté et la création de l’intégration PostgreSQL.
La version inclut aussi la saisie des heures supplémentaires avec taux de majoration ajustables, l’export du bulletin courant au format Excel .xlsx, et la suppression d’un bulletin depuis les archives ou le dossier entreprise. Les taux de jour par défaut sont 15 % pour la première tranche hebdomadaire puis 40 % au-delà ; l’administrateur peut les modifier selon l’accord de branche applicable.
