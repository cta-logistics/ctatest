/**
 * CTA LOGISTICS — Réception des demandes de cotation (Pôle 1)
 * Google Apps Script — à coller dans le projet lié au Google Sheets de la direction.
 *
 * Fait 4 choses à chaque envoi du formulaire du site :
 *   1. valide les données (côté serveur, on ne fait pas confiance au navigateur) ;
 *   2. ajoute une ligne dans l'onglet « Demandes de cotation » ;
 *   3. envoie une alerte e-mail à la direction ;
 *   4. (option) envoie un accusé de réception au client.
 *
 * Mise en route : voir README-DEPLOIEMENT.md. Lancer d'abord installer().
 */

const CONFIG = {
  ALERT_EMAIL: 'direction@cta-logistics.fr',   // ← adresse qui reçoit l'alerte (séparer plusieurs adresses par des virgules)
  REPLY_TO: 'contact@cta-logistics.fr',        // ← adresse de réponse affichée au client
  SENDER_NAME: 'CTA LOGISTICS',
  ACK_CLIENT: true,                            // true = accusé de réception envoyé au client
  SHEET_ID: '',                                // laisser vide si le script est lié au Sheet (Extensions > Apps Script)
  SHEET_NAME: 'Demandes de cotation',
  MAX_PER_EMAIL_PER_HOUR: 5                    // anti-abus
};

const COLUMNS = [
  'Référence', 'Reçu le', 'Statut', 'Offre', 'Nom', 'Société', 'E-mail', 'Téléphone',
  'Adresse enlèvement', 'Adresse livraison', 'Date enlèvement', 'Livraison avant le',
  'Nature', 'Urgence', 'Nb colis', 'Poids (kg)', 'Valeur déclarée (€)', 'Précisions',
  'Consentement RGPD', 'Page source'
];
const STATUTS = ['Nouvelle', 'En cotation', 'Cotation envoyée', 'Gagnée', 'Perdue'];
const OFFRES = { 'chaine-fermee': 'Protocole Chaîne Fermée', 'traction-cdg': 'Traction Roissy CDG', 'autre': 'Autre besoin' };
const NAVY = '#0A1F3D', GOLD = '#A8843F';

/* ---------- Point d'entrée du formulaire ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (!e || !e.postData || !e.postData.contents) return json_({ ok: false, error: 'Requête vide.' });
    if (e.postData.contents.length > 20000) return json_({ ok: false, error: 'Requête trop volumineuse.' });

    let d;
    try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Format invalide.' }); }

    // Anti-spam : champ piège rempli = robot. On répond « ok » sans rien enregistrer.
    if (d.website) return json_({ ok: true, ref: 'DEV-IGNORE' });

    const v = validate_(d);
    if (v) return json_({ ok: false, error: v });

    const cache = CacheService.getScriptCache();
    // Doublon (le site peut renvoyer la même demande si la réponse s'est perdue)
    if (cache.get('ref:' + d.ref)) return json_({ ok: true, ref: d.ref, duplicate: true });
    // Limitation par e-mail
    const rk = 'rate:' + d.email.toLowerCase();
    const n = Number(cache.get(rk) || 0);
    if (n >= CONFIG.MAX_PER_EMAIL_PER_HOUR) return json_({ ok: false, error: 'Trop de demandes. Écrivez-nous directement par e-mail.' });
    cache.put(rk, String(n + 1), 3600);
    cache.put('ref:' + d.ref, '1', 21600);

    const row = appendRow_(d);
    try { notifyDirection_(d, row); } catch (err) { console.error('Alerte e-mail : ' + err); }
    if (CONFIG.ACK_CLIENT) { try { ackClient_(d); } catch (err) { console.error('Accusé client : ' + err); } }

    return json_({ ok: true, ref: d.ref });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Erreur serveur, réessayez dans un instant.' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/** Test rapide dans le navigateur : ouvrir l'URL /exec doit afficher {"ok":true,...} */
function doGet() { return json_({ ok: true, service: 'CTA LOGISTICS — cotation', time: new Date().toISOString() }); }

