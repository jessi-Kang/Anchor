"use client";

import { useTransition } from "react";
import { Grow, Button, uiStyles as s } from "@/components/ui";
import { submitGuess } from "../actions";
import { useDraft } from "@/lib/use-draft";

/** Scene3 추측 입력. 빈 채로 "확인"을 누르면 건너뛴 것으로 기록되고 정답으로 간다. */
export function GuessForm({ cardId, initial }: { cardId: string; initial: string }) {
  // 카드마다 따로 남긴다. 이미 보낸 추측(initial)이 있으면 그게 이긴다 — 서버에 남은 것이
  // 이 기기의 초안보다 세다.
  const draft = useDraft(`card:${cardId}`);
  const guess = initial || draft.value;
  const [pending, start] = useTransition();
  const send = () => {
    draft.clear();
    start(() => submitGuess(cardId, guess));
  };
  return (
    <>
      <input
        id="guess"
        className={s.guess}
        type="text"
        value={guess}
        onChange={(e) => draft.set(e.target.value)}
        placeholder="떠오르는 대로"
        autoComplete="off"
        enterKeyHint="done"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !pending) send();
        }}
      />
      <Grow />
      {/* 누르는 동안 글자를 바꾸지 않는다 — 주 버튼은 누른 뒤에도 같은 말이어야 한다. 꺼짐으로 충분하다. */}
      <Button disabled={pending} onClick={send}>
        확인
      </Button>
    </>
  );
}
