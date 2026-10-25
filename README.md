# NOUS ÉTIONS LÀ — plateforme interactive de l'exposition

Application web mobile pour l'exposition photographique : le visiteur scanne les QR codes sous les photographies, collecte au moins 3 images, choisit sa préférée, la commente (facultatif) et pose un pixel dans une mosaïque 50 × 50 mise à jour en direct. Toucher un pixel révèle le regard d'un autre visiteur.

**État : prototype 3.** Le parcours visiteur (avec scanner de QR code intégré) et l'espace d'administration sont fonctionnels. Reste à tester sur de vrais appareils et à mettre en ligne.

## Architecture

| Élément | Choix | Pourquoi |
|---|---|---|
| Interface | HTML/CSS/JavaScript avec Vite, sans framework | Plus simple à comprendre et à maintenir pour un débutant |
| Hébergement du site | GitHub Pages | Gratuit, adapté aux sites statiques |
| Base de données, temps réel, fichiers | Supabase (PostgreSQL) | Gratuit pour un petit usage, temps réel intégré |
| Règles critiques | Fonctions SQL dans la base | Pas de serveur à gérer ; aucune clé secrète dans le navigateur |
| Adresses | `…/#/oeuvre/001` (avec `#`) | GitHub Pages ne gère pas les adresses « propres » |

Le navigateur ne peut **lire ni écrire directement** aucune donnée de visiteur. Il appelle uniquement des fonctions qui vérifient tout côté serveur : minimum de 3 photos, photo préférée choisie, un seul pixel par participant, case libre, couleur de la palette, contributions ouvertes. Une case ne peut appartenir qu'à un seul visiteur : c'est garanti par la base elle-même.

## Arborescence

```
nous-etions-la/
├─ index.html, package.json, vite.config.js, .env.example
├─ src/
│  ├─ main.js            démarrage, navigation
│  ├─ styles.css         identité visuelle ELWYN.RAW
│  ├─ lib/               api, état du visiteur, code de récupération, grille, temps réel
│  └─ views/             accueil, fiche d'œuvre, collection, choix, mosaïque, reprise, confidentialité
│     └─ admin/          connexion, photographies, QR codes, commentaires, mosaïque, réglages
├─ supabase/
│  ├─ migrations/        001 tables · 002 fonctions · 003 sécurité · 004 œuvres de démonstration
│  └─ tests/             tests SQL (pour développeurs)
├─ scripts/              generate-qr.mjs (QR codes), test-unit.mjs
├─ docs/                 TESTS-AVANT-EXPOSITION.md, DEPANNAGE.md
└─ .github/workflows/deploy.yml   déploiement automatique
```

## Installation sous Windows (pas à pas)

### 1. Installer les outils (une seule fois)
1. **Node.js** version LTS : https://nodejs.org (installation par défaut).
2. **Git** : https://git-scm.com/download/win (installation par défaut).
3. Un éditeur, par exemple **Visual Studio Code**.
4. Ouvrez **PowerShell** et vérifiez : `node -v` puis `git --version` (chacun doit afficher un numéro).

### 2. Créer la base Supabase
1. Créez un compte sur https://supabase.com, puis **New project**.
2. Choisissez une région **européenne** (par exemple Paris ou Francfort) et notez le mot de passe de la base.
3. Menu **SQL Editor** → **New query**. Ouvrez chaque fichier de `supabase/migrations/` dans l'éditeur de texte, copiez tout son contenu, collez-le, cliquez **Run**. **Dans l'ordre : 001, 002, 003, 004, une seule fois chacun.** Chaque exécution doit afficher « Success ».
4. Menu **Project Settings → API** : copiez le **Project URL** et la clé **anon / publishable**. (Ne copiez jamais la clé `service_role` / `secret`.)

### 3. Lancer le site sur votre ordinateur
Dans PowerShell, placez-vous dans le dossier du projet :

```powershell
cd C:\chemin\vers\nous-etions-la
copy .env.example .env
notepad .env
```
Dans le Bloc-notes, remplacez les valeurs (URL, clé anon, adresse finale du site) et enregistrez. Puis :

```powershell
npm install
npm test
npm run dev
```
Ouvrez l'adresse affichée (souvent http://localhost:5173). Vous devez voir l'accueil. Pour tester une fiche : `http://localhost:5173/#/oeuvre/001`.
Pour essayer depuis votre téléphone, lancez `npm run dev -- --host` et ouvrez l'adresse « Network » affichée (téléphone sur le même Wi-Fi).

