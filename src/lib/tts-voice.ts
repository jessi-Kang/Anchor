/**
 * 들려줄 "목표 발음" 음성이 있는가, 그리고 어느 목소리로 낼 것인가. **서버에서만 부른다**
 * (환경 변수를 읽는다).
 *
 * 한 곳에 두는 이유: `/api/tts` 가 204 를 주는 조건과, 화면이 "아직 견줄 소리가 없어" 를 띄우는
 * 조건이 **같아야 한다.** 두 곳에 따로 적으면 한쪽만 고쳐져서 화면이 곡선을 기다리는데 소리는
 * 안 오거나, 반대로 소리는 오는데 화면이 없다고 말하는 상태가 된다.
 *
 * **Jessi 목소리 클론도 목표 발음으로 센다.** 전에는 "그건 원어민이 아니다" 며 빼 놨는데 그 이유가
 * 틀렸다. 겹치는 둘은 "내 목소리 vs 내 목소리" 가 아니라 **"내가 낸 소리" vs "그 말이 제대로
 * 발음됐을 때의 소리"** 다 — 음색은 같고 높낮이가 다르다. 그리고 음색이 같은 것이 이 클론을 만든
 * 이유다(`CLAUDE.md` 스택: "목표 발음을 「내 목소리 버전」으로 들려줘 **음색 차이 제거**").
 * 음역이 한 옥타브 어긋난 목소리로는 두 곡선을 겹쳐 놔도 읽을 수가 없다. 임시방편이 아니라 설계다.
 *
 * 언어별 목소리가 있으면 그쪽이 먼저다. 없으면 클론으로 떨어진다. 둘 다 없으면 소리를 주지 않는다.
 */
export function targetVoiceId(lang: "ja" | "en"): string | undefined {
  if (!process.env.ELEVENLABS_API_KEY) return undefined;
  const perLang = lang === "en" ? process.env.ELEVENLABS_VOICE_ID_EN : process.env.ELEVENLABS_VOICE_ID_JA;
  return perLang || process.env.ELEVENLABS_VOICE_ID_JESSI || undefined;
}

/** 이 언어로 들려줄 목표 발음이 있는가. 없으면 화면이 그렇게 말한다. */
export function hasTargetVoice(lang: "ja" | "en"): boolean {
  return Boolean(targetVoiceId(lang));
}
