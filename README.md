# CORINTA Paie

Application web avec deux choix administrateur : stockage local sur l’appareil ou synchronisation avec PostgreSQL Neon relié au projet Vercel.

## Déploiement

Relier ce dépôt GitHub à un projet Vercel. Choisir **Other**, sans commande de build, et `.` comme répertoire de sortie. Vercel sert `index.html` et la fonction `api/store.js`.

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

Le repère initial des droits congés est de 2 jours ouvrables par mois de service, valeur paramétrable. Vérifiez les règles applicables à la convention collective et au salarié.

## Données et contrôle d’accès

En local, les données restent dans le navigateur. En cloud, la sauvegarde JSON de l’application est stockée dans la base Neon du projet. Cette première version vise un administrateur unique ou une équipe partageant une clé protégée ; pour plusieurs gestionnaires RH, ajouter une authentification individuelle, des rôles par entreprise, un journal d’audit et une politique de sauvegarde avant l’usage en production.

Le déploiement réel nécessite un compte Vercel connecté et la création de l’intégration PostgreSQL.
La version inclut aussi la saisie des heures supplémentaires avec taux de majoration ajustables, l’export du bulletin courant au format Excel .xlsx, et la suppression d’un bulletin depuis les archives ou le dossier entreprise. Les taux de jour par défaut sont 15 % pour la première tranche hebdomadaire puis 40 % au-delà ; l’administrateur peut les modifier selon l’accord de branche applicable.
