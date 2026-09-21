import { auth, requireUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";
import { deleteVoiceObjects, voicePrefix } from "@/lib/voice-storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/account/delete  body: { confirm: "삭제" }
 *
 * 0. 음성 키가 전부 이 계정 접두사 안에 있는지 확인 (아니면 아무것도 안 지우고 멈춘다)
 * 1. **음성 원본(Blob) 삭제 — DB 보다 먼저.**
 * 2. 삭제 원장에 기록 (백업 복구 시 이 사용자를 다시 지우는 근거)
 * 3. users 행 삭제 → 모든 테이블 CASCADE (**지워진 행 수를 확인한다**)
 * 4. Neon Auth 계정 삭제
 *
 * 3 이 목록이 아니라 CASCADE 인 것은 목록 표류를 구조적으로 없애기 때문이다. 대신 **가정이
 * 하나 생긴다** — 사용자 행을 가진 표가 전부 `users` 까지 이어져 있다는 것. 그 가정은 주석이
 * 아니라 `pnpm test:db` 가 붙든다 (`src/lib/db/delete-paths.ts`).
 *
 * **1 을 지난 뒤로는 되돌아갈 수 없다.** 그 뒤 어느 단계에서 멈추든 음성 원본은 이미 사라졌고
 * DB 를 되돌려도 안 돌아온다. 그래서 1 이 지운 개수를 끝까지 들고 다니며 **멈출 때 그걸 같이
 * 말한다** — "데이터는 그대로 있다" 는 하나도 안 지웠을 때만 참이다.
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
  /*
    **접두사 하나가 계정 하나를 덮는다는 가정을 여기서 확인한다.** `deleteVoiceObjects` 는
    `voice/<user_id>/` 를 훑을 뿐 DB 에 적힌 키를 보지 않는다. 그 접두사를 벗어난 키가 하나라도
    있으면 오브젝트는 스토리지에 남고, **그것을 가리키던 유일한 표식인 DB 행은 바로 뒤에서 지워진다.**
    그 뒤로는 무엇을 지워야 하는지 알 길이 영영 없다 — 오류도 없이, 응답은 "지웠다" 다.

    키를 만드는 자리는 `/api/recordings` 한 곳이지만 실제로 저장되는 값은 우리가 만든 키가 아니라
    **스토리지가 돌려준 `blob.pathname`** 이다. 둘이 갈라질 수 있는 한 가정으로 두지 않는다.
    걸리면 아무것도 안 지우고 멈춘다 — 이 라우트가 음성 원본에 대해 이미 지키는 순서와 같은 이유다.
  */
  const stray = await withUser(user.id, async (tx) => {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM recordings
        WHERE user_id = $1 AND audio_object_key IS NOT NULL AND NOT starts_with(audio_object_key, $2)`,
      [user.id, voicePrefix(user.id)],
    );
    return Number(rows[0]?.n ?? 0);
  });
  if (stray > 0) {
    console.error("[account delete] 접두사 밖 음성 키", { userId: user.id, stray, prefix: voicePrefix(user.id) });
    return Response.json({ error: "음성 원본 일부를 찾지 못해 삭제를 멈췄다. 관리자에게 알려 달라." }, { status: 500 });
  }

  /*
    **이 수는 블록 밖에 있어야 한다.** 여기서부터 뒤로는 실패하더라도 **음성 원본은 이미 사라진
    뒤다.** 그 상태에서 "데이터는 그대로 있다" 고 말하면 사용자는 아무 일도 없었다고 믿고 나가고,
    **자기 녹음이 전부 소리가 안 나는 계정을 갖게 된다. 그 말을 아무도 안 해 준 채로.**
    되돌릴 수 없는 일이 이미 일어났으면 그걸 일어났다고 말하는 것이 이 수가 하는 일이다.
    (순서 자체는 그대로 둔다 — 키가 먼저 사라지면 오브젝트를 영영 못 지운다.)
  */
  let removed = 0;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      await deleteVoiceObjects(user.id, token, (n) => (removed += n));
      if (removed) console.log("[account delete] 음성 원본 삭제", { userId: user.id, removed });
    } catch (e) {
      // 여러 쪽에 걸쳐 지우므로 중간에 실패하면 앞쪽은 이미 없다. 몇 개가 사라졌는지 같이 말한다.
      console.error("[account delete] 음성 원본 삭제 실패", { userId: user.id, removed, e });
      return Response.json(
        {
          error:
            removed > 0
              ? `음성 원본 ${removed}개를 지운 뒤 나머지에서 멈췄다. 계정과 학습 기록은 그대로다. 다시 시도해 달라.`
              : "음성 원본을 지우지 못해 삭제를 멈췄다. 다시 시도해 달라.",
          voice_removed: removed,
        },
        { status: 502 },
      );
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

  const deleted = await withUser(user.id, async (tx) => {
    // 원장은 앱에게 INSERT 전용이다(0001). 여기서 ON CONFLICT 를 쓰면 42501 로 막힌다.
    // PG16 에서 갈라 확인한 결과(보안 세션도 같은 결과):
    //   ON CONFLICT (user_id) DO UPDATE → permission denied  (INSERT·UPDATE·SELECT 를 다 요구)
    //   ON CONFLICT (user_id) DO NOTHING → permission denied  (충돌 대상을 추론하느라 SELECT 가 필요)
    //   ON CONFLICT DO NOTHING           → 통과              (대상을 안 적으면 SELECT 가 필요 없다)
    // 마지막 형태는 권한상 쓸 수 있지만 쓰지 않는다: 대상 없는 DO NOTHING 은 **어떤** 제약 위반이든
    // 말없이 삼킨다. 나중에 원장에 제약이 하나 더 생기면 삭제가 조용히 아무것도 안 하고 성공처럼 끝난다.
    // 지우는 경로에서 조용한 실패는 최악이다. 그래서 그냥 INSERT 하고 23505(기본키 충돌)만 좁게 받는다.
    // 같은 id 로 다시 요청해 이미 행이 있으면 처음 요청 시각을 그대로 둔다 — 백업 사본이 사라지는
    // 시점의 기준 시각은 데이터가 처음 사라진 때다.
    // SAVEPOINT 로 감싸는 이유: 한 트랜잭션 안에서 오류가 나면 뒤 문장이 전부 막힌다(current transaction
    // is aborted). 원장 INSERT 와 users DELETE 가 같은 트랜잭션이어야 한다는 전제(docs/SECURITY.md C3)는
    // 그대로 지키면서 실패한 INSERT 만 되돌린다.
    await tx.query("SAVEPOINT ledger");
    try {
      await tx.query("INSERT INTO account_deletions (user_id) VALUES ($1)", [user.id]);
      await tx.query("RELEASE SAVEPOINT ledger");
    } catch (e) {
      await tx.query("ROLLBACK TO SAVEPOINT ledger");
      if ((e as { code?: string })?.code !== "23505") throw e;
    }
    /*
      **지워진 행 수를 본다.** 권한이 빠지면 `permission denied` 로 터지지만, RLS 정책이 DELETE 를
      안 덮으면 **`DELETE 0` 에 오류가 없다**(PG16 에서 정책만 좁혀 확인). 그대로 두면 이 라우트가
      `{ ok: true }` 를 돌려주고 뒤이어 `auth.deleteUser()` 가 로그인까지 지운다 — 사용자는 다
      지웠다고 믿는데 전부 남아 있고 **다시 들어와 지울 길도 없다.**
      여기서 던지면 withUser 가 트랜잭션을 되돌려 원장 행도 남지 않는다.
    */
    const gone = await tx.query("DELETE FROM users WHERE id = $1", [user.id]);
    if (gone.rowCount !== 1) throw new Error(`users 행이 지워지지 않았다 (rowCount=${gone.rowCount})`);
    return true;
  }).catch((e) => {
    // "아무것도 안 지웠다" 고 적지 않는다 — 음성 원본은 이미 지워졌을 수 있고, 그 수를 같이 남긴다.
    console.error("[account delete] DB 삭제 실패", { userId: user.id, voiceRemoved: removed, e });
    return false;
  });
  if (!deleted) {
    /*
      **여기서 "데이터는 그대로 있다" 는 `removed === 0` 일 때만 참이다.** 위 훑기가 끝까지 갔으면
      이 계정의 음성 원본은 전부 사라졌다 — DB 를 되돌려도 그건 안 돌아온다.

      돌아오지 않는 것을 DB 가 계속 가리키게 두지도 않는다. 훑기가 끝났으니 이 계정 키는 전부
      없는 오브젝트를 가리키고, 그 상태로 두면 표가 "오디오가 있다" 고 말한다 —
      크론이 이미 같은 짝을 지킨다(`/api/cron/voice`: 오브젝트를 지운 것만 키를 뗀다).
      이건 되돌리기가 아니라 **표를 사실에 맞추는 것**이라 실패해도 로그만 남기고 넘어간다.
    */
    if (removed > 0) {
      await withUser(user.id, (tx) =>
        tx.query(
          "UPDATE recordings SET audio_object_key = NULL, audio_expires_at = NULL WHERE user_id = $1 AND audio_object_key IS NOT NULL",
          [user.id],
        ),
      ).catch((e) => console.error("[account delete] 사라진 원본의 키를 떼지 못했다", { userId: user.id, e }));
    }
    return Response.json(
      {
        error:
          removed > 0
            ? `삭제하지 못했다. 다만 음성 원본 ${removed}개는 이미 지워졌고 돌아오지 않는다. 계정과 학습 기록은 그대로다. 다시 시도해 달라.`
            : "삭제하지 못했다. 데이터는 그대로 있다. 다시 시도해 달라.",
        voice_removed: removed,
      },
      { status: 500 },
    );
  }

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
