"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { retryEnglish } from "@/app/talk/actions";

/**
 * F17a 주 버튼 "다시 해 볼게". **여기서는 다시 하는 것이 앞으로 가는 유일한 길이다** — 그 덩어리를
 * 얻는 길이 이것뿐이라 주 버튼이 된다. 한자 축(F04a)은 "다음 글자" 라는 다른 길이 있어 다시 시도를
 * 아예 안 낸다. 축이 달라서가 아니라 **다시 해서 얻을 게 있나**로 갈린다 (design/SCREENS.md).
 *
 * 추측은 안 보낸다. 다시 누르는 것은 **새 추측이 아니라 문장을 다시 만드는 것**이다.
 */
export function RetryButton({ chunkId, preview }: { chunkId: string; preview: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => {
        if (preview) return;
        start(() => retryEnglish(chunkId));
      }}
    >
      다시 해 볼게
    </Button>
  );
}
