-- Tests des règles serveur. Exécutés en local contre une base PostgreSQL simulant Supabase.
\set ON_ERROR_STOP on
drop schema if exists t cascade;
create schema t;
grant usage on schema t to anon, authenticated;
create function t.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'NO_ERROR'; exception when others then return sqlerrm; end $$;
create function t.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin if coalesce(p_ok,false) then raise notice 'PASS  %', p_name; else raise exception 'FAIL  %', p_name; end if; end $$;
grant execute on all functions in schema t to anon, authenticated;

-- Remise à zéro
delete from public.admins; delete from auth.users;
delete from public.participants; delete from public.mosaic_cells; delete from public.rate_events;
update public.app_settings set value = '3'::jsonb where key='min_collection';
update public.app_settings set value = '"pre"'::jsonb where key='moderation_mode';
update public.app_settings set value = '[]'::jsonb where key='blocked_words';

do $$
declare
  a text := 'ABCDEFGH23456789';
  b text := 'JKMNPQRS23456789';
  r json;
begin
  set local role anon;

  -- Accès directs interdits
  perform t.check('anon ne peut pas lire participants', t.err('select * from public.participants') like 'permission denied%');
  perform t.check('anon ne peut pas lire contributions', t.err('select * from public.contributions') like 'permission denied%');
  perform t.check('anon ne peut pas écrire dans mosaic_cells', t.err($q$insert into public.mosaic_cells(x,y,color) values (1,1,'#000000')$q$) like 'permission denied%');
  perform t.check('anon ne peut pas lire les secrets', t.err('select * from public.secrets') like 'permission denied%');
  perform t.check('anon ne peut pas modifier une œuvre', t.err($q$update public.artworks set title='x'$q$) like 'permission denied%');
  perform t.check('anon ne peut pas appeler admin_stats', t.err('select public.admin_stats()') like 'permission denied%');
  perform t.check('anon ne peut pas appeler _participant', t.err($q$select public._participant('ABCDEFGH23456789')$q$) like 'permission denied%');

  -- Codes invalides
  perform t.check('start_session refuse un code trop court', t.err($q$select public.start_session('ABC')$q$) = 'invalid_code');
  perform t.check('start_session refuse caractères ambigus (O, I, L, 0, 1)', t.err($q$select public.start_session('OOOOIIII00001111')$q$) = 'invalid_code');
  perform t.check('add_to_collection : code inconnu', t.err($q$select public.add_to_collection('ABCDEFGH23456789','001')$q$) = 'invalid_code');
  r := public.restore_session('ZZZZZZZZZZZZZZZZ');
  perform t.check('restore_session : code invalide renvoie ok=false', (r->>'ok')::boolean = false and r->>'error' = 'invalid_code');

  -- Création de session (idempotente) et collection
  perform t.check('start_session crée le participant', (public.start_session(a)->>'ok')::boolean);
  perform t.check('start_session est idempotent', (public.start_session(a)->>'existing')::boolean);
  perform t.check('QR inconnu : unknown_artwork', t.err($q$select public.add_to_collection('ABCDEFGH23456789','999')$q$) = 'unknown_artwork');
  r := public.add_to_collection(a,'001');
  perform t.check('ajout 001', r->>'status' = 'added' and (r->>'count')::int = 1);
  r := public.add_to_collection(a,'001');
  perform t.check('même photo scannée deux fois : pas de doublon', r->>'status' = 'already' and (r->>'count')::int = 1);
  perform t.check('moins de 3 œuvres : choix refusé', t.err($q$select public.save_choice('ABCDEFGH23456789','001','',false)$q$) = 'collection_too_small');
  perform t.check('moins de 3 œuvres : pixel refusé', t.err($q$select public.place_pixel('ABCDEFGH23456789',1,1,'#0448B5')$q$) = 'collection_too_small');

  perform public.add_to_collection(a,'002');
  perform public.add_to_collection(a,'003');
  perform t.check('photo hors collection : refusée comme favorite', t.err($q$select public.save_choice('ABCDEFGH23456789','004','',false)$q$) = 'not_in_collection');
  perform t.check('pixel sans choix : choice_required', t.err($q$select public.place_pixel('ABCDEFGH23456789',1,1,'#0448B5')$q$) = 'choice_required');

  -- Commentaires
  r := public.save_choice(a,'002','',true);
  perform t.check('commentaire vide : statut none', r->>'comment_status' = 'none');
  r := public.save_choice(a,'002','Très beau   regard',false);
  perform t.check('consentement refusé : statut none', r->>'comment_status' = 'none');
  reset role;
  perform t.check('consentement refusé : commentaire NON stocké', (select comment is null from public.contributions limit 1));
  set local role anon;
  perform t.check('lien refusé', t.err($q$select public.save_choice('ABCDEFGH23456789','002','voir www.exemple.fr',true)$q$) = 'comment_has_link_or_contact');
  perform t.check('e-mail refusé', t.err($q$select public.save_choice('ABCDEFGH23456789','002','ecrire a moi@mail.fr',true)$q$) = 'comment_has_link_or_contact');
  perform t.check('téléphone refusé', t.err($q$select public.save_choice('ABCDEFGH23456789','002','appelez 06 12 34 56 78',true)$q$) = 'comment_has_link_or_contact');
  perform t.check('commentaire trop long refusé', t.err($q$select public.save_choice('ABCDEFGH23456789','002',repeat('a',281),true)$q$) = 'comment_too_long');
  r := public.save_choice(a,'002',E'  Ce regard\n m''a   arrêté.  ',true);
  perform t.check('mode pre : commentaire en attente', r->>'comment_status' = 'pending');

  -- Pixel : validations
  perform t.check('couleur hors palette refusée', t.err($q$select public.place_pixel('ABCDEFGH23456789',1,1,'#123456')$q$) = 'invalid_color');
  perform t.check('hors grille refusé (x=50)', t.err($q$select public.place_pixel('ABCDEFGH23456789',50,0,'#0448B5')$q$) = 'out_of_grid');
  perform t.check('hors grille refusé (y=-1)', t.err($q$select public.place_pixel('ABCDEFGH23456789',0,-1,'#0448B5')$q$) = 'out_of_grid');
  reset role;
  update public.app_settings set value='false'::jsonb where key='contributions_open';
  set local role anon;
  perform t.check('contributions fermées', t.err($q$select public.place_pixel('ABCDEFGH23456789',1,1,'#0448B5')$q$) = 'contributions_closed');
  reset role;
  update public.app_settings set value='true'::jsonb where key='contributions_open';
  set local role anon;

  r := public.place_pixel(a,10,12,'#0448b5');
  perform t.check('pixel posé (couleur normalisée en majuscules)', (r->>'ok')::boolean and r->>'color'='#0448B5' and (r->>'remaining')::int = 2499);
  perform t.check('seconde contribution refusée', t.err($q$select public.place_pixel('ABCDEFGH23456789',11,12,'#0448B5')$q$) = 'already_placed');
  perform t.check('choix verrouillé après le pixel', t.err($q$select public.save_choice('ABCDEFGH23456789','001','',false)$q$) = 'already_placed');

  -- Second visiteur : case occupée
  perform public.start_session(b);
  perform public.add_to_collection(b,'001'); perform public.add_to_collection(b,'004'); perform public.add_to_collection(b,'005');
  perform public.save_choice(b,'004','Une lumière.',true);
  perform t.check('case occupée : cell_taken', t.err($q$select public.place_pixel('JKMNPQRS23456789',10,12,'#F2C230')$q$) = 'cell_taken');
  perform t.check('après cell_taken, le visiteur peut encore poser ailleurs', (public.place_pixel(b,11,12,'#F2C230')->>'ok')::boolean);

  -- Fenêtre « regard d'un autre visiteur »
  r := public.get_cell_detail(10,12);
  perform t.check('commentaire en attente : masqué publiquement', r->'comment' is null or json_typeof(r->'comment')='null');
  perform t.check('détail : photo favorite visible', r->'artwork'->>'id' = '002');
  perform t.check('détail : aucune donnée personnelle', (r::text) !~* 'participant|code|hash|ip');
  perform t.check('case vide : détail nul', public.get_cell_detail(0,0) is null);

  -- Modération
  perform t.check('anon ne peut pas modérer', t.err($q$select public.admin_moderate(10,12,'approve')$q$) like 'permission denied%');
  reset role;
  insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','admin@test'),('22222222-2222-2222-2222-222222222222','visiteur@test');
  insert into public.admins values ('11111111-1111-1111-1111-111111111111');

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', true);
  perform t.check('utilisateur connecté non admin : refusé', t.err('select public.admin_stats()') = 'not_admin');
  perform t.check('non admin ne peut pas modifier les œuvres', (select count(*) from (select 1) s) = 1 and t.err($q$update public.artworks set title='x'$q$) = 'NO_ERROR'); -- 0 ligne modifiée grâce à RLS
  reset role;
  perform t.check('RLS : aucune œuvre modifiée par non-admin', (select count(*) from public.artworks where title='x') = 0);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', true);
  r := public.admin_list_comments('pending');
  perform t.check('admin voit 2 commentaires en attente', json_array_length(r) = 2);
  perform t.check('liste admin sans identité', (r::text) !~* 'participant|hash');
  perform public.admin_moderate(10,12,'approve');
  perform t.check('admin : paramètre invalide refusé', t.err($q$select public.admin_set_setting('min_collection','0'::jsonb)$q$) = 'invalid_value');
  perform t.check('admin : palette invalide refusée', t.err($q$select public.admin_set_setting('palette','[{"name":"x","hex":"rouge"},{"name":"y","hex":"#000000"}]'::jsonb)$q$) = 'invalid_value');
  perform t.check('admin : grid_size non modifiable', t.err($q$select public.admin_set_setting('grid_size','10'::jsonb)$q$) = 'setting_not_editable');
  perform t.check('admin_stats', (public.admin_stats()->>'pixels')::int = 2);
  perform t.check('admin_export sans empreinte', (public.admin_export()::text) !~* 'code_hash|participant');

  set local role anon;
  r := public.get_cell_detail(10,12);
  perform t.check('commentaire approuvé : visible', r->>'comment' = 'Ce regard m''a arrêté.');

  -- Signalements
  perform public.report_comment(10,12); perform public.report_comment(10,12);
  reset role; perform t.check('2 signalements : toujours visible', (select comment_status from public.contributions where cell_x=10 and cell_y=12) = 'approved'); set local role anon;
  perform public.report_comment(10,12);
  reset role; perform t.check('3 signalements : repassé en modération', (select comment_status from public.contributions where cell_x=10 and cell_y=12) = 'pending'); set local role anon;
  perform t.check('commentaire signalé masqué', (public.get_cell_detail(10,12)->>'comment') is null);

  -- État / reprise sur un autre appareil
  r := public.restore_session('abcd-efgh 2345-6789');
  perform t.check('restore : accepte minuscules, espaces et tirets', (r->>'ok')::boolean and r->>'code' = a);
  perform t.check('restore : état complet', json_array_length(r->'state'->'collection') = 3 and (r->'state'->'pixel'->>'x')::int = 10);

  -- Mosaïque incrémentale
  r := public.get_cells(0);
  perform t.check('get_cells : 2 cases', json_array_length(r->'cells') = 2);
  perform t.check('get_cells incrémental', json_array_length(public.get_cells((r->>'last_id')::bigint)->'cells') = 0);

  -- Mode post + mots bloqués
  reset role;
  update public.app_settings set value='"post"'::jsonb where key='moderation_mode';
  update public.app_settings set value='["insulte"]'::jsonb where key='blocked_words';
  delete from public.contributions where cell_x is null;
  set local role anon;
  perform public.start_session('WXYZ23456789ABCD');
  perform public.add_to_collection('WXYZ23456789ABCD','001'); perform public.add_to_collection('WXYZ23456789ABCD','002'); perform public.add_to_collection('WXYZ23456789ABCD','003');
  r := public.save_choice('WXYZ23456789ABCD','001','Magnifique',true);
  perform t.check('mode post : publié directement', r->>'comment_status'='approved');
  r := public.save_choice('WXYZ23456789ABCD','001','Quelle INSULTE',true);
  perform t.check('mot bloqué : repasse en modération', r->>'comment_status'='pending');

  -- Droit à l'effacement
  perform t.check('delete_my_data : code invalide', t.err($q$select public.delete_my_data('ZZZZZZZZZZZZZZZZ')$q$) = 'invalid_code');
  perform public.delete_my_data(b);
  perform t.check('après effacement le code ne marche plus', t.err($q$select public.get_my_state('JKMNPQRS23456789')$q$) = 'invalid_code');
  r := public.get_cell_detail(11,12);
  perform t.check('après effacement : case anonyme sans photo', (r->>'removed')::boolean);
  perform public.delete_my_data(a, true);
  perform t.check('effacement avec libération du pixel', public.get_cell_detail(10,12) is null);

  -- Limitation de débit
  reset role;
  update public.app_settings set value='2'::jsonb where key='rate_new_per_hour';
  delete from public.rate_events;
  set local role anon;
  perform set_config('request.headers','{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}', true);
  perform public.start_session('AAAAAAAA22222221'::text) where false;
  perform public.start_session('ABCDEFGH22222222'); perform public.start_session('ABCDEFGH33333333');
  perform t.check('3e nouveau parcours du même réseau : rate_limited', t.err($q$select public.start_session('ABCDEFGH44444444')$q$) = 'rate_limited');
  perform t.check('un code déjà connu passe toujours', (public.start_session('ABCDEFGH22222222')->>'ok')::boolean);
  reset role;
  perform t.check('aucune adresse IP stockée en clair', (select count(*) from public.rate_events where ip_hash like '%203.0.113%') = 0);
