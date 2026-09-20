"use client";

import { useTransition } from "react";
import { Space, Button, uiStyles as s } from "@/components/ui";
import { submitMissed } from "./actions";
import { useDraft } from "@/lib/use-draft";

/**
 * F13 입력. 한국어 한 줄 하나 + 주 버튼 하나. 주 버튼은 F17(추측)로 간다 — 영어는 그 다음 화면이 준다.
 * 빈 칸이 F13, 쓴 뒤가 F13a 다 (design/screens). 빈 줄이면 주 버튼이 꺼져 있고,
 * 그동안 여기서 나가는 길은 위 라벨(홈)뿐이다.
 */
export function MissedForm({ preview }: { preview: boolean }) {
  const draft = useDraft("missed");
  const line = draft.value;
  const [pending, start] = useTransition();

  return (
    <>
      <input
        className={s.guess}
        type="text"
        value={line}
        onChange={(e) => draft.set(e.target.value)}
        placeholder="이건 다음 스프린트로 미루죠"
        autoComplete="off"
        aria-label="못 한 말"
      />
      <Space h={12} />
      <Button disabled={pending || line.trim().length === 0} onClick={() => {
          if (preview) return;
          // 보내는 순간 지운다. 안 지우면 보낸 뒤에도 남아 다음에 열 때 옛 글이 뜬다.
          draft.clear();
          start(() => submitMissed(line));
        }}>
        내가 먼저 해 볼게
      </Button>
    </>
  );
}