/* ---------- Validation ---------- */
function validate_(d) {
  const req = { ref: 'Référence', nom: 'Nom', societe: 'Société', email: 'E-mail', pickup: "Adresse d'enlèvement", delivery: 'Adresse de livraison', pickupDate: "Date d'enlèvement", nature: 'Nature du chargement' };
  for (const k in req) if (!d[k] || String(d[k]).trim() === '') return 'Champ manquant : ' + req[k] + '.';
  if (!/^DEV-\d{8}-[A-Z0-9]{4}$/.test(d.ref)) return 'Référence invalide.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return 'E-mail invalide.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.pickupDate)) return "Date d'enlèvement invalide.";
  if (d.deliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.deliveryDate)) return 'Date de livraison invalide.';
  if (d.consent !== 'oui') return 'Le consentement est nécessaire.';
  for (const k in d) if (String(d[k]).length > 2500) return 'Champ trop long : ' + k + '.';
  return null;
}

/* ---------- Écriture dans le Sheet ---------- */
function getSheet_() {
  const ss = CONFIG.SHEET_ID ? SpreadsheetApp.openById(CONFIG.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Aucun classeur : liez le script au Sheet ou renseignez SHEET_ID.');
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);
  return sh;
}

function appendRow_(d) {
  const sh = getSheet_();
  if (sh.getLastRow() === 0) formatSheet_(sh);
  const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  const values = [
    clean(d.ref), new Date(), 'Nouvelle', OFFRES[d.offre] || 'Autre besoin',
    clean(d.nom), clean(d.societe), clean(d.email), clean(d.telephone),
    clean(d.pickup), clean(d.delivery), clean(d.pickupDate), clean(d.deliveryDate),
    clean(d.nature), clean(d.urgence), clean(d.colis), clean(d.poids), clean(d.valeur), clean(d.message),
    'oui — ' + Utilities.formatDate(new Date(), 'Europe/Paris', 'dd/MM/yyyy HH:mm'), clean(d.page)
  ];
  const row = sh.getLastRow() + 1;
  const range = sh.getRange(row, 1, 1, COLUMNS.length);
  // Format « texte brut » : une cellule qui commencerait par = + - @ n'est jamais interprétée comme une formule.
  range.setNumberFormat('@');
  sh.getRange(row, 2).setNumberFormat('dd/MM/yyyy HH:mm'); // la date de réception reste une vraie date
  range.setValues([values]);
  sh.getRange(row, 3).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUTS, true).build());
  return row;
}

function formatSheet_(sh) {
  sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS])
    .setBackground(NAVY).setFontColor('#C8A96A').setFontWeight('bold').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.setRowHeight(1, 34);
  sh.getRange(2, 18, 998, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  [110, 130, 120, 160, 150, 170, 200, 120, 240, 240, 110, 110, 150, 150, 70, 80, 120, 320, 150, 220]
    .forEach((w, i) => sh.setColumnWidth(i + 1, w));
  // Couleur selon le statut
  const rg = [sh.getRange(2, 1, 998, COLUMNS.length)];
  const rule = (txt, bg) => SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="' + txt + '"').setBackground(bg).setRanges(rg).build();
  sh.setConditionalFormatRules([rule('Nouvelle', '#FBF3DD'), rule('Gagnée', '#E3F1E8'), rule('Perdue', '#F1E4E4')]);
}

/* ---------- E-mails ---------- */
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function line_(label, value) {
  if (!value) return '';
  return '<tr><td style="padding:8px 14px;border-bottom:1px solid #E2DCCD;color:#55627A;font-size:12px;text-transform:uppercase;letter-spacing:.08em;width:38%">' + esc_(label) +
         '</td><td style="padding:8px 14px;border-bottom:1px solid #E2DCCD;color:#14233A;font-size:14px">' + esc_(value).replace(/\n/g, '<br>') + '</td></tr>';
}

function shell_(title, inner) {
  return '<div style="background:#F6F3EC;padding:24px;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #E2DCCD">' +
    '<div style="background:' + NAVY + ';padding:22px 26px;border-bottom:3px solid ' + GOLD + '">' +
    '<span style="color:#C8A96A;font-family:Georgia,serif;font-size:26px;font-weight:bold;letter-spacing:1px">CTA</span>' +
    '<span style="color:#fff;font-size:11px;letter-spacing:4px;margin-left:12px;text-transform:uppercase">Logistics</span></div>' +
    '<div style="padding:26px"><h2 style="margin:0 0 16px;font-family:Georgia,serif;color:' + NAVY + ';font-size:22px">' + title + '</h2>' + inner + '</div></div></div>';
}

