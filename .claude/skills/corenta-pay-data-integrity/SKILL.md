---
name: corenta-pay-data-integrity
description: Garantir que chaque indicateur de Corinta Pay vient des données réelles, par entreprise et par période, sans chiffre inventé.
---

# Intégrité des données (prioritaire)

## Règles
- Sources : `ORG` (entreprises/salariés) et `readHistoryStore()` (bulletins). Filtrer toujours par `companyId` ; aucun mélange entre entreprises.
- Calculs : uniquement via `CorintaDash.buildModel` et les modules légaux (`CorintaLegal`, `CorintaLeave`). Aucun recalcul d'IR, TRIMF, IPRES, CSS dans l'affichage.
- Statuts existants : Brouillon, À valider, Validé, Payé, Erreur ; ne pas confondre bulletin créé, validé et enregistré.
- Période : le sélecteur filtre tous les blocs ; « aucun bulletin » ≠ « montant nul » (afficher un état vide, jamais 0 inventé).
- Variation mensuelle : seulement si deux périodes comparables existent.
- Graphique en anneau : total = somme des parts, pas de double comptage ; pourcentages cohérents.
- Échéances : règles CSS art. 93 / CGI art. 185 déjà codées ; ne pas en inventer.
- Donnée manquante : le signaler et proposer une évolution compatible, sans valeur fictive. Aucun secret ni salaire nominatif dans les journaux.

## Vérification
Tests `tests/dashboard.test.mjs` (isolation entreprise, périodes, totaux) ; contrôle manuel : somme des bulletins = carte ; changer d'entreprise ne laisse aucune donnée de l'ancienne.

## Critères de réussite
Chaque chiffre affiché se retrouve dans les bulletins enregistrés de l'entreprise et de la période choisies.
