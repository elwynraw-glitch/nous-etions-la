# Guide de dépannage (débutant)

| Ce que vous voyez | Cause probable | Que faire |
|---|---|---|
| « Configuration à terminer » | Le fichier `.env` manque ou est mal rempli | Copiez `.env.example` en `.env`, remplissez les 3 valeurs, relancez `npm run dev` |
| « Connexion impossible » dès l'ouverture | Mauvaise adresse ou clé Supabase, **ou projet Supabase en pause** | Vérifiez `.env`. Dans Supabase, un projet gratuit inactif est mis en pause : cliquez « Restore project » |
| La page est vide ou « Page introuvable » sur le site publié | `VITE_SITE_URL` ou le chemin du dépôt est faux | Vérifiez l'adresse GitHub Pages et les 4 « secrets » du dépôt |
| `npm` n'est pas reconnu | Node.js non installé ou terminal pas redémarré | Installez Node.js LTS, fermez et rouvrez le terminal |
| Erreur SQL à l'exécution d'une migration | Migrations lancées dans le désordre ou deux fois | Exécutez 001, 002, 003, 004 dans cet ordre, une seule fois chacune. Sinon, repartez d'un projet vide |
| `relation "auth.users" does not exist` | Mauvais projet / base | Utilisez le SQL Editor d'un vrai projet Supabase |
| Les photos ne s'affichent pas | Image non envoyée ou nom de fichier faux | Vérifiez la colonne `image_path` de la table `artworks` (chemin dans le bucket « artworks ») |
| La mosaïque ne se met pas à jour en direct | Temps réel non activé ou bloqué par le réseau | La page affiche « Hors ligne » et se met à jour toutes les 30 s. Relancez la migration 003 (dernière ligne) ; testez en 4G |
| « Trop de demandes depuis ce réseau » | Limite par réseau atteinte (Wi-Fi partagé) | Augmentez `rate_new_per_hour` / `rate_actions_per_hour` dans la table `app_settings` |
| Un QR code mène à `localhost` | QR fabriqué avec une mauvaise `VITE_SITE_URL` | Corrigez `.env`, relancez `npm run qr`, **réimprimez** |
| Le QR code ne se scanne pas | Trop petit, trop clair, brillant ou abîmé | Au moins 3 cm, noir sur blanc mat, marge blanche autour, test sur plusieurs téléphones |
| Le scanner dit « adresse sécurisée (https) » | Le site est ouvert en `http://192.168…` (test local) | Normal en test local. Testez le scanner sur le site publié (https), ou utilisez l'appareil photo du téléphone |
| Le scanner ne voit pas la caméra | Autorisation refusée | Réglages du navigateur → ce site → Caméra → Autoriser, puis recharger. Sinon, saisir le numéro |
| Le QR code n'est pas lu | Reflets, trop petit, flou, abîmé | Se placer à 20-30 cm, éviter le reflet, ou saisir le numéro écrit sous le QR code |
| Le site marche sur mon PC mais pas sur les téléphones | Vous testez sur `localhost` | Testez toujours sur l'adresse publique |

Si rien ne marche : ouvrez la console du navigateur (touche F12, onglet « Console »), recopiez le message rouge et envoyez-le moi.
