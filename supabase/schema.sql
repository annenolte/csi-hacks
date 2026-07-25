-- Frontdesk schema. Paste this whole file into the Supabase SQL editor and run it.
-- Safe to re-run: every statement is idempotent.
--
-- Row Level Security is ENABLED on every table with NO policies, which denies all
-- access through the anon key. That is deliberate. Every read and write in this app
-- goes through the service role key on the server, and the browser never talks to
-- Supabase directly. If you later add client-side queries you must write policies
-- first — an RLS-enabled table with no policies fails closed, which is the correct
-- direction to fail.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- accounts + sessions
--
-- This is application-managed auth, not Supabase Auth: the user asked for a
-- deliberately basic signup, and swapping in Supabase Auth later means changing
-- where account_id comes from rather than reshaping every table below.
-- Passwords are scrypt hashes written by lib/auth/password.js. Never plaintext.
-- ---------------------------------------------------------------------------

create table if not exists accounts (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  first_name    text not null,
  last_name     text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- Case-insensitive: nobody thinks Anne@x.com and anne@x.com are two accounts.
create unique index if not exists accounts_email_key on accounts (lower(email));

create table if not exists sessions (
  token      text primary key,
  account_id uuid not null references accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_account on sessions (account_id);
create index if not exists sessions_expires on sessions (expires_at);

-- ---------------------------------------------------------------------------
-- businesses
--
-- One per account for now, but modelled as many so a second location or a second
-- trade is a row rather than a migration. Every other table hangs off business_id.
-- ---------------------------------------------------------------------------

create table if not exists businesses (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references accounts (id) on delete cascade,

  name               text not null,
  industry_id        text,
  website_url        text,

  -- Generated at the end of onboarding. Pretend for now: nothing is provisioned
  -- with a carrier, but it is unique so the number can become the key the voice
  -- agent matches an inbound call on without a data migration.
  agent_phone_number text,

  -- not_started | in_progress | complete
  onboarding_status  text not null default 'not_started',

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists businesses_account on businesses (account_id);
create unique index if not exists businesses_phone_key
  on businesses (agent_phone_number)
  where agent_phone_number is not null;

-- ---------------------------------------------------------------------------
-- business_fields — one row per answered need, not a JSON blob
--
-- The reason is provenance. Every value carries where it came from, how confident
-- we were, and the sentence it was read from, so the dashboard can show the
-- operator why the agent believes something before they decide to change it.
--
-- `key` is a need key from lib/trades.js. Deliberately not an enum or a
-- foreign key: that file is the source of truth, and adding a need should never
-- require a database migration.
-- ---------------------------------------------------------------------------

create table if not exists business_fields (
  id              bigint generated always as identity primary key,
  business_id     uuid not null references businesses (id) on delete cascade,

  key             text not null,
  value           jsonb not null,

  -- website | documents | operator — where this value came from.
  source          text not null default 'operator',
  confidence      int,
  source_sentence text,
  source_document text,

  updated_at      timestamptz not null default now(),

  unique (business_id, key)
);

create index if not exists business_fields_business on business_fields (business_id);

-- ---------------------------------------------------------------------------
-- documents — the corpus the agent was trained from
-- ---------------------------------------------------------------------------

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,

  kind        text not null,  -- 'file' | 'url'
  name        text not null,
  source      text not null,
  text        text,
  chars       int,

  created_at  timestamptz not null default now()
);

create index if not exists documents_business on documents (business_id);

-- ---------------------------------------------------------------------------
-- facts — what the documents CLAIM, separate from what the owner CONFIRMED
--
-- business_fields is settled knowledge; this table is proposals. Two rows may
-- share a key when two documents disagree, which is why there is no unique index:
-- a conflict is a thing to show the owner, not a thing to resolve by overwriting.
-- ---------------------------------------------------------------------------

create table if not exists facts (
  id              bigint generated always as identity primary key,
  business_id     uuid not null references businesses (id) on delete cascade,

  key             text not null,
  value           jsonb not null,
  confidence      int,
  source_sentence text,
  document_name   text,
  conflicted      boolean not null default false,

  created_at      timestamptz not null default now()
);

create index if not exists facts_business_key on facts (business_id, key);

-- ---------------------------------------------------------------------------
-- prices
--
-- `tier` is written by lib/synthesis/classify.js, in code, never by the model.
-- `raw_text` keeps the qualifying words ("starting at", "per hour") because those
-- are exactly what the classifier reads — normalising "$95 per hour" to "$95"
-- would silently promote an hourly rate into a flat quote the agent may state.
-- ---------------------------------------------------------------------------

create table if not exists prices (
  id              bigint generated always as identity primary key,
  business_id     uuid not null references businesses (id) on delete cascade,

  service_key     text not null,
  raw_text        text not null,
  amount          numeric,      -- only set when the tier is quotable
  tier            text not null,  -- quotable | range_only | human_required
  reason          text,
  confidence      int,
  source_sentence text,
  document_name   text,

  created_at      timestamptz not null default now()
);

create index if not exists prices_business on prices (business_id);

-- ---------------------------------------------------------------------------
-- conversations + messages — the onboarding interview
--
-- Persisted so a refresh mid-onboarding picks up where it left off, and so the
-- operator can see later what the agent was told and by whom.
-- ---------------------------------------------------------------------------

create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,

  -- The state-machine node from lib/onboarding/script.js.
  stage       text not null default 'industry',
  -- Per-stage bookkeeping the spine needs across turns (which gap we're on, etc).
  state       jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_business on conversations (business_id);

create table if not exists messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,

  role            text not null,   -- 'agent' | 'user'
  body            text,            -- what was said
  component       jsonb,           -- the structured input the agent rendered, if any
  answer          jsonb,           -- what the user put into it, if any

  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation on messages (conversation_id, id);

-- ---------------------------------------------------------------------------
-- calendar_connections — Google OAuth tokens
--
-- The refresh token is the long-lived secret here. It lives only in this table,
-- is read only by the server, and is never sent to the browser.
-- ---------------------------------------------------------------------------

create table if not exists calendar_connections (
  business_id   uuid primary key references businesses (id) on delete cascade,

  provider      text not null default 'google',
  google_email  text,
  calendar_id   text not null default 'primary',

  access_token  text,
  refresh_token text not null,
  expires_at    timestamptz,
  scope         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Lock everything down. See the note at the top of this file.
-- ---------------------------------------------------------------------------

alter table accounts              enable row level security;
alter table sessions              enable row level security;
alter table businesses            enable row level security;
alter table business_fields       enable row level security;
alter table documents             enable row level security;
alter table facts                 enable row level security;
alter table prices                enable row level security;
alter table conversations         enable row level security;
alter table messages              enable row level security;
alter table calendar_connections  enable row level security;
