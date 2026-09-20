"use client";

import { useTransition } from "react";
import { Button, Ghost } from "@/components/ui";
import { finishCard } from "../actions";

/** Scene5 의 두 길: 말하기(주) / 다음 한자로(보조). 둘 다 착지 + 한자 켜기. */
export function LandingButtons({ cardId }: { cardId: string }) {
  const [pending, start] = useTransition();
  return (
    <>
      <Button disabled={pending} onClick={() => start(() => finishCard(cardId, "speak"))}>
        소리 내서 말해보기
      </Button>
      <Ghost onClick={() => !pending && start(() => finishCard(cardId, "graph"))}>다음 한자로</Ghost>
    </>
  );
}
