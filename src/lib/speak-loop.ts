import { countRecordings, lastPitch, type PitchPoint } from "@/lib/db/recordings";
import { hasTargetVoice } from "@/lib/tts-voice";

/**
 * 말하기 루프(`PitchLoop`)가 서버에서 받아야 하는 것을 **한 군데에서** 푼다.
 *
 * 왜 한 군데인가: 한자 카드(F10)와 대화 덩어리(F14)가 같은 루프를 쓰는데, "화면이 무엇을 필요로
 * 하는지" 는 두 서버 페이지가 각자 정하고 있었다. 그래서 F14 에 마지막 곡선을 읽어 주는 고침이
 * 들어간 뒤에도 **F10 은 회차만 읽고 곡선은 두고 와서**, 다시 열면 "나, 3회차" 라고 써 놓고
 * 곡선이 하나도 없었다. 같은 결함을 형제 화면에서 또 낸 것이다.
 *
 * 화면마다 다른 것은 둘뿐이다 — 녹음이 매달리는 대상(`{card}` / `{chunk}`)과 듣기 음성의 언어.
 * 나머지는 여기서 같이 푼다. 세 번째 화면이 붙어도 이 함수를 부르면 빠뜨릴 자리가 없다.
 *
 * 서버에서만 부른다 (DB 와 환경 변수를 읽는다).
 */
export type SpeakLoopData = {
  /** 이미 쌓인 녹음 수. 범례의 시작 회차 — 화면을 다시 열어도 0 부터 세지 않는다. */
  startAttempt: number;
  /** 마지막 회차의 곡선. 범례가 말하는 그 회차의 곡선이다. */
  startPrev: PitchPoint[] | null;
  /** 이 언어로 들려줄 목표 발음이 있는가. 없으면 화면이 그렇게 말한다. */
  targetVoice: boolean;
};

export async function loadSpeakLoop(
  userId: string,
  target: { card: string } | { chunk: string },
  lang: "ja" | "en",
): Promise<SpeakLoopData> {
  const [startAttempt, startPrev] = await Promise.all([countRecordings(userId, target), lastPitch(userId, target)]);
  return { startAttempt, startPrev, targetVoice: hasTargetVoice(lang) };
}
