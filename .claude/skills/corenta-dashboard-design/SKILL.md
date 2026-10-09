---
name: corenta-dashboard-design
description: Reproduire la composition visuelle du tableau de bord d'un dossier d'entreprise (modèle bleu) : 4 cartes + 3 panneaux, navigation à deux niveaux.
---

# Design du tableau de bord

## Référence
La capture fournie par le propriétaire : menu principal bleu foncé, zone claire, barre secondaire du dossier, cartes blanches à bordure fine et coins arrondis.

## Composition obligatoire (stable)
- Rangée 1 (4 cartes) : Total des employés · Masse salariale brute · Nombre de bulletins générés · Prochaines échéances.
- Rangée 2 (3 panneaux) : Évolution de la masse salariale · Répartition des charges · Raccourcis.
- Rangée 3 : derniers bulletins · informations importantes.
- Ne jamais empiler ces rangées en colonne : fixer une largeur minimale de grille (`.ws-dash`) et laisser un défilement horizontal maîtrisé.

## Règles
- Réutiliser les composants `cp-*` et les jetons de `design-system.css` ; couleurs bleues communes à toute l'application.
- Séparer visuellement : menu principal (sombre, à gauche) / barre du dossier (claire, en haut).
- Pas d'élément décoratif sans fonction ; textes lisibles, contraste ≥ 4,5:1.

## Vérification
Capture à 1440 px et à une largeur étroite : les 4 + 3 blocs restent côte à côte ; comparer à la référence.

## Critères de réussite
Composition identique à la référence, vivante (données réelles), sans image statique.
