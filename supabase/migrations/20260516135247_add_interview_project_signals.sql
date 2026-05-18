create table interview_project_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  interview_id uuid not null references interviews(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  quoted_question text not null default '',
  quoted_lowlight text not null default '',
  suggestion text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ips_interview on interview_project_signals(interview_id);
create index idx_ips_project on interview_project_signals(project_id);
create index idx_ips_user on interview_project_signals(user_id);

alter table interview_project_signals enable row level security;

create policy "own rows select" on interview_project_signals
  for select using (auth.uid() = user_id);

create policy "own rows insert" on interview_project_signals
  for insert with check (auth.uid() = user_id);

create policy "own rows update" on interview_project_signals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows delete" on interview_project_signals
  for delete using (auth.uid() = user_id);
