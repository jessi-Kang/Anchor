/**
 * 그 언어의 "원어민" 음성이 있는가. **서버에서만 부른다** (환경 변수를 읽는다).
 *
 * 한 곳에 두는 이유: `/api/tts` 가 204 를 주는 조건과, F14 가 "아직 견줄 원어민 소리가 없어" 를
 * 띄우는 조건이 **같아야 한다.** 두 곳에 따로 적으면 한쪽만 고쳐져서 화면이 곡선을 기다리는데
 * 소리는 안 오거나, 반대로 소리는 오는데 화면이 없다고 말하는 상태가 된다.
 *
 * Jessi 목소리 클론(`voice=mine`)은 여기 안 센다. 그건 "내 목소리 버전"이지 원어민이 아니다 —
 * 그걸로 대신 떨어지면 화면이 내 목소리를 "원어민" 이라고 부르게 된다(`/api/tts` 주석).
 *
 * 값이 채워지면 **코드를 고치지 않아도** 그 순간부터 true 가 된다.
 */
export function hasNativeVoice(lang: "ja" | "en"): boolean {
  const voice = lang === "en" ? process.env.ELEVENLABS_VOICE_ID_EN : process.env.ELEVENLABS_VOICE_ID_JA;
  return Boolean(process.env.ELEVENLABS_API_KEY && voice);
}
