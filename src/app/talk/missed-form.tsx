"use client";

import { useState, useTransition } from "react";
import { Space, Button, uiStyles as s } from "@/components/ui";
import { submitMissed } from "./actions";

/**
 * F13 입력. 한국어 한 줄 하나 + 주 버튼 하나.
 * 빈 칸이 F13, 쓴 뒤가 F13a 다 (design/screens). 빈 줄이면 주 버튼이 꺼져 있고,
 * 그동안 여기서 나가는 길은 위 라벨(홈)뿐이다.
 */
export function MissedForm({ preview }: { preview: boolean }) {
  const [line, setLine] = useState("");
  const [pending, start] = useTransition();

  return (
    <>
      <input
        className={s.guess}
        type="text"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        placeholder="이건 다음 스프린트로 미루죠"
        autoComplete="off"
        aria-label="못 한 말"
      />
      <Space h={12} />
      <Button disabled={pending || line.trim().length === 0} onClick={() => !preview && start(() => submitMissed(line))}>
        {pending ? "영어로 옮기는 중" : "영어로 어떻게 말하지"}
      </Button>
    </>
  );
}
