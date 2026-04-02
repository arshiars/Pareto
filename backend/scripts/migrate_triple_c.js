import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const sql = `
-- ─── Triple-C Schema ─────────────────────────────────────────────────────────

create table if not exists qs_projects (
  id                    uuid primary key default gen_random_uuid(),

  -- Project identity
  name                  text not null,
  address               text,
  city                  text,
  province              text,
  project_type          text,           -- 'condo' | 'rental' | 'mixed-use' | 'commercial'

  -- Project scale
  gfa_sqft              numeric,        -- gross floor area (above grade)
  units                 integer,
  storeys               integer,

  -- Report metadata
  report_number         integer,
  report_date           date,
  qs_firm               text,
  source_file           text,           -- S3 key

  -- Top-level budget (from Section 1.2 / Appendix B)
  land_cost             numeric default 0,
  construction_cost     numeric default 0,  -- all 16 divisions + CM fee + contingency
  municipal_charges     numeric default 0,
  soft_costs            numeric default 0,
  financing_cost        numeric default 0,
  development_contingency numeric default 0,
  total_budget          numeric default 0,

  created_at            timestamptz default now()
);

-- ─── Division totals (one row per division per project) ──────────────────────

create table if not exists qs_divisions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references qs_projects(id) on delete cascade,

  division_number integer not null,   -- 1–16 (+ 17=CM Fee, 18=Contingency)
  division_name   text    not null,
  budget_amount   numeric default 0,

  created_at      timestamptz default now(),

  unique (project_id, division_number)
);

-- ─── Line items (one row per line per division) ───────────────────────────────

create table if not exists qs_line_items (
  id            uuid primary key default gen_random_uuid(),
  division_id   uuid not null references qs_divisions(id) on delete cascade,

  description   text    not null,
  budget_amount numeric default 0,
  sort_order    integer default 0,

  created_at    timestamptz default now()
);

-- ─── Indexes for common queries ───────────────────────────────────────────────

create index if not exists idx_qs_divisions_project_id    on qs_divisions(project_id);
create index if not exists idx_qs_line_items_division_id  on qs_line_items(division_id);
create index if not exists idx_qs_projects_project_type   on qs_projects(project_type);
create index if not exists idx_qs_projects_report_date    on qs_projects(report_date);
`

console.log('Running Triple-C migration...')

const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: { message: 'rpc not available' } }))

if (error) {
  // Fallback: split and run each statement individually via the REST API
  // Supabase doesn't expose raw SQL execution via the JS client directly,
  // so we use the pg REST approach through individual table operations.
  // Instead, output the SQL for manual execution.
  console.log('\n─────────────────────────────────────────────────────')
  console.log('Supabase does not support raw SQL via JS client.')
  console.log('Please run the following SQL in your Supabase SQL editor:')
  console.log('https://supabase.com/dashboard/project/_/sql/new')
  console.log('─────────────────────────────────────────────────────\n')
  console.log(sql)
} else {
  console.log('Migration complete.')
}
