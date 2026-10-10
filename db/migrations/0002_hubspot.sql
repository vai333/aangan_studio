-- HubSpot mirror: one row per call, so a retry never creates a second contact, note or deal.
create table hubspot_syncs (
  call_id uuid primary key references calls(id) on delete cascade,
  contact_id text,
  deal_id text,
  note_id text,
  portal_id text,
  last_decision text,
  status text not null default 'failed' check (status in ('synced','skipped','failed')),
  attempts int not null default 0,
  last_error text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hubspot_syncs_retry_idx on hubspot_syncs (status, attempts) where status = 'failed';
