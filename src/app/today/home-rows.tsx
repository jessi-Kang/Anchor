"use client";

import { useTransition } from "react";
import { Row, Pill } from "@/components/ui";
import { startCard } from "@/app/inputs/[id]/actions";

export type HomeRow = {
  id: string;
  title: string;
  sub: string;
  /** 남은 카드가 있으면 다음 한자. 탭하면 그 카드(F04)로 (docs/FLOW.md 1′장) */
  next: string | null;
  /** 자료가 아닌 행(못 한 말 → F13)은 갈 곳을 직접 준다 */
  href?: string;
};

/** 홈 자료 행. 남은 카드가 있으면 "이어서" 알약, 탭 → F04. 없으면 탭 → 뽑기(F03). */
export function HomeRows({ rows }: { rows: HomeRow[] }) {
  const [pending, start] = useTransition();
  return (
    <>
      {rows.map((r) =>
        r.next ? (
          // 알약은 "이어서" 그대로 둔다. 카드를 만드는 동안 "여는 중" 으로 바꿨었는데, 알약 어휘는
          // 켜짐·꺼짐·이어서 셋뿐이고(docs/FLOW.md 4장) "여는 중" 은 그 밖이다. 두 번 눌리는 것은
          // 글자가 아니라 `pending` 이 막는다 — 알려 줄 것이 아니라 막을 것이었다.
          <Row
            key={r.id}
            title={r.title}
            sub={r.sub}
            right={<Pill on>이어서</Pill>}
            onClick={() => {
              if (pending) return;
              start(() => startCard(r.id, r.next as string));
            }}
          />
        ) : (
          <Row key={r.id} href={r.href ?? `/inputs/${r.id}`} title={r.title} sub={r.sub} />
        ),
      )}
    </>
  );
}
