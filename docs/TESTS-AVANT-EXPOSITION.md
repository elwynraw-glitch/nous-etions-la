# Tests à faire avant l'exposition

À faire sur **le site publié** (pas seulement sur votre ordinateur), avec au moins deux téléphones, dont un en 4G (sans le Wi-Fi de la médiathèque). Cochez au fur et à mesure.

## Parcours principal
- [ ] Le QR code d'accueil s'ouvre sur la page d'accueil, avec l'appareil photo natif d'un iPhone **et** d'un Android.
- [ ] Chaque QR code de photographie ouvre la bonne fiche (vérifiez photo, titre, légende).
- [ ] « Ajouter à ma collection » : message « enregistrée ». Un second scan de la même photo n'ajoute rien.
- [ ] Avec 2 photos : le choix de la photo préférée est refusé, avec une explication.
- [ ] Avec 3 photos : choix, commentaire, validation, confirmation.
- [ ] Pose d'un pixel : il apparaît sur le **deuxième** téléphone sans recharger la page.
- [ ] Toucher un pixel de l'autre téléphone : photo préférée visible ; commentaire visible **seulement** si autorisé (et approuvé si la modération est activée).
- [ ] Fermer le navigateur, rouvrir le site : la collection est toujours là.
- [ ] Code de récupération : le saisir sur un autre téléphone, retrouver sa collection et son pixel.

## Scanner intégré (sur le site publié, en https)
- [ ] « Scanner un QR code » : le navigateur demande l'autorisation de la caméra, puis le cadre s'affiche (testez iPhone **et** Android, Safari **et** Chrome).
- [ ] Un QR code **imprimé** est lu en moins de 2 secondes, à 20-30 cm, en plein jour et sous l'éclairage de la salle.
- [ ] Un QR code affiché à l'écran, et un QR code sur papier brillant (reflets) : notez ceux qui posent problème.
- [ ] Un QR code étranger (par exemple celui d'un autre site) : message « n'appartient pas à l'exposition », sans redirection.
- [ ] Autorisation refusée : message clair, saisie du numéro qui fonctionne.
- [ ] Depuis un navigateur intégré (lien ouvert dans Instagram, Messenger…) : si la caméra ne démarre pas, la saisie du numéro doit rester utilisable.

## Cas limites
- [ ] QR code inconnu (ex. `…/#/oeuvre/999`) : message clair.
- [ ] Code de récupération faux ou trop court : message clair.
- [ ] Commentaire vide ; commentaire sans autorisation de publication (il n'est pas conservé et le visiteur en est averti).
- [ ] Commentaire contenant un lien, un e-mail, un téléphone : refusé.
- [ ] Deux téléphones visent la même case en même temps : un seul gagne, l'autre reçoit un message et peut choisir une autre case.
- [ ] Seconde tentative après avoir posé son pixel : impossible.
- [ ] Mode avion pendant « Ajouter à ma collection » : le site dit « pas encore enregistrée » (jamais « enregistrée »). Réseau rétabli : l'envoi se fait tout seul.
- [ ] « Supprimer mes données » : la collection disparaît et l'ancien code ne fonctionne plus.
- [ ] Contributions désactivées (réglage `contributions_open` = false) : message clair sur la mosaïque.
- [ ] Grille complète (essayez en réglant temporairement une petite grille sur une base de test) : message clair.

## Administration (`#/admin`, sur le site publié)
- [ ] Connexion avec votre compte ; un mauvais mot de passe est refusé.
- [ ] Ajouter une photographie **avec une vraie image** (JPEG de téléphone et de reflex) : elle s'affiche sur sa fiche, y compris sur un autre téléphone.
- [ ] Modifier le titre et la légende ; masquer puis réafficher une photographie.
- [ ] Télécharger le QR code PNG d'une photographie ; le scanner depuis l'écran.
- [ ] Imprimer la planche (aperçu avant impression : 3 colonnes, QR de 3,5 cm) ; scanner un QR **imprimé**.
- [ ] Approuver puis refuser un commentaire ; vérifier ce que voit un visiteur sur le pixel.
- [ ] Fermer les contributions : un visiteur voit le message et ne peut plus poser de pixel ; rouvrir.
- [ ] Exporter la mosaïque en PNG (taille « impression ») et ouvrir l'image.
- [ ] Télécharger une sauvegarde JSON et vérifier qu'elle s'ouvre.
- [ ] Créer un compte Supabase ordinaire (sans le mettre dans `admins`) : il est refusé sur `#/admin`.

## Écrans et accessibilité
- [ ] Petit téléphone (largeur 360 px) : rien ne déborde, boutons faciles à toucher.
- [ ] Zoom à deux doigts et déplacement sur la grille ; pas de zoom involontaire de la page.
- [ ] Ordinateur : navigation à la souris, clavier (Tab, flèches dans la grille, Entrée, + et −).
- [ ] Affichage plein écran : `…/#/mosaique/plein-ecran` sur l'écran de la médiathèque, pendant au moins 1 heure.
- [ ] Lecture à l'écran de la médiathèque, en plein jour, des couleurs de la palette.

## Avant d'ouvrir au public
- [ ] Remplacer les photographies de démonstration par les vraies (titres, dates, lieux, légendes).
- [ ] **Vider les données de test** (contributions et collections d'essai).
- [ ] Imprimer les QR codes avec les vraies adresses ; scanner chaque QR **imprimé** (pas seulement à l'écran).
- [ ] Vérifier que le projet Supabase est actif (voir le guide de dépannage : mise en pause).
- [ ] Faire une sauvegarde de la base (voir README).
