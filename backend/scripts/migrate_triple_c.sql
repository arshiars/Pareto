-- ─── Triple-C Schema ─────────────────────────────────────────────────────────
-- Run this in: https://supabase.com/dashboard/project/mdborjnavqcinrjnqqsw/sql/new

-- ─── Projects ────────────────────────────────────────────────────────────────

create table if not exists qs_projects (
  id                      uuid primary key default gen_random_uuid(),

  -- Project identity
  name                    text not null,
  address                 text,
  city                    text,
  province                text,
  project_type            text,           -- 'condo' | 'rental' | 'mixed-use' | 'commercial'

  -- Project scale
  gfa_sqft                numeric,        -- gross floor area (above grade, sqft)
  units                   integer,
  storeys                 integer,

  -- Report metadata
  report_number           integer,
  report_date             date,
  qs_firm                 text,
  source_file             text,           -- S3 key

  -- Top-level budget breakdown (from Section 1.2 / Appendix B)
  land_cost               numeric default 0,
  construction_cost       numeric default 0,  -- sum of all 16 divisions + CM fee + contingency
  municipal_charges       numeric default 0,
  soft_costs              numeric default 0,
  financing_cost          numeric default 0,
  development_contingency numeric default 0,
  total_budget            numeric default 0,

  created_at              timestamptz default now()
);

-- ─── Division totals (one row per division per project) ──────────────────────

create table if not exists qs_divisions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references qs_projects(id) on delete cascade,

  division_number integer not null,   -- 1–16 (17 = CM Fee, 18 = Contingency)
  division_name   text    not null,
  budget_amount   numeric default 0,

  created_at      timestamptz default now(),

  unique (project_id, division_number)
);

-- ─── Line items (one row per line item per division) ─────────────────────────

create table if not exists qs_line_items (
  id            uuid primary key default gen_random_uuid(),
  division_id   uuid not null references qs_divisions(id) on delete cascade,

  description   text    not null,
  budget_amount numeric default 0,
  sort_order    integer default 0,

  created_at    timestamptz default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_qs_divisions_project_id   on qs_divisions(project_id);
create index if not exists idx_qs_line_items_division_id on qs_line_items(division_id);
create index if not exists idx_qs_projects_type          on qs_projects(project_type);
create index if not exists idx_qs_projects_date          on qs_projects(report_date);
