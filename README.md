# CTA LOGISTICS — Site vitrine « Prestige » (Pôle 1)

Site statique (HTML / CSS / JS), sans build ni dépendance. Charte : Bleu Marine `#0A1F3D`, Or Mat `#A8843F`.

| Fichier | Rôle |
|---|---|
| `index.html` | Accueil |
| `protocole-chaine-fermee.html` | Offre signature |
| `traction-roissy-cdg.html` | Offre aéroport |
| `devis.html` | Formulaire de cotation connecté |
| `mentions-legales.html` | Mentions légales & RGPD (champs surlignés à compléter) |
| `js/config.js` | **URL du script Google** (voir `apps-script/README-DEPLOIEMENT.md`) |
| `apps-script/Code.gs` | Script Google : écrit dans le Sheet + alerte e-mail |
| `css/style.css` | Charte graphique |

Tester en local : `python3 -m http.server 8000` puis http://localhost:8000
Hébergement : n'importe quel hébergeur de fichiers statiques (Cloudflare Pages, GitHub Pages, Netlify…).