### 4. Créer le compte administrateur
1. Supabase → **Authentication → Users → Add user → Create new user** : votre e-mail et un mot de passe long. **Cochez « Auto Confirm User »**, sinon la connexion sera refusée.
2. **SQL Editor** :
```sql
insert into public.admins (user_id) select id from auth.users where email = 'VOTRE_EMAIL';
```
3. **Authentication → Sign In / Providers → Email** : désactivez « Allow new users to sign up ». Ainsi, personne d'autre ne peut créer de compte.
4. Ouvrez `http://localhost:5173/#/admin` (ou `…/#/admin` sur le site publié) et connectez-vous. Cette adresse n'apparaît dans aucun menu, mais ce n'est **pas** elle qui protège l'administration : un compte non listé dans la table `admins` est refusé par le serveur.

### 5. Déployer sur GitHub Pages
1. Créez un dépôt GitHub (ex. `nous-etions-la`), public ou privé selon votre offre.
2. Dans le dossier du projet :
```powershell
git init
git add .
git commit -m "Prototype 1"
git branch -M main
git remote add origin https://github.com/VOTRE-NOM/nous-etions-la.git
git push -u origin main
```
(Le fichier `.env` n'est **pas** envoyé : `.gitignore` l'exclut.)
3. GitHub → dépôt → **Settings → Pages → Source : GitHub Actions**.
4. **Settings → Secrets and variables → Actions → New repository secret** : créez `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` (ex. `https://VOTRE-NOM.github.io/nous-etions-la`) et, si vous voulez, `VITE_CONTACT_EMAIL`.
5. Onglet **Actions** : attendez la coche verte. Le site est en ligne à l'adresse `VITE_SITE_URL`.

