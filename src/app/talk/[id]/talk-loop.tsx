"use client";

import { useRouter } from "next/navigation";
import { PitchLoop } from "@/components/pitch-loop";

/**
 * F14 음성 루프. 루프 자체는 F10(한자 카드)과 같아서 PitchLoop 이 한다.
 * 여기서 정하는 것 둘: 녹음이 이 덩어리에 매달린다는 것, 이탈 한 줄이 홈으로 간다는 것.
 * 참고 화면은 "됐어" 뒤를 F15(하루 끝)로 두지만 그 화면은 아직 없어서 홈으로 보낸다.
 */
export function TalkLoop({ chunkId, text, preview }: { chunkId: string; text: string; preview: boolean }) {
  const router = useRouter();
  return (
    <PitchLoop
      target={{ chunk: chunkId }}
      text={text}
      lang="en"
      preview={preview}
      doneLabel="됐어"
      firstNote="먼저 듣고, 그대로 따라 말해봐."
      onDone={() => {
        router.push("/today");
        router.refresh();
      }}
    />
  );
}
