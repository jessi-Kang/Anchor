"use client";

import { useState, useTransition } from "react";
import { Space, Button, uiStyles as s } from "@/components/ui";
import { submitGuess } from "@/app/talk/actions";

/**
 * F17 입력. 영어 한 줄 하나 + 주 버튼 하나. 빈 줄이면 주 버튼이 꺼져 있다 (docs/FLOW.md 1′장).
 *
 * **플레이스홀더에 영어 예시를 넣지 않는다.** 거기 한 줄 넣으면 그게 곧 힌트고, 추측할 이유가 사라진다
 * (design/SCREENS.md "추측 화면에는 답이 없다"). 무엇을 쓰는 칸인지만 말한다.
 */
export function GuessForm({ chunkId, preview }: { chunkId: string; preview: boolean }) {
  const [line, setLine] = useState("");
  const [pending, start] = useTransition();

  return (
    <>
      <input
        className={s.guess}
        type="text"
        lang="en"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        placeholder="영어로 한 줄"
        autoComplete="off"
        autoCapitalize="none"
        aria-label="영어 추측"
      />
      <Space h={12} />
      <Button disabled={pending || line.trim().length === 0} onClick={() => !preview && start(() => submitGuess(chunkId, line))}>
        {pending ? "영어로 옮기는 중" : "이제 확인"}
      </Button>
    </>
  );
}
