"use client";

import { useTransition } from "react";
import { PitchLoop } from "@/components/pitch-loop";
import type { PitchPoint } from "@/lib/db/recordings";
import { finishSpeak } from "../actions";

/**
 * F10 말하기. 루프 자체는 F14(대화 덩어리)와 같아서 PitchLoop 이 한다.
 * 여기서 정하는 것 둘: 녹음이 어디에 매달리는가(이 카드), 이탈 한 줄이 어디로 가는가(F11 그래프).
 *
 * 겨눌 소리가 없을 때의 규칙은 **F14 와 같다** — 앞 회차가 그 자리를 대신하고, 있으면 앞 회차는
 * 안 겹친다. 여기 다시 적지 않고 `PitchLoop` 한 곳에 둔다 (docs/FLOW.md 도 F10 행이 F14 행을
 * 가리킨다). 두 화면이 같은 것을 각자 정하면 언젠가 갈라진다.
 */
export function SpeakLoop({
  cardId,
  text,
  preview,
  startAttempt,
  startPrev,
  targetVoice,
}: {
  cardId: string;
  text: string;
  preview: boolean;
  startAttempt: number;
  startPrev: PitchPoint[] | null;
  targetVoice: boolean;
}) {
  const [, start] = useTransition();
  return (
    <PitchLoop
      target={{ card: cardId }}
      text={text}
      lang="ja"
      preview={preview}
      startAttempt={startAttempt}
      startPrev={startPrev}
      targetVoice={targetVoice}
      doneLabel="됐어, 다음"
      firstNote="먼저 듣고, 그대로 따라 말해봐."
      onDone={(spoke) => start(() => finishSpeak(cardId, spoke))}
    />
  );
}
