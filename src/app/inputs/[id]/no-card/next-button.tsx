"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { startCard } from "../actions";

/**
 * F04a 주 버튼 "다음 글자". **다시 시도 버튼이 아니다** — 방금 못 만든 그 글자는 다시 눌러도
 * 더 잘될 까닭이 없어서, 이 버튼은 그 자료의 **다음 후보**를 연다. 영어 축(F17a)이 "다시 해 볼게"
 * 인 것과 갈리는 기준은 축이 아니라 **다시 해서 얻을 게 있나**다 (design/SCREENS.md).
 *
 * 누르는 동안의 말은 F03 주 버튼과 같은 "카드 만드는 중" 이다. 같은 일을 하는 같은 버튼이라
 * 새 말을 만들지 않는다. 그 글자도 못 만들면 이 화면으로 다시 오되 주소에 하나가 더 붙는다.
 */
export function NextKanjiButton({
  inputId,
  kanji,
  failed,
  preview,
}: {
  inputId: string;
  kanji: string;
  failed: string[];
  preview: boolean;
}) {
  const [pending, start] = useTransition();
  const [starting, setStarting] = useState(false);
  return (
    <Button
      disabled={starting || pending}
      onClick={() => {
        if (preview) return;
        setStarting(true);
        start(() => startCard(inputId, kanji, failed));
      }}
    >
      {starting ? "카드 만드는 중" : "다음 글자"}
    </Button>
  );
}
