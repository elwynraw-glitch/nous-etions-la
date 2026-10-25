-- =====================================================================
-- NOUS ÉTIONS LÀ — Migration 002 : fonctions serveur
-- Toutes les règles critiques sont vérifiées ICI, côté serveur.
-- Le navigateur ne peut rien écrire directement dans les tables visiteurs.
-- Les codes d'erreur (ex. 'cell_taken') sont traduits en français par l'interface.
-- =====================================================================

-- ---------- Utilitaires internes (non appelables depuis le navigateur) ----------

create or replace function public._setting(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function public._normalize_code(p_code text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'))
$$;

-- Limitation de débit par réseau. L'adresse n'est jamais stockée : seulement une empreinte salée, renouvelée chaque jour.
create or replace function public._rate_limit(p_kind text, p_setting text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_headers json;
  v_ip text;
  v_hash text;
  v_limit int;
  v_count int;
begin
  begin
    v_headers := current_setting('request.headers', true)::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := trim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'cf-connecting-ip', ''), ',', 1));
  if v_ip = '' then return; end if;   -- appel sans réseau identifiable (ex. SQL direct) : pas de limite

  v_hash := encode(digest(v_ip || current_date::text || (select value from public.secrets where name = 'ip_salt'), 'sha256'), 'hex');
  v_limit := coalesce((public._setting(p_setting))::text::int, 100);

  select count(*) into v_count from public.rate_events
   where kind = p_kind and ip_hash = v_hash and created_at > now() - interval '1 hour';
  if v_count >= v_limit then
    raise exception 'rate_limited';
  end if;

  insert into public.rate_events (kind, ip_hash) values (p_kind, v_hash);
  if random() < 0.02 then
    delete from public.rate_events where created_at < now() - interval '3 hours';
  end if;
end $$;

-- Retrouve le participant à partir de son code de récupération.
create or replace function public._participant(p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := public._normalize_code(p_code);
  v_id uuid;
begin
  if v_code !~ '^[2-9A-HJKMNP-Z]{16}$' then
    raise exception 'invalid_code';
  end if;
  select id into v_id from public.participants where code_hash = digest(v_code, 'sha256');
  if v_id is null then
    raise exception 'invalid_code';
  end if;
  update public.participants set last_seen_at = now()
   where id = v_id and last_seen_at < now() - interval '1 hour';
  return v_id;
end $$;

create or replace function public._collection_count(p_pid uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
    from public.collection_items ci
    join public.artworks a on a.id = ci.artwork_id and a.active
   where ci.participant_id = p_pid
$$;

create or replace function public._state(p_pid uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'collection', coalesce((
        select json_agg(ci.artwork_id order by ci.added_at)
          from public.collection_items ci
          join public.artworks a on a.id = ci.artwork_id and a.active
         where ci.participant_id = p_pid), '[]'::json),
    'choice', (
        select json_build_object('artwork_id', c.favorite_artwork_id, 'comment', c.comment,
                                 'comment_public', c.comment_public, 'comment_status', c.comment_status)
          from public.contributions c where c.participant_id = p_pid),
    'pixel', (
        select json_build_object('x', c.cell_x, 'y', c.cell_y, 'color', m.color)
          from public.contributions c
          join public.mosaic_cells m on m.x = c.cell_x and m.y = c.cell_y
         where c.participant_id = p_pid)
  )
$$;

-- ---------- Lecture publique ----------

create or replace function public.public_config()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'grid_size',          (public._setting('grid_size'))::text::int,
    'min_collection',     (public._setting('min_collection'))::text::int,
    'contributions_open', (public._setting('contributions_open'))::text::boolean,
    'moderation_mode',    public._setting('moderation_mode') #>> '{}',
    'max_comment_length', (public._setting('max_comment_length'))::text::int,
    'retention_days',     (public._setting('retention_days'))::text::int,
    'palette',            public._setting('palette'),
    'cells_count',        (select count(*) from public.mosaic_cells)
  )
$$;

-- Cases de la mosaïque, de façon incrémentale. Un seul appel renvoie tout (pas de limite de 1000 lignes).
create or replace function public.get_cells(p_after_id bigint default 0)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'cells', coalesce(json_agg(json_build_array(id, x, y, color) order by id), '[]'::json),
    'last_id', coalesce(max(id), p_after_id)
  )
  from public.mosaic_cells where id > p_after_id
$$;

-- Fenêtre « regard d'un autre visiteur » : jamais d'identité, jamais d'heure précise.
create or replace function public.get_cell_detail(p_x int, p_y int)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_cell public.mosaic_cells%rowtype;
  v_c public.contributions%rowtype;
  v_art public.artworks%rowtype;
