/*
 * Corinta Pay — mise à jour automatique des bulletins enregistrés.
 *
 * Chaque bulletin porte l'empreinte des règles avec lesquelles il a été calculé (rulesRev). Dès que les règles changent
 * (barèmes légaux, taux et plafonds, règles familiales, congés, formules du moteur), tous les bulletins archivés sont
 * recalculés automatiquement avec leurs propres saisies (salaire, enfants, situation, dates…), sans intervention.
 *
 * Garde-fous (paie) :
 *  - le statut (Payé, Validé…) est conservé ; un bulletin déjà payé dont le net change est signalé en rouge ;
 *  - une sauvegarde de l'historique précédent est conservée et la mise à jour peut être annulée ;
 *  - chaque mise à jour est consignée dans un journal (ancien net, nouveau net, motif, date).
 *
 * Chargé en dernier : réutilise le moteur de calcul de l'application (restorePayrollFields, update, payrollSnapshot).
 */
(function () {
  'use strict';
  /* À incrémenter à chaque modification des FORMULES du moteur (parts, IR, TRIMF, IPRES, CSS, congés). Les valeurs des barèmes, elles,
     sont détectées toutes seules : toute modification d'un taux, d'un plafond ou d'une tranche change l'empreinte. */
  const ENGINE_REV = 'r5';
  const LOG_KEY = 'paieRecalcLog', BACKUP_KEY = 'paieHistoryBackup', SKIP_KEY = 'paieRecalcSkip';
  const L = window.CorintaLegal, LV = window.CorintaLeave, D = window.CorintaDash;
  if (!L || typeof restorePayrollFields !== 'function' || typeof readHistoryStore !== 'function') { console.error('auto-recalc.js : moteur de paie introuvable'); return; }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  /* Empreinte des règles : barèmes légaux + paramètres de calcul + formules. */
  function fingerprint() {
    const keys = Object.keys(L.legalSettings()).concat(['rates', 'tax', 'trimfBrackets', 'leaveAccrual', 'legalOverride', 'transportExempt']);
    const calc = {}; keys.forEach((k) => { if (S[k] !== undefined) calc[k] = S[k]; });
    return ENGINE_REV + '.' + hash(JSON.stringify(L.LEGAL) + '|' + hash(JSON.stringify(calc)) + '|' + (LV ? LV.MIN_RATE : ''));
  }
  const netNum = (s) => { const d = String(s || '').replace(/[^0-9-]/g, ''); return d ? Number(d) : 0; };
  const WATCH = ['net', 'irAmount', 'trimfAmount', 'ipresEmployee', 'ipresEmployer', 'cssEmployer', 'leaveEarned']; // totaux dont une variation compte comme un changement
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  let running = false;
  async function run(reason, tries) {
    if (running) return;
    const fp = fingerprint();
    if (localStorage.getItem(SKIP_KEY) === fp) return;               // mise à jour annulée par l'utilisateur pour cette version des règles
    const history = readHistoryStore();
    if (!history.some((x) => x && x.fields && x.rulesRev !== fp)) return;
    const typing = document.activeElement && $('pay') && $('pay').contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (typing && (tries || 0) < 12) { setTimeout(() => run(reason, (tries || 0) + 1), 1500); return; }   // on n'interrompt pas une saisie
    running = true;
    try {
      const before = JSON.parse(JSON.stringify(history)), next = history.map((x) => x), changes = [];
      const keepFields = employeeFields(), keepName = $('companyName').value, keepEmp = ACTIVE_EMPLOYEE;
      let failed = 0;
      try {
        for (let i = 0; i < next.length; i++) {
          const x = next[i]; if (!x || !x.fields || x.rulesRev === fp) continue;
          try {
            ACTIVE_EMPLOYEE = x.employeeId || ''; $('companyName').value = x.companyName || $('companyName').value;
            restorePayrollFields(x.fields, true);
            const net = $('net').textContent, fields = employeeFields(), totals = Object.assign({}, window.payrollSnapshot);
            const moved = netNum(net) !== netNum(x.net) || WATCH.some((k) => x.totals && x.totals[k] !== undefined && Math.round(Number(totals[k]) || 0) !== Math.round(Number(x.totals[k]) || 0));
            if (moved) changes.push({ i, key: (x.name || '') + '|' + (x.period || ''), name: x.name || '—', period: x.period || '—', company: x.companyName || '—', status: x.status || 'À valider', oldNet: netNum(x.net), newNet: netNum(net) });
            next[i] = Object.assign({}, x, { fields, totals, net, rulesRev: fp }, moved ? { recalc: { at: new Date().toISOString(), oldNet: netNum(x.net), reason } } : {});
          } catch (err) { failed++; console.error('Recalcul automatique impossible pour', x && x.name, err); }
          if (i % 25 === 24) await wait(0);
        }
      } finally { ACTIVE_EMPLOYEE = keepEmp; $('companyName').value = keepName; restorePayrollFields(keepFields, true); }
      if (changes.length) write(BACKUP_KEY, { at: new Date().toISOString(), rev: fp, data: before });
      if (!writeStore('paieHistory', next)) return;
      if (typeof queueCloudSync === 'function') queueCloudSync();
      if (changes.length) {
        const log = read(LOG_KEY, []); log.unshift({ at: new Date().toISOString(), rev: fp, reason, failed, changes: changes.map(({ i, ...c }) => c) }); write(LOG_KEY, log.slice(0, 20));
      }
      if (typeof renderCompanyFolders === 'function') renderCompanyFolders();
      if (window.CorintaWS && window.CorintaWS.isOpen()) window.CorintaWS.render();
      if (typeof renderCumul === 'function') { try { renderCumul(); } catch (e) { /* page de saisie non affichée */ } }
      if (changes.length) { toast(changes.length + ' bulletin' + (changes.length > 1 ? 's' : '') + ' mis à jour automatiquement (règles modifiées)'); showLog(0); }
    } finally { running = false; }
  }
  let timer = 0;
  const schedule = (reason) => { clearTimeout(timer); timer = setTimeout(() => run(reason), 400); };

  /* Journal et annulation */
  function modal() {
    let m = $('recalcLogModal');
    if (!m) {
      m = document.createElement('div'); m.id = 'recalcLogModal'; m.className = 'modal hidden'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'rlTitle');
      document.body.appendChild(m);
      m.addEventListener('click', (e) => {
        if (e.target === m || e.target.closest('[data-rl="close"]')) { m.classList.add('hidden'); return; }
        if (e.target.closest('[data-rl="undo"]')) undo();
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') m.classList.add('hidden'); });
    }
    return m;
  }
  const mny = (v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v) + ' FCFA';
  function showLog(idx) {
    const log = read(LOG_KEY, []), e = log[idx || 0], m = modal(), backup = read(BACKUP_KEY, null);
    const paid = e ? e.changes.filter((c) => c.status === 'Payé').length : 0;
    m.innerHTML = '<div class="modal-card" style="width:min(860px,96vw);max-height:90vh;overflow:auto"><h2 id="rlTitle">Mises à jour automatiques des bulletins</h2>' + (!e
      ? '<p class="muted">Aucune mise à jour automatique pour le moment. Dès qu’une règle de calcul change, les bulletins concernés sont recalculés ici et consignés dans ce journal.</p>'
      : '<p class="muted">' + esc(new Date(e.at).toLocaleString('fr-FR')) + ' · motif : ' + esc(e.reason) + ' · <b>' + e.changes.length + ' bulletin' + (e.changes.length > 1 ? 's' : '') + ' modifié' + (e.changes.length > 1 ? 's' : '') + '</b>. Le statut de chaque bulletin est conservé.</p>' +
        (paid ? '<p class="notice" style="background:#fdeceb;border-color:#f3b6b0;color:#8a1f17">' + paid + ' bulletin' + (paid > 1 ? 's déjà payés ont' : ' déjà payé a') + ' un net différent du montant versé : vérifiez la régularisation avec le salarié.</p>' : '') +
        '<div style="overflow:auto"><table class="ct"><thead><tr><th>Salarié</th><th>Période</th><th>Statut</th><th>Ancien net</th><th>Nouveau net</th><th>Écart</th></tr></thead><tbody>' +
        e.changes.map((c) => '<tr' + (c.status === 'Payé' ? ' style="background:#fdeceb"' : '') + '><td>' + esc(c.name) + '</td><td>' + esc(D ? D.monthLabel(c.period) : c.period) + '</td><td>' + esc(c.status) + '</td><td>' + esc(mny(c.oldNet)) + '</td><td>' + esc(mny(c.newNet)) + '</td><td>' + esc((c.newNet - c.oldNet > 0 ? '+' : '') + mny(c.newNet - c.oldNet)) + '</td></tr>').join('') + '</tbody></table></div>') +
      '<div class="modal-actions">' + (e && backup && idx === 0 && backup.rev === e.rev ? '<button type="button" class="btn" data-rl="undo">Annuler cette mise à jour</button>' : '') + '<button type="button" class="btn primary" data-rl="close">Fermer</button></div></div>';
    m.classList.remove('hidden');
  }
  function undo() {
    const backup = read(BACKUP_KEY, null);
    if (!backup || !Array.isArray(backup.data)) { toast('Aucune sauvegarde à restaurer'); return; }
    if (!confirm('Restaurer les bulletins tels qu’ils étaient avant la mise à jour automatique ? Les règles actuelles ne seront pas réappliquées automatiquement.')) return;
    if (!writeStore('paieHistory', backup.data)) return;
    try { localStorage.setItem(SKIP_KEY, backup.rev); } catch (e) { /* stockage plein */ }
    if (typeof queueCloudSync === 'function') queueCloudSync();
    $('recalcLogModal').classList.add('hidden');
    if (typeof renderCompanyFolders === 'function') renderCompanyFolders();
    toast('Bulletins restaurés (mise à jour automatique annulée)');
  }

  /* Déclencheurs : démarrage, enregistrement des paramètres, import d'une sauvegarde. */
  ['save', 'importData'].forEach((name) => {
    const base = window[name]; if (typeof base !== 'function') return;
    window[name] = function () { const r = base.apply(this, arguments); schedule('paramètres modifiés'); return r; };
  });
  window.addEventListener('storage', (e) => { if (e.key === 'paieSettings' || e.key === 'paieHistory') schedule('données modifiées'); });
  window.CorintaAutoRecalc = { run: (r) => run(r || 'vérification manuelle'), fingerprint, showLog, schedule };
  schedule('mise à jour du logiciel ou des règles');
})();
