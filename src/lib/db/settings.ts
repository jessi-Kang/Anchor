import { withUser } from "@/lib/db";

/**
 * 사용자 설정 (users.settings, jsonb). 수준을 묻지 않는다. 기록하는 것은 전부 "켠 언어"와 "행동"이다.
 *  - languages[lang] = { enabled_at }  키가 있으면 켠 언어. 순서는 enabled_at (사용자가 고른 순서).
 *  - kana: 가나 6개 읽기 결과 (O03, 일본어 첫 카드 직전 1회). status 가 판단 결과:
 *      passed   마이크가 기준 이상 인식 → 다시 묻지 않는다
 *      recheck  미지원·거부·기준 미달 → 카드는 열되 "다음에 다시 확인" (자기 보고로 통과시키지 않음)
 *      locked   "못 읽겠어" → 가나 모듈(v2) 예고, 한자 카드 잠금
 * 준비 단계(상황·씨앗·단계 상태)는 2026-09-20 폐기 (docs/FLOW.md 5장). 마이그레이션 0005 가 옛 키를 지운다.
 * settings 는 jsonb 라 `||` 가 얕은 병합이다. languages 안쪽을 고칠 때는 아래 헬퍼만 쓴다.
 */

export type Lang3 = "en" | "ja" | "es";
export type LangState = { enabled_at: string };
export type KanaStatus = "passed" | "recheck" | "locked";
export type KanaResult = {
  status: KanaStatus;
  recognized: number;
  total: number;
  supported: boolean;
  checked_at: string;
};

export type UserSettings = {
  languages?: Partial<Record<Lang3, LangState>>;
  kana?: KanaResult;
};

export async function getSettings(userId: string): Promise<{ settings: UserSettings; onboarded_at: string | null }> {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query<{ settings: UserSettings; onboarded_at: string | null }>(
      "SELECT settings, onboarded_at FROM users WHERE id = $1",
      [userId],
    );
    return rows[0] ?? { settings: {}, onboarded_at: null };
  });
}

/**
 * 언어 켜기. 이미 켠 언어는 그대로(순서 보존), 새 언어만 enabled_at 을 찍는다.
 * 여러 개를 한 번에 켜면 고른 순서대로 1ms 씩 뒤로 찍어 "언어 순서 = 고른 순서"가 되게 한다.
 */
export function enableLanguages(userId: string, langs: Lang3[]) {
  if (langs.length === 0) return Promise.resolve();
  const base = Date.now();
  const add: Record<string, LangState> = {};
  langs.forEach((l, i) => {
    add[l] = { enabled_at: new Date(base + i).toISOString() };
  });
  return withUser(userId, async (tx) => {
    await tx.query(
      `UPDATE users
       SET settings = settings || jsonb_build_object('languages', $2::jsonb || coalesce(settings->'languages', '{}'::jsonb)),
           onboarded_at = coalesce(onboarded_at, now())
       WHERE id = $1`,
      [userId, JSON.stringify(add)],
    );
  });
}

/** 언어 끄기 (설정). 자료·카드는 남고 홈에서 안 보일 뿐이다. 다시 켜면 같은 자리에서 이어진다. */
export function disableLanguage(userId: string, lang: Lang3) {
  return withUser(userId, async (tx) => {
    await tx.query(
      `UPDATE users
       SET settings = settings || jsonb_build_object('languages', coalesce(settings->'languages', '{}'::jsonb) - $2::text)
       WHERE id = $1`,
      [userId, lang],
    );
  });
}

/** 가나 읽기 결과 저장. 한 번 확인한 뒤 어떻게 할지는 src/lib/kana.ts 의 kanaGate 가 정한다. */
export function saveKanaResult(userId: string, kana: KanaResult) {
  return withUser(userId, async (tx) => {
    await tx.query("UPDATE users SET settings = settings || jsonb_build_object('kana', $2::jsonb) WHERE id = $1", [
      userId,
      JSON.stringify(kana),
    ]);
  });
}
