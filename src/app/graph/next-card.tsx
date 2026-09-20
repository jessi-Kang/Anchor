"use client";

import { useTransition } from "react";
import { Button, Ghost } from "@/components/ui";
import { startCard } from "@/app/inputs/[id]/actions";

/** F11 의 두 길: 다음 카드(주) / 자료로 돌아가기(보조) */
export function NextCard({ inputId, next, backLabel }: { inputId: string | null; next: string | null; backLabel: string }) {
  const [pending, start] = useTransition();
  if (!inputId) return <Button href="/today">홈으로</Button>;
  return (
    <>
      {next ? (
        <Button disabled={pending} onClick={() => start(() => startCard(inputId, next))}>
          {pending ? "카드 만드는 중" : `다음 카드 ${next}`}
        </Button>
      ) : (
        <Button href="/today">홈으로</Button>
      )}
      <Ghost href={`/inputs/${inputId}`}>{backLabel}</Ghost>
    </>
  );
}
