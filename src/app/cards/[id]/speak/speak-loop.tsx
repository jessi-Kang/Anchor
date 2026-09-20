"use client";

import { useTransition } from "react";
import { PitchLoop } from "@/components/pitch-loop";
import { finishSpeak } from "../actions";

/**
 * F10 말하기. 루프 자체는 F14(대화 덩어리)와 같아서 PitchLoop 이 한다.
 * 여기서 정하는 것 둘: 녹음이 어디에 매달리는가(이 카드), 이탈 한 줄이 어디로 가는가(F11 그래프).
 */
export function SpeakLoop({ cardId, text, preview, startAttempt }: { cardId: string; text: string; preview: boolean; startAttempt: number }) {
  const [, start] = useTransition();
  return (
    <PitchLoop
      target={{ card: cardId }}
      text={text}
      lang="ja"
      preview={preview}
      startAttempt={startAttempt}
      doneLabel="됐어, 다음"
      firstNote="먼저 듣고, 그대로 따라 말해봐."
      onDone={(spoke) => start(() => finishSpeak(cardId, spoke))}
    />
  );
}
