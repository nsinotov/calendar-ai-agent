import type { DatabaseSync } from "node:sqlite";

export type UserRole = "admin" | "user";

export interface User {
  id: number;
  role: UserRole;
}

export interface UserStore {
  get(userId: number): User | null;
  list(): User[];
  listAdmins(): User[];
  upsert(userId: number, role: UserRole): void;
}

interface UserRow {
  telegram_user_id: number;
  role: UserRole;
}

function toUser(row: UserRow): User {
  return { id: row.telegram_user_id, role: row.role };
}

export class SqliteUserStore implements UserStore {
  constructor(private readonly db: DatabaseSync) {}

  get(userId: number): User | null {
    const row = this.db
      .prepare("SELECT telegram_user_id, role FROM users WHERE telegram_user_id = ?")
      .get(userId) as UserRow | undefined;

    return row ? toUser(row) : null;
  }

  list(): User[] {
    const rows = this.db
      .prepare("SELECT telegram_user_id, role FROM users ORDER BY telegram_user_id")
      .all() as unknown as UserRow[];

    return rows.map(toUser);
  }

  listAdmins(): User[] {
    return this.list().filter((user) => user.role === "admin");
  }

  upsert(userId: number, role: UserRole): void {
    this.db
      .prepare(
        `INSERT INTO users (telegram_user_id, role, created_at) VALUES (?, ?, ?)
         ON CONFLICT (telegram_user_id) DO UPDATE SET role = excluded.role`,
      )
      .run(userId, role, Date.now());
  }
}