begin
  select * into v_cell from public.mosaic_cells where x = p_x and y = p_y;
  if not found then return null; end if;

  select * into v_c from public.contributions where cell_x = p_x and cell_y = p_y;
  if not found or v_c.favorite_artwork_id is null then
    return json_build_object('x', p_x, 'y', p_y, 'color', v_cell.color,
                             'placed_on', v_cell.placed_at::date, 'removed', true);
  end if;

  select * into v_art from public.artworks where id = v_c.favorite_artwork_id;
  return json_build_object(
    'x', p_x, 'y', p_y, 'color', v_cell.color, 'placed_on', v_cell.placed_at::date,
    'removed', false,
    'artwork', json_build_object('id', v_art.id, 'title', v_art.title, 'taken_on', v_art.taken_on,
                                 'location', v_art.location, 'image_path', v_art.image_path,
                                 'is_demo', v_art.is_demo),
    'comment', case when v_c.comment_public and v_c.comment_status = 'approved' then v_c.comment else null end
  );
end $$;

-- ---------- Parcours visiteur ----------

create or replace function public.start_session(p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := public._normalize_code(p_code);
begin
  if v_code !~ '^[2-9A-HJKMNP-Z]{16}$' then
    raise exception 'invalid_code';
  end if;
  if exists (select 1 from public.participants where code_hash = digest(v_code, 'sha256')) then
    return json_build_object('ok', true, 'existing', true);
  end if;
  perform public._rate_limit('new', 'rate_new_per_hour');
  insert into public.participants (code_hash) values (digest(v_code, 'sha256'))
    on conflict (code_hash) do nothing;
  return json_build_object('ok', true, 'existing', false);
end $$;

-- Reprise sur un autre appareil. Ne lève pas d'exception sur un code faux (pour que la tentative soit comptée).
create or replace function public.restore_session(p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := public._normalize_code(p_code);
  v_id uuid;
begin
  perform public._rate_limit('restore', 'rate_actions_per_hour');
  if v_code !~ '^[2-9A-HJKMNP-Z]{16}$' then
    return json_build_object('ok', false, 'error', 'invalid_code');
  end if;
  select id into v_id from public.participants where code_hash = digest(v_code, 'sha256');
  if v_id is null then
    return json_build_object('ok', false, 'error', 'invalid_code');
  end if;
  return json_build_object('ok', true, 'code', v_code, 'state', public._state(v_id));
end $$;

create or replace function public.get_my_state(p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  return public._state(public._participant(p_code));
end $$;

create or replace function public.add_to_collection(p_code text, p_artwork_id text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := public._participant(p_code);
  v_rows int;
begin
  if not exists (select 1 from public.artworks where id = p_artwork_id and active) then
    raise exception 'unknown_artwork';
  end if;
  insert into public.collection_items (participant_id, artwork_id) values (v_pid, p_artwork_id)
    on conflict do nothing;
  get diagnostics v_rows = row_count;
  return json_build_object('status', case when v_rows = 1 then 'added' else 'already' end,
                           'count', public._collection_count(v_pid));
end $$;

create or replace function public.save_choice(p_code text, p_artwork_id text, p_comment text, p_public boolean)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := public._participant(p_code);
  v_min int := (public._setting('min_collection'))::text::int;
  v_max int := (public._setting('max_comment_length'))::text::int;
  v_mode text := public._setting('moderation_mode') #>> '{}';
  v_comment text;
  v_status text := 'none';
  v_public boolean := coalesce(p_public, false);
  v_word text;
  v_placed boolean;
begin
  if public._collection_count(v_pid) < v_min then
    raise exception 'collection_too_small';
  end if;
  if not exists (select 1 from public.collection_items ci join public.artworks a on a.id = ci.artwork_id and a.active
                  where ci.participant_id = v_pid and ci.artwork_id = p_artwork_id) then
    raise exception 'not_in_collection';
  end if;
  select (cell_x is not null) into v_placed from public.contributions where participant_id = v_pid;
  if coalesce(v_placed, false) then
    raise exception 'already_placed';
  end if;

  -- Nettoyage du commentaire : espaces, retours à la ligne et caractères de contrôle remplacés par des espaces simples
  v_comment := nullif(btrim(regexp_replace(regexp_replace(coalesce(p_comment, ''), '[[:cntrl:]]', ' ', 'g'), ' {2,}', ' ', 'g')), '');
  if v_comment is not null and char_length(v_comment) > v_max then
    raise exception 'comment_too_long';
  end if;

  if v_comment is null or not v_public then
    -- Pas de consentement de publication : le commentaire n'est PAS conservé.
    v_comment := null;
    v_public := false;
    v_status := 'none';
  else
    -- Liens, e-mails et numéros de téléphone refusés (protection des données personnelles)
    if v_comment ~* '(https?://|www\.|[a-z0-9-]+\.(com|fr|net|org|io|me|co|info|be|ch)\b)'
       or v_comment ~* '[^[:space:]]+@[^[:space:]]+\.[a-z]{2,}'
       or v_comment ~ '(\d[ .-]?){9,}' then
      raise exception 'comment_has_link_or_contact';
    end if;
    v_status := case when v_mode = 'post' then 'approved' else 'pending' end;
    for v_word in select jsonb_array_elements_text(public._setting('blocked_words')) loop
      if v_word <> '' and position(lower(v_word) in lower(v_comment)) > 0 then
        v_status := 'pending';
      end if;
    end loop;
  end if;

  insert into public.contributions (participant_id, favorite_artwork_id, comment, comment_public, comment_status, report_count, choice_saved_at)
  values (v_pid, p_artwork_id, v_comment, v_public, v_status, 0, now())
  on conflict (participant_id) do update
     set favorite_artwork_id = excluded.favorite_artwork_id, comment = excluded.comment,
         comment_public = excluded.comment_public, comment_status = excluded.comment_status,
         report_count = 0, choice_saved_at = now();

  return json_build_object('ok', true, 'comment_status', v_status);
end $$;

create or replace function public.place_pixel(p_code text, p_x int, p_y int, p_color text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := public._participant(p_code);
  v_size int := (public._setting('grid_size'))::text::int;
  v_min int := (public._setting('min_collection'))::text::int;
  v_color text := upper(coalesce(p_color, ''));
  v_c public.contributions%rowtype;
  v_count int;
begin
  -- Verrou sur le participant : deux clics rapides du même visiteur sont traités l'un après l'autre.
  perform 1 from public.participants where id = v_pid for update;

  if not (public._setting('contributions_open'))::text::boolean then
    raise exception 'contributions_closed';
  end if;
  if public._collection_count(v_pid) < v_min then
    raise exception 'collection_too_small';
  end if;
  select * into v_c from public.contributions where participant_id = v_pid;
  if not found or v_c.favorite_artwork_id is null then
    raise exception 'choice_required';
  end if;
  if v_c.cell_x is not null then
    raise exception 'already_placed';
  end if;
  if p_x is null or p_y is null or p_x < 0 or p_y < 0 or p_x >= v_size or p_y >= v_size then
    raise exception 'out_of_grid';
  end if;
  if not exists (select 1 from jsonb_array_elements(public._setting('palette')) e where upper(e ->> 'hex') = v_color) then
    raise exception 'invalid_color';
  end if;
  select count(*) into v_count from public.mosaic_cells;
  if v_count >= v_size * v_size then
    raise exception 'grid_full';
  end if;

  perform public._rate_limit('pixel', 'rate_actions_per_hour');

  begin
    insert into public.mosaic_cells (x, y, color) values (p_x, p_y, v_color);
  exception when unique_violation then
    raise exception 'cell_taken';
  end;

  update public.contributions set cell_x = p_x, cell_y = p_y, placed_at = now() where participant_id = v_pid;

  return json_build_object('ok', true, 'x', p_x, 'y', p_y, 'color', v_color,
                           'remaining', v_size * v_size - v_count - 1, 'total', v_count + 1);
end $$;

create or replace function public.report_comment(p_x int, p_y int)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_threshold int := (public._setting('report_threshold'))::text::int;
begin
  perform public._rate_limit('report', 'rate_actions_per_hour');
  update public.contributions
     set report_count = report_count + 1,
         comment_status = case when comment_status = 'approved' and report_count + 1 >= v_threshold
                               then 'pending' else comment_status end
   where cell_x = p_x and cell_y = p_y and comment is not null;
  return json_build_object('ok', true);
end $$;

-- Droit à l'effacement. Par défaut la case colorée reste (anonyme, sans photo ni commentaire) ; p_remove_pixel la libère.
create or replace function public.delete_my_data(p_code text, p_remove_pixel boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid := public._participant(p_code);
  v_x smallint;
  v_y smallint;
begin
  select cell_x, cell_y into v_x, v_y from public.contributions where participant_id = v_pid;
  delete from public.participants where id = v_pid;     -- supprime collection et contribution en cascade
  if p_remove_pixel and v_x is not null then
    delete from public.mosaic_cells where x = v_x and y = v_y;
  end if;
  return json_build_object('ok', true);
end $$;

-- ---------- Administration (réservée aux comptes listés dans la table admins) ----------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

create or replace function public._require_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
end $$;

create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := (public._setting('grid_size'))::text::int;
begin
  perform public._require_admin();
  return json_build_object(
    'participants',     (select count(*) from public.participants),
    'with_choice',      (select count(*) from public.contributions where favorite_artwork_id is not null),
    'pixels',           (select count(*) from public.mosaic_cells),
    'grid_total',       v_size * v_size,
    'pending_comments', (select count(*) from public.contributions where comment_status = 'pending'),
    'adds_per_artwork', coalesce((
        select json_agg(json_build_object('id', a.id, 'title', a.title,
                 'adds', (select count(*) from public.collection_items ci where ci.artwork_id = a.id)) order by a.id)
          from public.artworks a), '[]'::json)
  );
end $$;

create or replace function public.admin_list_comments(p_status text default 'pending')
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return coalesce((
    select json_agg(json_build_object('x', c.cell_x, 'y', c.cell_y, 'artwork_id', c.favorite_artwork_id,
             'artwork_title', a.title, 'comment', c.comment, 'status', c.comment_status,
             'reports', c.report_count, 'placed_at', c.placed_at) order by c.report_count desc, c.choice_saved_at)
      from public.contributions c
      left join public.artworks a on a.id = c.favorite_artwork_id
     where c.comment is not null and c.comment_status = p_status), '[]'::json);
end $$;

-- Une contribution dont le commentaire n'a pas encore de case (pixel non posé) n'est pas listée : x et y sont nuls.
create or replace function public.admin_moderate(p_x int, p_y int, p_action text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_action = 'approve' then
    update public.contributions set comment_status = 'approved', report_count = 0
     where cell_x = p_x and cell_y = p_y and comment is not null;
  elsif p_action = 'reject' then
    update public.contributions set comment_status = 'rejected', comment = null, comment_public = false
     where cell_x = p_x and cell_y = p_y;
  else
    raise exception 'invalid_action';
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_el jsonb;
begin
  perform public._require_admin();
  if p_key not in ('min_collection','contributions_open','moderation_mode','max_comment_length','retention_days',
                   'report_threshold','blocked_words','rate_new_per_hour','rate_actions_per_hour','palette') then
    raise exception 'setting_not_editable';
  end if;
  if p_key in ('min_collection','max_comment_length','retention_days','report_threshold','rate_new_per_hour','rate_actions_per_hour')
     and (jsonb_typeof(p_value) <> 'number' or (p_value)::text::numeric < 1 or (p_value)::text::numeric <> floor((p_value)::text::numeric)) then
    raise exception 'invalid_value';
  end if;
  if p_key = 'contributions_open' and jsonb_typeof(p_value) <> 'boolean' then raise exception 'invalid_value'; end if;
  if p_key = 'moderation_mode' and (p_value #>> '{}') not in ('pre','post') then raise exception 'invalid_value'; end if;
  if p_key = 'blocked_words' and jsonb_typeof(p_value) <> 'array' then raise exception 'invalid_value'; end if;
  if p_key = 'palette' then
    if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) not between 2 and 24 then raise exception 'invalid_value'; end if;
    for v_el in select * from jsonb_array_elements(p_value) loop
      if coalesce(v_el ->> 'hex', '') !~ '^#[0-9A-Fa-f]{6}$' or coalesce(v_el ->> 'name', '') = '' then
        raise exception 'invalid_value';
      end if;
    end loop;
  end if;
  update public.app_settings set value = p_value where key = p_key;
  return json_build_object('ok', true);
end $$;

-- Sauvegarde : tout ce qui est utile, sans aucune donnée permettant de relier une contribution à une personne.
create or replace function public.admin_export()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_admin();
  return json_build_object(
    'exported_at', now(),
    'settings', (select json_object_agg(key, value) from public.app_settings),
    'artworks', coalesce((select json_agg(to_json(a) order by a.id) from public.artworks a), '[]'::json),
    'cells',    coalesce((select json_agg(json_build_object('x', m.x, 'y', m.y, 'color', m.color, 'placed_at', m.placed_at) order by m.id) from public.mosaic_cells m), '[]'::json),
    'contributions', coalesce((select json_agg(json_build_object('x', c.cell_x, 'y', c.cell_y, 'artwork_id', c.favorite_artwork_id,
          'comment', case when c.comment_public and c.comment_status = 'approved' then c.comment else null end,
          'comment_status', c.comment_status) order by c.cell_y, c.cell_x)
        from public.contributions c where c.cell_x is not null), '[]'::json)
  );
end $$;

-- Suppression des données des visiteurs inactifs depuis plus de « retention_days » jours.
create or replace function public.purge_expired()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_days int := (public._setting('retention_days'))::text::int;
  v_n int;
begin
  delete from public.participants where last_seen_at < now() - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  delete from public.rate_events where created_at < now() - interval '3 hours';
  return v_n;
end $$;

create or replace function public.admin_purge_expired()
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return json_build_object('ok', true, 'deleted', public.purge_expired());
end $$;

-- À utiliser UNIQUEMENT pour effacer les contributions de test avant l'ouverture au public.
create or replace function public.admin_reset_visitor_data()
returns json language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  delete from public.participants;      -- cascade : collections et contributions
  delete from public.mosaic_cells;
  delete from public.rate_events;
  return json_build_object('ok', true);
end $$;
