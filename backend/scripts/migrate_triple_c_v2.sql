-- ─── Triple-C Schema v2 ──────────────────────────────────────────────────────
-- Run this in: https://supabase.com/dashboard/project/mdborjnavqcinrjnqqsw/sql/new

-- Add separate fee columns to qs_projects
alter table qs_projects
  add column if not exists construction_mgmt_fee  numeric default 0,
  add column if not exists development_mgmt_fee   numeric default 0,
  add column if not exists construction_contingency numeric default 0;

-- ─── Project milestones (timeline) ───────────────────────────────────────────
create table if not exists qs_milestones (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references qs_projects(id) on delete cascade,

  milestone_name  text not null,       -- e.g. 'Construction Start', 'Initial Occupancy'
  previous_date   date,                -- date from prior report
  report_date     date,                -- date in this report
  status          text,                -- 'Achieved' | 'Pending' | 'On Schedule' | 'Delayed'
  sort_order      integer default 0,

  created_at      timestamptz default now()
);

create index if not exists idx_qs_milestones_project_id on qs_milestones(project_id);
