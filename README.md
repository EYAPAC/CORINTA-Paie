# CORINTA Paie

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
- Export/import d’une sauvegarde JSON en mode local.
- Cumuls annuels bruts fiscaux et non imposables, droits de congés acquis et solde de jours disponibles.
- TRIMF selon la situation familiale choisie.
- **Synchronisation formulaire → bulletin** : tout champ de la préparation met le bulletin à jour (événements `input`, `change`, `keyup`, `paste`, `cut`, `blur`, y compris pour les champs ajoutés dynamiquement). Les états invalides du formulaire sont réparés, une erreur de recalcul est affichée au lieu d’être silencieuse, un témoin « Bulletin synchronisé · hh:mm:ss » est visible, et le bouton **Actualiser le bulletin** force un recalcul complet. Sous la date d’embauche et les congés pris, l’ancienneté, les congés acquis et le solde s’affichent en direct.
- **Export Excel du bulletin** (skill `corinta-pay-bulletin-excel`) : module `excel-bulletin.js`, séparé du moteur de paie, qui ne fait que présenter les résultats de `update()` (index.html). Le classeur contient la feuille visible « Bulletin de paie » (A4 portrait, une page, mise en page fidèle au modèle) et deux feuilles masquées et protégées : « Calculs » (lignes de paie, formules SOMME.SI, net recalculé, contrôle d'écart) et « Paramètres » (taux, barèmes, références légales). Les montants sont de vrais nombres, reliés par formules à « Calculs », avec recalcul à l'ouverture. Avant l'export, une validation compare le net recalculé au net du moteur et refuse le fichier en cas d'écart, d'erreur de formule ou de fusions qui se chevauchent. Le bouton **Aperçu Excel** affiche le rendu avant téléchargement. Pour changer le design : modifier uniquement les constantes `T`, `COL_WIDTHS`, `ROW_H` et `S` en tête du module.

Le repère initial des droits congés est de 2 jours ouvrables par mois de service, valeur paramétrable. Vérifiez les règles applicables à la convention collective et au salarié.

## Règles de calcul (références)

Vérifiées sur le CGI du Sénégal annoté (octobre 2025) et le Code du travail :

- **IR** (CGI art. 173) : barème progressif 0/20/30/35/37/40 % jusqu’à 50 M FCFA puis 43 %, base arrondie au millier inférieur ; abattement de 30 % plafonné à 900 000 FCFA/an, représentatif des cotisations de retraite et des frais (pas de déduction IPRES séparée) ; l’impôt ne peut excéder 43 % du revenu imposable.
- **Parts et réduction familiale** (art. 174) : célibataire 1 part, marié 1 part, +0,5 part si un seul conjoint a des revenus, +0,5 part par enfant, 5 parts maximum ; réduction de 10 % à 45 % avec minimum et maximum selon le nombre de parts.
- **TRIMF** (art. 275 à 282) : 6 tranches sur le revenu brut annuel, avantages en argent inclus (indemnité de transport comprise, remboursements de frais justifiés exclus) ; le salarié paie aussi pour un conjoint sans revenus.
- **IPRES** : régime général 5,6 % salarié / 8,4 % employeur jusqu’à 432 000 FCFA ; régime complémentaire (RCC) 2,4 % / 3,6 % de 432 000 à 1 296 000 FCFA, appliqué **automatiquement à tout salarié dont le salaire dépasse le plafond du régime général** et en service depuis au moins 30 jours (nouveau Code de la sécurité sociale, art. 243 ; partage 60/40, art. 245), sans condition de statut. Une exclusion manuelle reste possible au cas par cas (champ « Régime complémentaire IPRES »).
- **Mise en conformité des archives** : Archives → « Recalculer les bulletins archivés » affiche l’écart de net et de congés acquis bulletin par bulletin ; vous cochez ceux à modifier, une sauvegarde JSON est téléchargée avant l’écriture.
- **Congés** (règle unique dans `leave-rules.js`, couverte par `tests/leave-rules.test.mjs`) : 2 jours ouvrables × le nombre de **mois civils écoulés depuis le mois d’embauche, mois de la période exclu** ; le jour d’embauche dans le mois est sans effet (ex. embauche le 01/07/2026 : bulletin de février 2027 = 7 mois = 14 jours ; embauche en avril, bulletin d’octobre = 6 mois = 12 jours). Le détail du calcul est affiché sous la date d’embauche et imprimé sur le bulletin ; la version de l’application est visible en bas du menu. Le congé est exigible après 12 mois de service effectif (nouveau Code du travail, art. 248-249, publié au JO du 17/09/2026) : le bulletin indique la date d’exigibilité tant que ce délai n’est pas atteint.
- **Sécurité sociale** : le nouveau Code de la sécurité sociale (en vigueur depuis le 17/09/2026) renvoie les taux et plafonds à des textes d’application non encore publiés ; les taux IPRES/CSS actuels sont conservés.
- **Non encore intégrés (à confirmer par décret ou convention)** : jours de congé supplémentaires (jeunes travailleurs, mères de famille), majorations d’heures supplémentaires, congé de maternité de 18 semaines.

## Données et contrôle d’accès

En local, les données restent dans le navigateur. En cloud, la sauvegarde JSON de l’application est stockée dans la base Neon du projet. Cette première version vise un administrateur unique ou une équipe partageant une clé protégée ; pour plusieurs gestionnaires RH, ajouter une authentification individuelle, des rôles par entreprise, un journal d’audit et une politique de sauvegarde avant l’usage en production.

Le déploiement réel nécessite un compte Vercel connecté et la création de l’intégration PostgreSQL.
La version inclut aussi la saisie des heures supplémentaires avec taux de majoration ajustables, l’export du bulletin courant au format Excel .xlsx, et la suppression d’un bulletin depuis les archives ou le dossier entreprise. Les taux de jour par défaut sont 15 % pour la première tranche hebdomadaire puis 40 % au-delà ; l’administrateur peut les modifier selon l’accord de branche applicable.
