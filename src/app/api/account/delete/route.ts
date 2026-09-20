import { auth, requireUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/account/delete  body: { confirm: "삭제" }
 *
 * 1. 삭제 원장에 기록 (백업 복구 시 이 사용자를 다시 지우는 근거)
 * 2. users 행 삭제 → 모든 테이블 CASCADE
 * 3. Neon Auth 계정 삭제
 *
 * 복구 불가. 백업 파일 안의 사본은 BACKUP_RETENTION_DAYS 후 함께 사라진다 (docs/BACKUP.md).
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    return res as Response;
  }

  const body = (await req.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "삭제") {
    return Response.json({ error: "confirm 필드에 '삭제' 를 보내야 한다" }, { status: 400 });
  }

  await withUser(user.id, async (tx) => {
    await tx.query(
      `INSERT INTO account_deletions (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET requested_at = now()`,
      [user.id],
    );
    await tx.query("DELETE FROM users WHERE id = $1", [user.id]);
  });

  const { error } = await auth.deleteUser();
  if (error) {
    // DB 는 이미 지워졌다. 인증 계정만 남은 상태를 로그로 남기고 성공으로 응답하지 않는다.
    console.error("account delete: auth.deleteUser failed", { userId: user.id, error });
    return Response.json(
      { error: "데이터는 삭제됐지만 로그인 계정 삭제에 실패했다. 다시 시도해 달라." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, deleted_at: new Date().toISOString() });
}
