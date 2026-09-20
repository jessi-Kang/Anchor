"use client";

import { useRouter } from "next/navigation";
import { PitchLoop } from "@/components/pitch-loop";
import type { PitchPoint } from "@/lib/db/recordings";

/**
 * F14 음성 루프. 루프 자체는 F10(한자 카드)과 같아서 PitchLoop 이 한다.
 * 여기서 정하는 것 둘: 녹음이 이 덩어리에 매달린다는 것, 이탈 한 줄이 홈으로 간다는 것.
 * "됐어" 뒤는 F15(하루 끝)다 (docs/FLOW.md 1′장 F14 행). 그 화면이 생기기 전까지 홈으로 보내던 임시 처리였다.
 */
export function TalkLoop({
  chunkId,
  text,
  preview,
  startAttempt,
  nativeVoice,
  startPrev,
}: {
  chunkId: string;
  text: string;
  preview: boolean;
  startAttempt: number;
  nativeVoice: boolean;
  startPrev: PitchPoint[] | null;
}) {
  const router = useRouter();
  return (
    <PitchLoop
      target={{ chunk: chunkId }}
      text={text}
      lang="en"
      preview={preview}
      startAttempt={startAttempt}
      nativeVoice={nativeVoice}
      startPrev={startPrev}
      doneLabel="됐어"
      firstNote="먼저 듣고, 그대로 따라 말해봐."
      onDone={() => {
        router.push("/today/done");
        router.refresh();
      }}
    />
  );
}
