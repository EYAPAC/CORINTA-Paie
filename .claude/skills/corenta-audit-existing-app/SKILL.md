---
name: corenta-audit-existing-app
description: Auditer et modifier Corinta Pay (anciennement Corenta Pay) sans le reconstruire : à utiliser avant toute modification du code de l'application.
---

# Auditer l'application existante

## Objectif
Modifier Corinta Pay en place, sans application parallèle ni réécriture.

## Architecture à connaître (vérifier avant chaque mission)
- Application statique : `index.html` (deux gros scripts inline en portée globale) + modules `legal-rules.js`, `leave-rules.js`, `excel-bulletin.js`, `dashboard.js`, `dashboard-ui.js`, `workspace.js`, `shell.js`, `legal-ui.js`.
- Données : localStorage (`paieSettings`, `paieCompanies`, `paieHistory`, `paieStorageMode`) ; globales `S`, `ORG`, `readHistoryStore()`.
- Navigation : `activateView(v)` (vues dashboard, pay, config, history, companies) enveloppée par plusieurs modules ; espace dossier = `CorintaWS` ; menu = `CorintaShell`.
- Styles : `design-system.css` (jetons `--cp-*`), `workspace.css`.

## Méthode
1. Lire les fichiers concernés et `README.md` ; lister points d'entrée, routes (vues) et dépendances entre modules.
2. Chercher l'existant (`grep`) avant de créer : composant, fonction, test.
3. Réutiliser les services métier (`CorintaLegal`, `CorintaLeave`, `CorintaDash`) ; ne jamais recalculer une règle de paie dans l'affichage.
4. Limiter le diff au périmètre ; ne supprimer aucune donnée ni fonctionnalité ; conserver les anciens identifiants DOM lus par le code hérité.
5. Corriger un fichier à la fois, valider la syntaxe (`node --check`, `new Function` sur les scripts inline) avant d'écrire.
6. Lancer `node --test tests/` après chaque lot.

## Critères de réussite
- Aucune application parallèle ; aucune régression ; diff relu ; tests au vert ; README à jour.
