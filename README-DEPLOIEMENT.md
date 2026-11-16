# Brancher le formulaire de cotation sur Google Sheets (15 minutes)

Résultat : chaque demande faite sur le site ajoute une ligne dans le Google Sheets de la direction
et envoie une alerte e-mail. Aucun serveur, aucun abonnement : tout reste dans le Google Workspace de CTA LOGISTICS.

## 1. Créer le classeur
1. Connectez-vous avec le **compte Google Workspace de l'entreprise** (pas un compte perso).
2. Google Drive > Nouveau > Google Sheets. Nommez-le **« CTA — Demandes de cotation (DIRECTION) »**.
3. Partagez-le uniquement avec la direction (Partager > accès « Restreint »). Ne le partagez jamais par lien public.

## 2. Installer le script
1. Dans le Sheet : **Extensions > Apps Script**.
2. Supprimez le code existant, collez tout le contenu de `Code.gs`, enregistrez.
3. En haut du fichier, modifiez `CONFIG.ALERT_EMAIL` (l'adresse du patron) et `CONFIG.REPLY_TO`.
4. Dans la barre d'outils, choisissez la fonction **`installer`** puis **Exécuter**. Google demande les autorisations
   (Sheets + envoi d'e-mails) : acceptez. L'onglet « Demandes de cotation » se crée avec ses en-têtes.
5. Choisissez **`tester`** puis Exécuter : une ligne de test apparaît et un e-mail d'alerte arrive.
   (Vous pouvez ensuite supprimer la ligne de test.)

## 3. Publier le script comme application web
1. Apps Script > **Déployer > Nouveau déploiement** > type **Application web**.
2. *Exécuter en tant que* : **Moi**. *Qui a accès* : **Tout le monde** (indispensable pour que le site public puisse envoyer).
3. Déployer, puis copiez l'**URL de l'application web** (elle finit par `/exec`).
4. Ouvrez cette URL dans le navigateur : vous devez voir `{"ok":true,"service":"CTA LOGISTICS — cotation",...}`.

## 4. Relier le site
Dans `js/config.js`, collez l'URL :
```js
quoteEndpoint: "https://script.google.com/macros/s/XXXXXXXX/exec",
```
Tant que ce champ est vide, le formulaire fonctionne en **mode démonstration** (aucune donnée envoyée, un message le précise).

## 5. Tester de bout en bout
Remplissez le formulaire sur `devis.html` : la ligne doit apparaître dans le Sheet, l'alerte arriver chez le patron,
l'accusé chez le client.

## Modifier le script plus tard
Après toute modification de `Code.gs` : **Déployer > Gérer les déploiements > crayon > Version : Nouvelle version > Déployer**.
L'URL ne change pas.

## Sécurité : ce qui est en place
- Validation côté serveur de tous les champs (on ne fait pas confiance au navigateur).
- Champ piège anti-robot (`website`) et limite de 5 demandes par e-mail et par heure.
- Anti-doublon par référence (`DEV-AAAAMMJJ-XXXX`) : un renvoi réseau n'écrit jamais deux fois.
- Cellules enregistrées en texte brut : une saisie comme `=IMPORTRANGE(...)` ne s'exécute pas (anti-injection de formule).
- Contenu des e-mails échappé (pas de HTML injecté par le client).
- Le Sheet n'est pas public : seule l'URL `/exec` l'est, et elle ne sait qu'**ajouter** une ligne, jamais lire.

## Limites à connaître
- Quota Google : ~1 500 e-mails/jour sur Workspace (100 sur un compte gratuit). Largement suffisant ici.
- Si l'adresse de l'alerte change, modifiez `CONFIG.ALERT_EMAIL` puis redéployez (étape « Modifier le script »).
- Pour les données sensibles (Pôle 3) : activez la validation en 2 étapes sur tous les comptes qui ont accès au Sheet.
