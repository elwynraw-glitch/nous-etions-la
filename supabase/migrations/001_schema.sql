-- =====================================================================
-- NOUS ÉTIONS LÀ — Migration 001 : tables
-- À exécuter dans Supabase > SQL Editor (une seule fois, dans l'ordre 001, 002, 003, 004)
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Paramètres de l'application (palette, minimum de photos, modération…)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key   text primary key,
  value jsonb not null
);

insert into public.app_settings (key, value) values
  ('grid_size',            '50'::jsonb),
  ('min_collection',       '3'::jsonb),
  ('contributions_open',   'true'::jsonb),
  ('moderation_mode',      '"pre"'::jsonb),   -- "pre" : un commentaire n'apparaît qu'après validation ; "post" : il apparaît tout de suite
  ('max_comment_length',   '280'::jsonb),
  ('retention_days',       '180'::jsonb),     -- durée de conservation des données visiteurs
  ('report_threshold',     '3'::jsonb),       -- nombre de signalements qui masque un commentaire
  ('blocked_words',        '[]'::jsonb),      -- mots qui envoient un commentaire en modération
  ('rate_new_per_hour',    '120'::jsonb),     -- nouveaux parcours / heure / réseau (la médiathèque partage une seule adresse)
  ('rate_actions_per_hour','600'::jsonb),     -- actions sensibles / heure / réseau
  ('palette', '[
      {"name":"Noir","hex":"#0D0D0D"},
      {"name":"Blanc cassé","hex":"#F0EDE6"},
      {"name":"Gris clair","hex":"#B8B5AE"},
      {"name":"Gris foncé","hex":"#3A3A3A"},
      {"name":"Bleu électrique","hex":"#0448B5"},
      {"name":"Bleu nuit","hex":"#0A2A6E"},
      {"name":"Jaune","hex":"#F2C230"},
      {"name":"Rouge","hex":"#C8281E"}
    ]'::jsonb);

-- ---------------------------------------------------------------------
-- Œuvres (les photographies exposées)
-- ---------------------------------------------------------------------
create table public.artworks (
  id          text primary key check (id ~ '^[a-z0-9-]{1,32}$'),   -- ex. '001' -> /oeuvre/001
  title       text not null check (char_length(title) between 1 and 200),
  taken_on    text check (char_length(taken_on) <= 100),            -- texte libre : « 17 octobre 2026 »
  location    text check (char_length(location) <= 200),
  caption     text check (char_length(caption) <= 1500),
  image_path  text,                                                 -- chemin dans Supabase Storage ; vide = image de démonstration
  is_demo     boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Données visiteurs (PRIVÉES : aucune lecture directe depuis le navigateur)
-- ---------------------------------------------------------------------
create table public.participants (
  id           uuid primary key default gen_random_uuid(),
  code_hash    bytea not null unique,              -- empreinte SHA-256 du code de récupération (le code lui-même n'est jamais stocké)
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.collection_items (
  participant_id uuid not null references public.participants(id) on delete cascade,
  artwork_id     text not null references public.artworks(id)    on delete cascade,
  added_at       timestamptz not null default now(),
  primary key (participant_id, artwork_id)          -- empêche d'ajouter deux fois la même photo
);

-- La grille publique : uniquement position + couleur. Aucune donnée personnelle.
create table public.mosaic_cells (
  id        bigint generated always as identity unique,
  x         smallint not null check (x >= 0),
  y         smallint not null check (y >= 0),
  color     text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  placed_at timestamptz not null default now(),
  primary key (x, y)                                -- une case = une seule contribution, garanti par la base
);

create table public.contributions (
  participant_id      uuid primary key references public.participants(id) on delete cascade,  -- une contribution par participant
  favorite_artwork_id text references public.artworks(id) on delete set null,
  comment             text,
  comment_public      boolean not null default false,
  comment_status      text not null default 'none' check (comment_status in ('none','pending','approved','rejected')),
  report_count        integer not null default 0,
  choice_saved_at     timestamptz not null default now(),
  cell_x              smallint,
  cell_y              smallint,
  placed_at           timestamptz,
  unique (cell_x, cell_y),
  foreign key (cell_x, cell_y) references public.mosaic_cells(x, y) on delete set null (cell_x, cell_y)
);

-- Limitation de débit (empreintes de réseau, salées et renouvelées chaque jour)
create table public.rate_events (
  kind       text not null,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index on public.rate_events (kind, ip_hash, created_at);

-- Administrateurs (liés à Supabase Auth)
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Sel secret pour les empreintes de réseau
create table public.secrets (
  name  text primary key,
  value text not null
);
insert into public.secrets (name, value)
values ('ip_salt', encode(extensions.gen_random_bytes(24), 'hex'));
