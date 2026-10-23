-- Local accounts for email + password sign-in (ADR 0009). Passwords are stored only as scrypt hashes.

create table users (
  id               bigserial primary key,
  email            text not null,
  password_hash    text not null,
  role             text not null check (role in ('member', 'viewer')),
  disabled         boolean not null default false,
  failed_attempts  integer not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now(),
  last_login_at    timestamptz
);
create unique index users_email_idx on users (lower(email));
