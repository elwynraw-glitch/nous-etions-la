-- =====================================================================
-- NOUS ÉTIONS LÀ — Migration 003 : sécurité (RLS, droits, stockage, temps réel)
-- Principe : le navigateur n'a AUCUN droit direct sur les données visiteurs.
-- Il ne peut qu'appeler les fonctions listées en bas de ce fichier.
-- =====================================================================

-- 1. Verrouiller toutes les tables (aucune lecture ni écriture sans règle explicite)
alter table public.app_settings     enable row level security;
alter table public.artworks         enable row level security;
alter table public.participants     enable row level security;
alter table public.collection_items enable row level security;
alter table public.mosaic_cells     enable row level security;
alter table public.contributions    enable row level security;
alter table public.rate_events      enable row level security;
alter table public.admins           enable row level security;
alter table public.secrets          enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- 2. Œuvres : lecture publique des œuvres actives ; gestion complète réservée aux administrateurs
grant select on public.artworks to anon, authenticated;
grant insert, update, delete on public.artworks to authenticated;
grant execute on function public.is_admin() to authenticated;

create policy artworks_public_read on public.artworks
  for select to anon, authenticated using (active);
create policy artworks_admin_all on public.artworks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3. Mosaïque : lecture publique (position + couleur uniquement, aucune donnée personnelle). Aucune écriture directe.
grant select on public.mosaic_cells to anon, authenticated;
create policy mosaic_public_read on public.mosaic_cells
  for select to anon, authenticated using (true);

-- 4. Paramètres : lecture réservée aux administrateurs (le public passe par public_config())
grant select on public.app_settings to authenticated;
create policy settings_admin_read on public.app_settings
  for select to authenticated using (public.is_admin());

-- 5. Fonctions appelables par les visiteurs
grant execute on function
  public.public_config(), public.get_cells(bigint), public.get_cell_detail(int, int),
  public.start_session(text), public.restore_session(text), public.get_my_state(text),
  public.add_to_collection(text, text), public.save_choice(text, text, text, boolean),
  public.place_pixel(text, int, int, text), public.report_comment(int, int),
  public.delete_my_data(text, boolean)
to anon, authenticated;

-- 6. Fonctions d'administration (la vérification admin est refaite DANS chaque fonction)
grant execute on function
  public.admin_stats(), public.admin_list_comments(text), public.admin_moderate(int, int, text),
  public.admin_set_setting(text, jsonb), public.admin_export(), public.admin_purge_expired(),
  public.admin_reset_visitor_data()
to authenticated;

-- 7. Photographies : seuls les administrateurs peuvent envoyer ou supprimer des fichiers (lecture publique via bucket public)
insert into storage.buckets (id, name, public)
values ('artworks', 'artworks', true)
on conflict (id) do nothing;

create policy artworks_files_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'artworks' and public.is_admin());
create policy artworks_files_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'artworks' and public.is_admin());
create policy artworks_files_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'artworks' and public.is_admin());

-- 8. Temps réel : seule la table mosaic_cells est diffusée
alter publication supabase_realtime add table public.mosaic_cells;
