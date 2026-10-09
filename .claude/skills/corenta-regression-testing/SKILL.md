---
name: corenta-regression-testing
description: Tester Corinta Pay et prévenir les régressions : tests unitaires, parcours navigateur, cloisonnement des entreprises, écrans multiples.
---

# Tests et régression

## Procédure
1. `node --test tests/` (tout doit passer) ; ajouter des tests pour toute logique nouvelle (`tests/*.test.mjs`).
2. Parcours navigateur (Playwright si disponible, sinon le navigateur intégré) : liste des entreprises, ouverture/changement de dossier, filtres de période, boutons et raccourcis, persistance après rechargement.
3. Cloisonnement : créer deux entreprises avec bulletins, vérifier qu'aucun montant ne passe de l'une à l'autre.
4. États : chargement, erreur, période sans bulletin, entreprise vide.
5. Écrans : 1440, 1024 et 390 px ; pas de défilement horizontal parasite, composition du tableau de bord conservée.
6. Console du navigateur sans erreur ; aucun secret ou salaire dans les journaux.

## Compte rendu
Lister les tests exécutés, ceux qui échouent et leur correction. Ne jamais déclarer réussi un test non exécuté.

## Critères de réussite
Résultats réels et documentés ; anomalies corrigées avant livraison.
