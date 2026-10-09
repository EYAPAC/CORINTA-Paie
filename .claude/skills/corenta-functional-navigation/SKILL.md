---
name: corenta-functional-navigation
description: Rendre chaque menu, bouton, lien et raccourci de Corinta Pay réellement opérationnel, en conservant le contexte de l'entreprise.
---

# Navigation fonctionnelle

## Règles
- Aucun bouton décoratif : chaque élément déclenche une action réelle (`CorintaUI.act`, `CorintaWS.open/go`, `activateView`) ou est retiré.
- Contexte : l'identifiant du dossier ouvert suit toute la navigation (menu principal, barre du dossier, bulletin, archives).
- Deux niveaux : menu principal (Tableau de bord, Entreprises, Paramètres) et barre du dossier (Tableau de bord, Employés, Bulletins de paie, Déclarations sociales et fiscales, Charges et cotisations, Documents, Informations, Paramètres de l'entreprise).
- Formulaires : valider les saisies, afficher les erreurs, persister (localStorage) puis rafraîchir les blocs concernés.
- Fonction inexistante : la développer si elle tient dans le périmètre, sinon signaler clairement la limite.

## Vérification
Parcourir tous les éléments interactifs dans le navigateur, noter l'action obtenue, vérifier la persistance après rechargement et l'actualisation des indicateurs.

## Critères de réussite
Chaque élément fait ce qu'il annonce, dans le bon dossier.
