-- ETHEREA Board : schéma Supabase
-- À exécuter une fois dans Supabase > SQL Editor > New query > Run.
-- Toutes les tables sont réservées aux utilisateurs connectés (équipe ETHEREA).
-- Pensez à désactiver les inscriptions publiques : Authentication > Sign In / Providers > "Allow new users to sign up" = off.

create extension if not exists "pgcrypto";

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type text default 'Professionnel',
  syndic text,
  contact text,
  email text,
  tel text,
  adresse text,
  notes text,
  updated_at timestamptz default now()
);

create table if not exists contrats (
  id uuid primary key default gen_random_uuid(),
  numero text,
  client_id uuid references clients(id) on delete cascade,
  metier text,
  prestation text,
  frequence text,
  passages_par_an int,
  prix_passage numeric,
  date_debut date,
  technicien text,
  statut text default 'actif',
  notes text,
  updated_at timestamptz default now()
);

create table if not exists factures (
  id uuid primary key default gen_random_uuid(),
  numero text,
  client_id uuid references clients(id) on delete set null,
  date_emission date,
  echeance date,
  montant_ht numeric default 0,
  main_oeuvre numeric,
  materiel numeric,
  statut text default 'en_attente',
  date_paiement date,
  derniere_relance date,
  nb_relances int default 0,
  notes text,
  updated_at timestamptz default now()
);

create table if not exists interventions (
  id uuid primary key default gen_random_uuid(),
  date date,
  heure text,
  client_id uuid references clients(id) on delete cascade,
  contrat_id uuid references contrats(id) on delete set null,
  facture_id uuid references factures(id) on delete set null,
  metier text,
  prestation text,
  technicien text,
  statut text default 'planifiee',
  montant numeric,
  certificat_envoye boolean default false,
  rapport_risque boolean default false,
  notes text,
  updated_at timestamptz default now()
);

create table if not exists devis (
  id uuid primary key default gen_random_uuid(),
  numero text,
  client_id uuid references clients(id) on delete set null,
  date_envoi date,
  metier text,
  service text,
  montant_ht numeric default 0,
  statut text default 'envoye',
  date_signature date,
  notes text,
  updated_at timestamptz default now()
);

create table if not exists techniciens (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  tel text,
  secteur text,
  fiabilite int,
  competences text,
  actif boolean default true,
  notes text,
  updated_at timestamptz default now()
);

create table if not exists membres (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  role text,
  email text,
  missions text,
  updated_at timestamptz default now()
);

create table if not exists parametres (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Droits de table : indispensables sur les projets récents, sinon "permission denied".
grant usage on schema public to authenticated;
grant select, insert, update, delete on clients, contrats, factures, interventions, devis, techniciens, membres, parametres to authenticated;
revoke all on clients, contrats, factures, interventions, devis, techniciens, membres, parametres from anon;

-- Sécurité : accès complet pour l'équipe connectée, aucun accès anonyme.
do $$
declare t text;
begin
  foreach t in array array['clients','contrats','factures','interventions','devis','techniciens','membres','parametres'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "equipe" on %I', t);
    execute format('create policy "equipe" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Temps réel : chaque modification apparaît chez toute l'équipe sans recharger.
do $$
declare t text;
begin
  foreach t in array array['clients','contrats','factures','interventions','devis','techniciens','membres','parametres'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
