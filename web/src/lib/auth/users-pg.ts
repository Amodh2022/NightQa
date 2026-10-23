import type pg from 'pg';
import type { Role } from './config';
import type { UserRow, UserStore } from './users';

interface Row {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  disabled: boolean;
  failed_attempts: number;
  locked_until: Date | null;
}

export class PgUserStore implements UserStore {
  constructor(private readonly pool: pg.Pool) {}

  async findByEmail(email: string): Promise<UserRow | undefined> {
    const { rows } = await this.pool.query<Row>('select id, email, password_hash, role, disabled, failed_attempts, locked_until from users where lower(email) = $1', [email]);
    const r = rows[0];
    return r ? { id: Number(r.id), email: r.email, passwordHash: r.password_hash, role: r.role, disabled: r.disabled, failedAttempts: r.failed_attempts, lockedUntil: r.locked_until } : undefined;
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>('select count(*) as n from users');
    return Number(rows[0]?.n ?? 0);
  }

  async create(email: string, passwordHash: string, role: Role): Promise<boolean> {
    const r = await this.pool.query('insert into users (email, password_hash, role) values ($1, $2, $3) on conflict do nothing', [email, passwordHash, role]);
    return (r.rowCount ?? 0) > 0;
  }

  async recordFailure(id: number, lockAfter: number, lockUntil: Date): Promise<void> {
    await this.pool.query(
      `update users set
         failed_attempts = case when failed_attempts + 1 >= $2 then 0 else failed_attempts + 1 end,
         locked_until = case when failed_attempts + 1 >= $2 then $3::timestamptz else locked_until end
       where id = $1`,
      [id, lockAfter, lockUntil],
    );
  }

  async recordSuccess(id: number): Promise<void> {
    await this.pool.query('update users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1', [id]);
  }
}
