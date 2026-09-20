import { auth, requireUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";
import { deleteVoiceObjects } from "@/lib/voice-storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/account/delete  body: { confirm: "삭제" }
 *
 * 1. **음성 원본(Blob) 삭제 — DB 보다 먼저.**
 * 2. 삭제 원장에 기록 (백업 복구 시 이 사용자를 다시 지우는 근거)
 * 3. users 행 삭제 → 모든 테이블 CASCADE
 * 4. Neon Auth 계정 삭제
 *
 * 1 이 2 보다 먼저인 이유: CASCADE 가 recordings 행을 지우면 audio_object_key 도 함께 사라진다.
 * 키가 사라진 뒤에는 어떤 오브젝트를 지워야 하는지 알 방법이 없어, 주인 없는 녹음이 스토리지에 영영 남는다.
 * 스토리지 삭제가 실패하면 DB 를 건드리지 않고 멈춘다 — 지웠다고 응답해 놓고 남기지 않는다.
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

  // 1. 음성 원본 먼저. 토큰이 없으면 남은 원본이 있는지부터 보고, 있으면 아무것도 지우지 않는다.
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      const removed = await deleteVoiceObjects(user.id, token);
      if (removed) console.log("[account delete] 음성 원본 삭제", { userId: user.id, removed });
    } catch (e) {
      console.error("[account delete] 음성 원본 삭제 실패, DB 는 건드리지 않는다", { userId: user.id, e });
      return Response.json({ error: "음성 원본을 지우지 못해 삭제를 멈췄다. 다시 시도해 달라." }, { status: 502 });
    }
  } else {
    const leftover = await withUser(user.id, async (tx) => {
      const { rows } = await tx.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM recordings WHERE user_id = $1 AND audio_object_key IS NOT NULL",
        [user.id],
      );
      return Number(rows[0]?.n ?? 0);
    });
    if (leftover > 0) {
      console.error("[account delete] BLOB_READ_WRITE_TOKEN 없음, 남은 원본", { userId: user.id, leftover });
      return Response.json({ error: "음성 원본을 지울 수 없어 삭제를 멈췄다. 관리자에게 알려 달라." }, { status: 503 });
    }
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
