-- NightQA metadata. Evidence files (video, screenshots, traces, specs) stay on disk; rows keep relative paths.

create table projects (
  id          text primary key,
  name        text not null,
  target_url  text not null default '',
  created_at  timestamptz not null default now()
);
insert into projects (id, name) values ('default', 'My app');

create table runs (
  id            text primary key,                       -- ULID, also the results/<id> folder name
  project_id    text not null default 'default' references projects (id),
  flow_name     text not null,
  flow_file     text not null default '',
  mode          text not null check (mode in ('run', 'replay', 'explore')),
  status        text not null check (status in ('queued', 'running', 'finished', 'crashed')),
  verdict       text,
  url           text not null default '',
  started_by    text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  heartbeat_at  timestamptz not null default now(),     -- a running run with an old heartbeat has crashed
  cost_usd      numeric(10, 4) not null default 0,
  result        jsonb,                                  -- RunResult + RunMeta, as result.json holds today
  actions       jsonb
);
create index runs_project_started_idx on runs (project_id, started_at desc);
create index runs_status_idx on runs (status) where status in ('queued', 'running');

create table run_events (
  id      bigserial primary key,
  run_id  text not null references runs (id) on delete cascade,
  at      timestamptz not null default now(),
  level   text not null default 'info',
  event   text not null,
  data    jsonb not null default '{}'::jsonb
);
create index run_events_run_idx on run_events (run_id, id);

create table bugs (
  run_id        text not null references runs (id) on delete cascade,
  bug_id        text not null,
  project_id    text not null default 'default' references projects (id),
  severity      text,
  status        text,
  close_reason  text,
  record        jsonb not null,                         -- the full bug.json
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (run_id, bug_id)
);
create index bugs_project_idx on bugs (project_id, updated_at desc);

create table coverage_pages (
  project_id  text not null default 'default' references projects (id),
  path        text not null,
  first_seen  timestamptz not null,
  last_seen   timestamptz not null,
  visits      integer not null default 0,
  primary key (project_id, path)
);

create table fix_requests (
  night   date not null,
  bug_id  text not null,
  primary key (night, bug_id)
);

create table audit_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  actor   text not null,
  action  text not null,
  detail  text not null default ''
);
create index audit_log_at_idx on audit_log (at desc);

create table deliveries (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  channel  text not null,
  ok       boolean not null,
  detail   jsonb not null default '{}'::jsonb
);
create index deliveries_at_idx on deliveries (at desc);