end $$;

-- Grille complète (grille de 2×2 pour le test)
do $$
declare codes text[] := array['GGGGGGGG11111111','HHHHHHHH11111111','JJJJJJJJ11111111','KKKKKKKK11111111','MMMMMMMM11111111']; i int; c text; r json;
begin
  c := null;
  delete from public.participants; delete from public.mosaic_cells; delete from public.rate_events;
  update public.app_settings set value='2'::jsonb where key='grid_size';
  update public.app_settings set value='1000'::jsonb where key='rate_new_per_hour';
  codes := array['GGGGGGGG22222222','HHHHHHHH22222222','JJJJJJJJ22222222','KKKKKKKK22222222','MMMMMMMM22222222'];
  set local role anon;
  perform set_config('request.headers','{}', true);
  for i in 1..5 loop
    c := codes[i];
    perform public.start_session(c);
    perform public.add_to_collection(c,'001'); perform public.add_to_collection(c,'002'); perform public.add_to_collection(c,'003');
    perform public.save_choice(c,'001','',false);
  end loop;
  perform public.place_pixel(codes[1],0,0,'#0D0D0D'); perform public.place_pixel(codes[2],1,0,'#0D0D0D');
  perform public.place_pixel(codes[3],0,1,'#0D0D0D'); perform public.place_pixel(codes[4],1,1,'#0D0D0D');
  perform t.check('grille complète : grid_full', t.err(format($q$select public.place_pixel(%L,1,1,'#0D0D0D')$q$, codes[5])) in ('grid_full','cell_taken') );
  perform t.check('grille complète : message exact grid_full', t.err(format($q$select public.place_pixel(%L,1,1,'#0D0D0D')$q$, codes[5])) = 'grid_full');
  perform t.check('grille complète : compteur', (public.public_config()->>'cells_count')::int = 4);
  reset role;
  update public.app_settings set value='50'::jsonb where key='grid_size';
  delete from public.participants; delete from public.mosaic_cells; delete from public.rate_events;
end $$;
