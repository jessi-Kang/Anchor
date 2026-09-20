import { withUser } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/server";

/**
 * 첫 로그인 시 `users` 행을 만든다(이미 있으면 갱신). 모든 사용자 테이블의 FK 뿌리.
 * RLS: users 의 INSERT 정책은 `id = app.current_user_id()` 만 허용한다.
 */
export async function ensureUser(u: SessionUser) {
  return withUser(u.id, async (tx) => {
    const { rows } = await tx.query<{ id: string; created_at: string; onboarded_at: string | null }>(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, last_seen_at = now()
       RETURNING id, created_at, onboarded_at`,
      [u.id, u.email, u.name ?? null],
    );
    return rows[0];
  });
}
