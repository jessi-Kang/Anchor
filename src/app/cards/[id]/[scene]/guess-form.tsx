"use client";

import { useState, useTransition } from "react";
import { Grow, Button, uiStyles as s } from "@/components/ui";
import { submitGuess } from "../actions";

/** Scene3 추측 입력. 빈 채로 "확인"을 누르면 건너뛴 것으로 기록되고 정답으로 간다. */
export function GuessForm({ cardId, initial }: { cardId: string; initial: string }) {
  const [guess, setGuess] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <>
      <input
        id="guess"
        className={s.guess}
        type="text"
        value={guess}
        onChange={(e) => setGuess(e.target.value)}
        placeholder="떠오르는 대로"
        autoComplete="off"
        enterKeyHint="done"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !pending) start(() => submitGuess(cardId, guess));
        }}
      />
      <Grow />
      <Button disabled={pending} onClick={() => start(() => submitGuess(cardId, guess))}>
        {pending ? "보는 중" : "확인"}
      </Button>
    </>
  );
}
