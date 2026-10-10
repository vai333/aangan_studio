-- Aangan enquiry desk — schema for Neon (plain Postgres 14+).
-- No RLS / auth schema: the app is the only client. It connects with one server-side
-- DATABASE_URL, and admin access is enforced in the app (signed session cookie).
-- PII (phone numbers, transcripts) lives here: never expose DATABASE_URL to the browser.

create extension if not exists pgcrypto;

create table callers (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  call_count int not null default 0
);

create table calls (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'vaani',
  provider_call_id text not null,
  source text not null default 'webhook' check (source in ('webhook','sync')),
  caller_id uuid references callers(id),
  caller_phone text not null,
  started_at timestamptz not null,
  answered_after_sec int,
  duration_sec int not null default 0,
  status text not null check (status in ('answered','missed','dropped')),
  end_reason text,
  transcript jsonb not null default '[]'::jsonb,   -- [{speaker:'agent'|'caller', text}]
  recording_url text,
  merged_into uuid references calls(id),
  raw_payload jsonb,
  grade_status text not null default 'pending' check (grade_status in ('pending','running','done','failed','skipped')),
  grade_attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  unique (provider, provider_call_id)
);
create index calls_started_at_idx on calls (started_at desc);
create index calls_phone_started_idx on calls (caller_phone, started_at desc);
create index calls_grade_queue_idx on calls (grade_status, grade_attempts) where grade_status in ('pending','failed');

create table assessments (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls(id) on delete cascade,
  version int not null default 1,
  is_current boolean not null default true,
  grading jsonb not null,
  decision text not null check (decision in ('QUALIFIED','QUALIFIED_WITH_NOTES','NURTURE','NOT_QUALIFIED','ESCALATION','INCOMPLETE')),
  decision_reasons jsonb not null default '[]'::jsonb,
  decline_reason text,
  priority int not null default 0 check (priority between 0 and 100),
  priority_reasons jsonb not null default '[]'::jsonb,
  override jsonb,                       -- {decision, reason, by, at}
  model text not null,
  prompt_version text not null,
  rubric_version text not null,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  unique (call_id, version)
);
create unique index assessments_one_current on assessments (call_id) where is_current;
create index assessments_decision_idx on assessments (decision) where is_current;

-- Every override is logged; this is future eval data.
create table overrides (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  call_id uuid not null references calls(id) on delete cascade,
  from_decision text not null,
  to_decision text not null,
  reason text not null check (length(reason) >= 5),
  by_email text,
  created_at timestamptz not null default now()
);

create table handoffs (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references calls(id) on delete cascade,
  designer_name text not null,
  designer_email text not null,
  cc jsonb not null default '[]'::jsonb,
  subject text not null,
  body_text text not null,
  body_html text not null,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sent','failed','bounced')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index handoffs_unacked_idx on handoffs (sent_at) where acknowledged_at is null;

-- One summary email per call, to settings.call_report_email.
create table call_reports (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references calls(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body_text text not null,
  body_html text not null,
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sent','failed','bounced')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index call_reports_pending_idx on call_reports (created_at) where status in ('queued','failed');

create table escalations (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls(id) on delete cascade,
  kind text not null check (kind in ('existing_client','callback','service_recovery','area_review')),
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  unique (call_id, kind)
);
create index escalations_open_idx on escalations (created_at) where status = 'open';

create table cost_events (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete set null,
  provider text not null check (provider in ('vaani','gemini','email')),
  units numeric not null,
  unit text not null,
  amount_inr numeric(12,4) not null,
  at timestamptz not null default now()
);
create index cost_events_at_idx on cost_events (at desc);

-- Webhook idempotency ledger: Vaani retries up to 5×; the same event is processed once.
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  idempotency_key text not null unique,
  received_at timestamptz not null default now(),
  payload jsonb not null
);

create table settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into settings (id, data) values (1, '{}'::jsonb) on conflict do nothing;
