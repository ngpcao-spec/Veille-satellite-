-- Veille satellite IA — modèle de données MVP (spec : "Modèle de données Supabase")
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type sensibilite as enum ('basse', 'normale', 'haute');
create type capteur as enum ('S1', 'S2');
create type statut_acquisition as enum ('ignoree', 'analysee');
create type gravite as enum ('info', 'a_surveiller', 'alerte');
create type retour_utilisateur as enum ('confirme', 'fausse_alerte');
create type job_type as enum ('scan', 'analyse', 'reference');
create type job_statut as enum ('en_attente', 'en_cours', 'termine', 'erreur');

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 120),
  geom extensions.geometry(Polygon, 4326) not null,
  surface_ha numeric,
  sensibilite sensibilite not null default 'normale',
  types_suivis text[] not null default '{vegetation,eau,construction}',
  actif boolean not null default true,
  derniere_verif_at timestamptz,
  created_at timestamptz not null default now(),
  -- 1 ha à 100 km²
  constraint zones_surface_ck check (
    extensions.st_area(geom::extensions.geography) between 10000 and 100000000
  ),
  constraint zones_types_ck check (types_suivis <@ array['vegetation','eau','construction'])
);
create index zones_geom_idx on public.zones using gist (geom);
create index zones_user_idx on public.zones (user_id);

create table public.references_indices (
  zone_id uuid not null references public.zones(id) on delete cascade,
  mois smallint not null check (mois between 1 and 12),
  indice text not null,
  mediane double precision,
  ecart_type double precision,
  primary key (zone_id, mois, indice)
);

create table public.acquisitions (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  capteur capteur not null,
  date_acquisition timestamptz not null,
  couverture_nuage numeric,
  statut statut_acquisition not null default 'analysee',
  unique (zone_id, capteur, date_acquisition)
);
create index acquisitions_zone_date_idx on public.acquisitions (zone_id, date_acquisition desc);

create table public.mesures (
  acquisition_id uuid not null references public.acquisitions(id) on delete cascade,
  indice text not null,
  moyenne double precision,
  p10 double precision,
  p90 double precision,
  z_score double precision,
  part_pixels_changes double precision,
  primary key (acquisition_id, indice)
);

create table public.evenements (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  acquisition_id uuid references public.acquisitions(id) on delete set null,
  type text,
  description text,
  gravite gravite,
  confiance numeric check (confiance between 0 and 1),
  est_artefact boolean not null default false,
  surface_ha numeric,
  images jsonb not null default '{}'::jsonb,
  retour_utilisateur retour_utilisateur,
  created_at timestamptz not null default now()
);
create index evenements_zone_idx on public.evenements (zone_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.evenements(id) on delete cascade,
  canal text not null check (canal in ('email', 'push')),
  envoye_at timestamptz,
  statut text not null default 'en_attente'
);

create table public.push_subscriptions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null,
  cles jsonb not null,
  primary key (user_id, endpoint)
);

create table public.reglages (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  alerte_email boolean not null default true,
  alerte_push boolean not null default true,
  resume_hebdo boolean not null default true
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  type job_type not null,
  statut job_statut not null default 'en_attente',
  tentatives int not null default 0,
  erreur text,
  run_after timestamptz not null default now()
);
create index jobs_pending_idx on public.jobs (run_after) where statut = 'en_attente';

create function public.set_zone_surface() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.surface_ha := round((st_area(new.geom::geography) / 10000)::numeric, 2);
  return new;
end $$;
create trigger zones_set_surface before insert or update of geom on public.zones
  for each row execute function public.set_zone_surface();

-- Une zone nouvellement créée déclenche le calcul de sa référence (étape 3).
create function public.enqueue_reference_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.jobs (zone_id, type) values (new.id, 'reference');
  return new;
end $$;
create trigger zones_enqueue_reference after insert on public.zones
  for each row execute function public.enqueue_reference_job();

-- Création d'une zone depuis un GeoJSON (Polygon) dessiné sur la carte.
create function public.create_zone(
  p_nom text, p_geojson jsonb, p_sensibilite sensibilite, p_types text[]
) returns public.zones
language plpgsql security invoker set search_path = public, extensions as $$
declare z public.zones;
begin
  insert into public.zones (nom, geom, sensibilite, types_suivis)
  values (
    p_nom,
    st_setsrid(st_geomfromgeojson(p_geojson::text), 4326),
    p_sensibilite,
    p_types
  )
  returning * into z;
  return z;
end $$;

-- Row Level Security : chaque utilisateur ne voit que ses zones et ce qui en dépend.
alter table public.zones enable row level security;
alter table public.references_indices enable row level security;
alter table public.acquisitions enable row level security;
alter table public.mesures enable row level security;
alter table public.evenements enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reglages enable row level security;
alter table public.jobs enable row level security;

create policy zones_own on public.zones for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy references_own on public.references_indices for select
  using (exists (select 1 from public.zones z where z.id = zone_id and z.user_id = auth.uid()));
create policy acquisitions_own on public.acquisitions for select
  using (exists (select 1 from public.zones z where z.id = zone_id and z.user_id = auth.uid()));
create policy mesures_own on public.mesures for select
  using (exists (
    select 1 from public.acquisitions a join public.zones z on z.id = a.zone_id
    where a.id = acquisition_id and z.user_id = auth.uid()));
create policy evenements_select on public.evenements for select
  using (exists (select 1 from public.zones z where z.id = zone_id and z.user_id = auth.uid()));
create policy evenements_feedback on public.evenements for update
  using (exists (select 1 from public.zones z where z.id = zone_id and z.user_id = auth.uid()))
  with check (exists (select 1 from public.zones z where z.id = zone_id and z.user_id = auth.uid()));
create policy notifications_own on public.notifications for select
  using (exists (
    select 1 from public.evenements e join public.zones z on z.id = e.zone_id
    where e.id = evenement_id and z.user_id = auth.uid()));
create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reglages_own on public.reglages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- jobs : aucune policy, accessible uniquement par la clé service (worker).

-- Bucket privé pour les images avant/après/changement : zone-images/{zone_id}/{date}/
insert into storage.buckets (id, name, public) values ('zone-images', 'zone-images', false)
on conflict (id) do nothing;
create policy zone_images_read on storage.objects for select to authenticated
  using (
    bucket_id = 'zone-images'
    and exists (
      select 1 from public.zones z
      where z.id::text = (storage.foldername(name))[1] and z.user_id = auth.uid()
    )
  );