function notifyDirection_(d, row) {
  const ss = getSheet_().getParent();
  const link = ss.getUrl() + '#gid=' + getSheet_().getSheetId() + '&range=A' + row;
  const urgent = /Urgent|Prioritaire/.test(d.urgence || '');
  const inner = '<table style="width:100%;border-collapse:collapse;border:1px solid #E2DCCD">' +
    line_('Référence', d.ref) + line_('Offre', OFFRES[d.offre] || 'Autre besoin') + line_('Urgence', d.urgence) +
    line_('Contact', d.nom) + line_('Société', d.societe) + line_('E-mail', d.email) + line_('Téléphone', d.telephone) +
    line_('Enlèvement', d.pickup) + line_('Livraison', d.delivery) +
    line_('Date d’enlèvement', d.pickupDate) + line_('Livraison avant le', d.deliveryDate) +
    line_('Nature', d.nature) + line_('Colis', d.colis) + line_('Poids (kg)', d.poids) + line_('Valeur déclarée (€)', d.valeur) +
    line_('Précisions', d.message) + '</table>' +
    '<p style="margin:22px 0 0"><a href="' + link + '" style="background:' + GOLD + ';color:#0A1F3D;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;text-transform:uppercase;padding:13px 22px;display:inline-block">Ouvrir dans le Sheet</a></p>' +
    '<p style="color:#55627A;font-size:12px;margin-top:18px">Répondre à cet e-mail écrit directement au client.</p>';
  MailApp.sendEmail({
    to: CONFIG.ALERT_EMAIL,
    replyTo: d.email,
    name: CONFIG.SENDER_NAME,
    subject: (urgent ? '[URGENT] ' : '') + 'Nouvelle demande de cotation ' + d.ref + ' — ' + d.societe,
    htmlBody: shell_('Nouvelle demande de cotation', inner),
    body: 'Nouvelle demande ' + d.ref + ' de ' + d.nom + ' (' + d.societe + ') — ' + d.email + '. Détails : ' + link
  });
}

function ackClient_(d) {
  const inner = '<p style="color:#14233A;font-size:15px;line-height:1.6">Bonjour ' + esc_(d.nom) + ',</p>' +
    '<p style="color:#14233A;font-size:15px;line-height:1.6">Nous avons bien reçu votre demande de cotation. Notre équipe revient vers vous sous 24 heures ouvrées.</p>' +
    '<p style="margin:18px 0"><span style="border:1px solid #E2DCCD;background:#F6F3EC;padding:9px 16px;font-family:Consolas,monospace;font-size:14px;color:' + NAVY + '">' + esc_(d.ref) + '</span></p>' +
    '<p style="color:#55627A;font-size:13px">Conservez cette référence pour tout échange. Pour une urgence, répondez à ce message en indiquant « URGENT ».</p>' +
    '<p style="color:#14233A;font-size:15px">L’équipe CTA LOGISTICS</p>';
  MailApp.sendEmail({
    to: d.email, replyTo: CONFIG.REPLY_TO, name: CONFIG.SENDER_NAME,
    subject: 'CTA LOGISTICS — votre demande ' + d.ref,
    htmlBody: shell_('Demande bien reçue', inner),
    body: 'Bonjour ' + d.nom + ', nous avons bien reçu votre demande ' + d.ref + '. Réponse sous 24 heures ouvrées. — CTA LOGISTICS'
  });
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- Outils (à lancer à la main depuis l'éditeur) ---------- */
/** 1) À lancer une fois : crée l'onglet, la mise en forme et demande les autorisations Google. */
function installer() {
  const sh = getSheet_();
  if (sh.getLastRow() === 0) formatSheet_(sh);
  MailApp.getRemainingDailyQuota(); // déclenche la demande d'autorisation d'envoi d'e-mails
  console.log('Installation OK. Onglet : ' + CONFIG.SHEET_NAME);
}

/** 2) Simule une demande complète (ligne + e-mails) sans passer par le site. */
function tester() {
  const r = doPost({ postData: { contents: JSON.stringify({
    ref: 'DEV-' + Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyyMMdd') + '-TEST',
    offre: 'chaine-fermee', nom: 'Test Technique', societe: 'Cabinet Exemple', email: CONFIG.ALERT_EMAIL,
    telephone: '+33 6 00 00 00 00', pickup: '59 rue de Ponthieu, 75008 Paris', delivery: '1 place Vendôme, 75001 Paris',
    pickupDate: Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd'), nature: 'Documents / contrats',
    urgence: 'Standard', colis: '1', poids: '3', valeur: '', message: '=1+1 (test d’injection de formule)', consent: 'oui', page: 'test'
  }) } });
  console.log(r.getContent());
}
