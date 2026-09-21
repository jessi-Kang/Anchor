import { list, del } from "@vercel/blob";

/**
 * 음성 원본(Blob) 삭제. CLAUDE.md 데이터 원칙 둘이 여기에 걸려 있다:
 * "원본은 일정 기간 뒤 삭제", "계정 삭제 시 백업 사본까지 삭제".
 *
 * **DB CASCADE 는 스토리지를 지우지 않는다.** `users` 행을 지우면 `recordings` 행이 함께 사라지고
 * `audio_object_key` 도 같이 사라진다. 키가 사라지면 어떤 오브젝트를 지울지 영영 알 수 없다.
 * 그래서 순서가 규칙이다: **스토리지를 먼저 지우고 DB 를 나중에.** 지우지 못했으면 성공으로 응답하지 않는다.
 *
 * 키는 `voice/<user_id>/<card_id>-<시각>.webm` 이라 계정 하나가 접두사 하나로 끝난다.
 * card_id 는 /api/recordings 가 DB 로 주인을 확인한 값만 쓰므로 접두사를 벗어나지 않는다.
 */

export function voicePrefix(userId: string): string {
  return `voice/${userId}/`;
}

/**
 * 한 계정의 음성 원본을 전부 지운다. 지운 개수를 돌려주고, 실패하면 던진다.
 *
 * **던질 때도 몇 개가 이미 사라졌는지는 알려야 한다.** 여러 쪽에 걸쳐 지우므로 중간에 실패하면
 * 앞쪽 오브젝트는 이미 없다. 돌려주는 값으로만 알리면 그 수가 예외와 함께 사라지고, 부르는 쪽은
 * "하나도 안 지워졌다" 와 "절반 지워졌다" 를 구별하지 못한 채 사용자에게 말하게 된다.
 * 그래서 한 쪽을 지울 때마다 `onRemoved` 로 알린다 — 세는 일은 부르는 쪽이 한다.
 */
export async function deleteVoiceObjects(
  userId: string,
  token: string,
  onRemoved?: (n: number) => void,
): Promise<number> {
  let cursor: string | undefined;
  let removed = 0;
  do {
    const page = await list({ prefix: voicePrefix(userId), token, cursor });
    if (page.blobs.length) {
      await del(
        page.blobs.map((b) => b.url),
        { token },
      );
      removed += page.blobs.length;
      onRemoved?.(page.blobs.length);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return removed;
}

/** 오브젝트 하나 삭제. 지워졌는지만 돌려준다 (크론이 실패한 건을 다음 번에 다시 집게). */
export async function deleteVoiceObject(key: string, token: string): Promise<boolean> {
  try {
    await del(key, { token });
    return true;
  } catch (e) {
    console.error("[voice] 오브젝트 삭제 실패", { key, e });
    return false;
  }
}
