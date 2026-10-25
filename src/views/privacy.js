import { h } from '../lib/dom.js';
import * as store from '../lib/store.js';

export async function privacyView({ main }) {
  const cfg = store.getConfig();
  const days = cfg?.retention_days ?? 180;
  const moderated = cfg?.moderation_mode === 'pre';
  const contact = import.meta.env.VITE_CONTACT_EMAIL;
  main.append(h('article', { class: 'prose' },
    h('a', { class: 'back', href: '#/' }, 'Accueil'),
    h('h1', null, 'Confidentialité et données'),
    h('p', { class: 'lead' }, 'Ce site collecte le moins de données possible. Pas de compte, pas d’adresse e-mail, pas de nom, pas de publicité, pas de statistiques de fréquentation.'),

    h('h2', null, 'Ce qui est enregistré'),
    h('ul', null,
      h('li', null, 'Votre collection : la liste des photographies que vous avez ajoutées.'),
      h('li', null, 'Votre photographie préférée, et votre commentaire uniquement si vous avez autorisé sa publication. Sans autorisation, le commentaire n’est pas conservé.'),
      h('li', null, 'Votre pixel : sa position et sa couleur. Il est visible de tous, sans aucun lien avec votre identité.'),
      h('li', null, 'Une empreinte de votre code de récupération (le code lui-même n’est pas conservé), la date de création et la date de dernière visite de votre parcours.')),

    h('h2', null, 'Ce que les autres visiteurs voient'),
    h('p', null, 'En touchant votre pixel, un visiteur voit votre photographie préférée et son titre. Il voit votre commentaire seulement si vous l’avez autorisé' + (moderated ? ' et après sa relecture par l’organisateur.' : '.') + ' Il ne voit jamais d’identité, d’adresse IP, d’heure précise ni d’identifiant technique.'),

    h('h2', null, 'Commentaires : règles et modération'),
    h('p', null, 'Les liens, adresses e-mail et numéros de téléphone sont refusés. Les commentaires peuvent être relus, masqués ou supprimés par l’organisateur, et tout visiteur peut en signaler un.'),

    h('h2', null, 'Sur votre appareil'),
    h('p', null, 'Votre navigateur garde votre code de récupération et votre collection pour que vous puissiez reprendre après avoir fermé la page. Aucun cookie de suivi n’est utilisé et les polices sont hébergées avec le site.'),

    h('h2', null, `Durée de conservation : ${days} jours`),
    h('p', null, `Les données d’un parcours sont supprimées automatiquement ${days} jours après la dernière visite. Les cases colorées de la mosaïque, qui ne contiennent aucune donnée personnelle, font partie de l’œuvre collective.`),

    h('h2', null, 'Vos droits'),
    h('p', null, 'Vous pouvez supprimer vos données à tout moment, depuis « Ma collection », rubrique « Mes données ». Vous choisissez de libérer votre case ou de la laisser comme une case anonyme. Comme aucun nom n’est enregistré, nous ne pouvons pas retrouver vos données sans votre code de récupération.' + (contact ? '' : ' Pour toute question, adressez-vous à l’accueil de la médiathèque.')),
    contact ? h('p', null, 'Contact : ', h('a', { href: `mailto:${contact}` }, contact)) : null,

    h('h2', null, 'Les limites de l’anonymat'),
    h('p', null, 'Ce site est conçu pour ne pas vous identifier, mais il serait inexact de promettre un anonymat absolu. Pour fonctionner, votre navigateur contacte nos hébergeurs, qui peuvent conserver dans leurs journaux techniques votre adresse IP pendant leur durée habituelle. Pour limiter les abus, le serveur compte brièvement les demandes par réseau à l’aide d’une empreinte irréversible, changée chaque jour et effacée en quelques heures ; votre adresse IP n’est pas stockée avec vos données de parcours. Un commentaire très personnel pourrait aussi vous identifier par son contenu : écrivez ce que vous acceptez de rendre public.'),

    h('h2', null, 'Qui héberge quoi'),
    h('p', null, 'Les pages du site sont hébergées par GitHub Pages. Les données du parcours et la mosaïque sont hébergées par Supabase. Le responsable du traitement est elwyn.raw.')));
}
