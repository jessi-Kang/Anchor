"use client";

import { useState, useTransition } from "react";
import { Row, Pill } from "@/components/ui";
import { startCard } from "@/app/inputs/[id]/actions";

export type HomeRow = {
  id: string;
  title: string;
  sub: string;
  /** 남은 카드가 있으면 다음 한자. 탭하면 그 카드(F04)로 (docs/FLOW.md 1′장) */
  next: string | null;
};

/** 홈 자료 행. 남은 카드가 있으면 "이어서" 알약, 탭 → F04. 없으면 탭 → 뽑기(F03). */
export function HomeRows({ rows }: { rows: HomeRow[] }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <>
      {rows.map((r) =>
        r.next ? (
          <Row
            key={r.id}
            title={r.title}
            sub={r.sub}
            right={<Pill on>{busy === r.id ? "여는 중" : "이어서"}</Pill>}
            onClick={() => {
              if (pending) return;
              setBusy(r.id);
              start(() => startCard(r.id, r.next as string));
            }}
          />
        ) : (
          <Row key={r.id} href={`/inputs/${r.id}`} title={r.title} sub={r.sub} />
        ),
      )}
    </>
  );
}
