"use client";

import { useTransition } from "react";
import { Button, Ghost } from "@/components/ui";
import { startCard } from "@/app/inputs/[id]/actions";

/**
 * F11 의 두 길: 다음 카드(주) / 자료로 돌아가기(보조).
 *
 * 다음 카드가 없을 때 가는 곳은 부르는 쪽이 정한다. **하루 끝(F15)으로 가는 길이 여기뿐이기
 * 때문이다** — 하루 끝은 상태가 아니라 순간이라 홈이 거기로 보내지 않는다 (docs/FLOW.md 4장).
 * 오늘 볼 카드가 하나도 안 남았으면 여기가 그 "마지막 카드를 착지한 자리" 다.
 */
export function NextCard({
  inputId,
  next,
  backLabel,
  done,
}: {
  inputId: string | null;
  next: string | null;
  backLabel: string;
  /** 다음 카드가 없을 때 갈 곳 — 오늘 것이 다 끝났으면 하루 끝, 아니면 홈 */
  done: { href: string; label: string };
}) {
  const [pending, start] = useTransition();
  if (!inputId) return <Button href={done.href}>{done.label}</Button>;
  return (
    <>
      {next ? (
        <Button disabled={pending} onClick={() => start(() => startCard(inputId, next))}>
          {pending ? "카드 만드는 중" : `다음 카드 ${next}`}
        </Button>
      ) : (
        <Button href={done.href}>{done.label}</Button>
      )}
      <Ghost href={`/inputs/${inputId}`}>{backLabel}</Ghost>
    </>
  );
}
