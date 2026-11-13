@echo off
chcp 65001 >nul
rem Synchronise ce dossier avec GitHub (EYAPAC/CORINTA-Paie) : récupère, enregistre vos changements, envoie.
rem Double-cliquez sur ce fichier. Vercel republie le site automatiquement après l'envoi.
cd /d "%~dp0"
git rev-parse --is-inside-work-tree >nul 2>&1 || (echo Ce dossier n'est pas un depot git. & pause & exit /b 1)
echo [1/4] Recuperation depuis GitHub...
git pull --rebase --autostash origin main || (echo ECHEC de la recuperation : resolvez le conflit puis relancez. & pause & exit /b 1)
echo [2/4] Controle des tests...
node --test tests/ >nul 2>&1 || (echo Des tests echouent : envoi annule. Lancez "node --test tests/" pour voir le detail. & pause & exit /b 1)
echo [3/4] Enregistrement des changements...
git add -A -- . ":!.env" ":!.env.*" ":!.vercel" ":!node_modules"
git diff --cached --quiet && (echo Aucun changement a enregistrer.) || git commit -m "chore: synchronisation %date% %time:~0,5%"
echo [4/4] Envoi vers GitHub...
git push origin main || (echo ECHEC de l'envoi. & pause & exit /b 1)
echo Termine : le dossier et GitHub sont synchronises.
pause