## Scanner un QR code depuis le site
Le site contient son propre scanner (bouton « Scanner un QR code » sur l'accueil et dans « Ma collection », lien « Scanner » dans le menu, et « Scanner une autre photographie » sur chaque fiche). Les visiteurs peuvent donc aussi bien utiliser l'appareil photo de leur téléphone que le scanner du site.
- **La caméra exige une adresse sécurisée (https).** Sur le site publié sur GitHub Pages, c'est le cas. En test local, `http://localhost` fonctionne sur l'ordinateur, mais **pas** l'adresse `http://192.168…` ouverte sur un téléphone : le site l'explique et propose la saisie du numéro. Testez donc le scanner sur le site publié.
- Le scanner lit seulement le **numéro** de l'œuvre dans le QR code et ouvre la fiche correspondante du site. Il n'ouvre jamais une adresse extérieure : un QR code étranger est signalé et ignoré.
- Si la caméra est refusée ou absente, ou si un QR code est abîmé, le visiteur **saisit le numéro** écrit sous le QR code (« 1 » ou « 001 »). Les planches d'impression affichent ce numéro sous chaque QR code.
- La caméra ne sert qu'à lire : aucune image n'est enregistrée ni envoyée.
- Le scanner utilise la lecture intégrée du navigateur quand elle existe, sinon la bibliothèque `jsQR` (chargée seulement à l'ouverture du scanner).

## QR codes
1. Vérifiez que `VITE_SITE_URL` dans `.env` est l'**adresse publique finale**.
2. `npm run qr`
3. Le dossier `qr/` contient : `accueil.png/svg`, `oeuvres/oeuvre-001.png/svg`…, `liste.csv`, et `planche-impression.html`.
4. Ouvrez `planche-impression.html` dans Chrome → Imprimer → échelle **100 %**, noir sur blanc mat. Chaque QR fait 3,5 cm.
5. **Scannez chaque QR imprimé** avant de l'accrocher.

## Utiliser l'administration (`#/admin`)
- **Photographies** : ajouter, modifier, masquer, supprimer. Le numéro (001…) sert d'adresse au QR code et ne peut plus être changé ensuite. L'image est choisie sur votre ordinateur ; elle est réduite à 1800 px, convertie en JPEG et **ses métadonnées (GPS, appareil, date) sont supprimées**. Le site ne garde pas votre original : conservez vos fichiers d'origine. Les fichiers HEIC (iPhone) ne sont pas lus : exportez en JPEG.
- **QR codes** : un par photographie + un pour l'accueil, téléchargeables en PNG ou SVG, et une planche à imprimer (échelle 100 %, noir sur papier blanc mat). Un bandeau vous prévient si l'adresse est locale (alors **n'imprimez pas**). L'adresse vient de `VITE_SITE_URL`.
- **Commentaires** : liste « à relire », approuver ou refuser (le refus supprime définitivement le texte). Les commentaires signalés par 3 visiteurs ou contenant un mot bloqué reviennent ici.
- **Mosaïque** : remplissage, fermeture/réouverture des contributions, ouverture de l'affichage plein écran pour la médiathèque, export PNG haute résolution (jusqu'à 10 000 × 10 000 px).
- **Réglages et données** : modération, palette, nombre de photos minimum, durée de conservation, mots bloqués, limites par réseau ; sauvegarde JSON ; suppression des parcours expirés ; effacement des données de test avant l'ouverture (il faut taper EFFACER).

## Réglages (table `app_settings`)
Palette (`palette`), minimum de photos (`min_collection`), contributions ouvertes (`contributions_open`), modération (`moderation_mode` : `"pre"` = relecture avant publication, `"post"` = publication immédiate), durée de conservation (`retention_days`), mots bloqués (`blocked_words`), limites par réseau (`rate_*`). Modifiez la valeur directement dans le Table Editor. **Ne changez pas `grid_size` une fois l'exposition commencée.**

## Confidentialité : ce qui est réellement fait
- Pas de compte, de nom ni d'e-mail. Le code de récupération (16 caractères, ~79 bits tirés par le navigateur) n'est jamais stocké : seulement son empreinte.
- Commentaire publié seulement avec consentement ; sans consentement il **n'est pas conservé**. Liens, e-mails et numéros refusés.
- La fenêtre d'un pixel ne montre que la photo préférée, son titre et le commentaire autorisé. Pas d'heure précise.
- L'adresse IP n'est pas stockée avec les données de parcours. Pour limiter le spam, une empreinte salée, changée chaque jour, compte les requêtes pendant quelques heures.
- **Limites à connaître** : GitHub et Supabase peuvent garder des journaux techniques avec les adresses IP. Un commentaire personnel peut identifier son auteur. Un script déterminé peut créer de faux parcours (la limite par réseau ralentit sans empêcher) : pour une protection plus forte, il faudra ajouter un anti-robot (type Cloudflare Turnstile).
- Suppression : le visiteur le fait lui-même depuis « Ma collection » → « Mes données ». Purge automatique : lancez `select public.purge_expired();` dans le SQL Editor (ou programmez-la), ou la fonction d'administration à l'étape suivante.

## Offre gratuite : points à vérifier AVANT l'exposition
Les offres changent : vérifiez sur https://supabase.com/pricing et dans votre tableau de bord. Les sources que j'ai consultées signalent notamment : **mise en pause d'un projet gratuit après environ une semaine d'inactivité** (ouvrez le site la veille de l'exposition), **pas de sauvegarde automatique**, et des plafonds de connexions temps réel simultanées, de messages temps réel et de stockage. Pour une médiathèque, c'est a priori suffisant, mais je n'ai pas pu le vérifier sur votre compte. La mosaïque se rabat sur une mise à jour toutes les 30 secondes si le temps réel est indisponible.

**Sauvegarde manuelle** : Supabase → Table Editor → `mosaic_cells` et `contributions` → Export CSV, avant et après l'exposition.

## Ce qui a été testé, et ce qui ne l'a pas été
Testé, sur une vraie base PostgreSQL 16 et le serveur d'API PostgREST utilisé par Supabase :
- **72 tests des règles serveur** (droits d'accès, 3 photos minimum, doublons, commentaires, cases occupées, seconde contribution, grille complète, codes invalides, limites de débit, modération, effacement).
- **Course entre deux sessions simultanées** sur 100 cases : jamais deux propriétaires pour une case.
- **64 vérifications du parcours visiteur** dans un navigateur simulé (jsdom) : QR inconnu, doublon, moins de 3 œuvres, commentaire vide ou refusé, case prise, seconde tentative, connexion perdue puis rétablie, code invalide, effacement, contributions fermées, mode plein écran.
- **61 vérifications de l'administration** dans le même navigateur simulé : refus d'un compte non administrateur, ajout / modification / masquage / suppression d'une photographie, numéro en double, QR codes, modération (approuver, refuser en deux temps), fermeture et réouverture des contributions, réglages invalides refusés, palette, sauvegarde, purge, effacement des données de test avec confirmation, et refus côté serveur pour un visiteur anonyme ou un compte ordinaire.
- **20 vérifications du scanner** avec une caméra simulée : caméra refusée, absente, adresse non sécurisée, QR étranger ignoré, QR d'accueil refusé, bon QR, caméra coupée en quittant la page, saisie manuelle (« 2 » ouvre la fiche 002, texte piégé refusé), et lecture par jsQR.
- **22 tests unitaires** (`npm test`), dont la lecture de QR codes nets, petits (3 px par module) et clairs sur fond sombre, et décodage des QR codes générés par le script.

**Non testé** (limites de mon environnement) :
- Un vrai navigateur sur un vrai téléphone : rendu visuel, pincement, **vraie caméra** (netteté, lumière, QR imprimés brillants ou abîmés, autorisation sur iPhone et Android).
- La **connexion** par e-mail et mot de passe (service d'authentification de Supabase) : simulée dans mes tests, les droits eux-mêmes étant bien vérifiés par la base.
- L'**envoi d'image** vers Supabase Storage, le **redimensionnement** de l'image et la fabrication du **PNG** dans un vrai navigateur, l'**impression** de la planche de QR codes.
- Le temps réel de Supabase (simulé par l'interrogation de secours), le déploiement GitHub Pages, les quotas gratuits sur votre compte.

La checklist `docs/TESTS-AVANT-EXPOSITION.md` couvre ces points.
