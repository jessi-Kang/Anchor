"use client";

import { useTransition } from "react";
import { PitchLoop } from "@/components/pitch-loop";
import type { PitchPoint } from "@/lib/db/recordings";
import { finishSpeak } from "../actions";

/**
 * F10 말하기. 루프 자체는 F14(대화 덩어리)와 같아서 PitchLoop 이 한다.
 * 여기서 정하는 것 둘: 녹음이 어디에 매달리는가(이 카드), 이탈 한 줄이 어디로 가는가(F11 그래프).
 *
 * `nativeVoice` 는 **일부러 안 넘긴다.** 넘길 자리는 뚫려 있지만(`loadSpeakLoop` 이 같이 풀어 준다),
 * 일본어 음성이 없을 때 뜨는 한 줄이 덩어리가 아니라 한자 단어에도 맞는 말인지는 문구라서
 * 기획이 정한다. 답이 오면 여기 한 줄을 더하면 켜진다.
 */
export function SpeakLoop({
  cardId,
  text,
  preview,
  startAttempt,
  startPrev,
}: {
  cardId: string;
  text: string;
  preview: boolean;
  startAttempt: number;
  startPrev: PitchPoint[] | null;
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
      doneLabel="됐어, 다음"
      firstNote="먼저 듣고, 그대로 따라 말해봐."
      onDone={(spoke) => start(() => finishSpeak(cardId, spoke))}
    />
  );
}
