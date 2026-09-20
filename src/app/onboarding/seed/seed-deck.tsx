"use client";

import { useEffect, useMemo, useState } from "react";
import type { SeedNode } from "@/lib/db/onboarding";
import { Card, Space, Status, Pill, Grow, ButtonRow, Button, Ghost, uiStyles as s } from "@/components/ui";
import { judgeSeed, finishSeed } from "./actions";

/**
 * O04 씨앗 카드. 순서: 단어 보기 → 뜻 떠올리기 → 탭해서 뒤집기(정의 보기) → 떠올랐어 / 안 떠올랐어.
 * 정답을 본 뒤에 판정하므로 "아는가?"가 아니라 "떠올렸는가?"를 기록한다.
 *
 * 유실 방지: 판정은 먼저 localStorage 아웃박스에 쓰고 서버로 보낸다. 실패하면 남겨 두고 다음 기회에 재전송.
 */

const OUTBOX_KEY = "anchor.outbox.seed";
type Judgement = { nodeId: string; recalled: boolean; at: number };

function readOutbox(): Judgement[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]") as Judgement[];
  } catch {
    return [];
  }
}
function writeOutbox(items: Judgement[]) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* 저장 불가 브라우저: 메모리로만 진행 */
  }
}

export function SeedDeck({
  deck,
  judged: initialJudged,
  preview = false,
}: {
  deck: SeedNode[];
  judged: Record<string, boolean>;
  /** 디자인 미리보기: 참고 화면처럼 판정 버튼을 켜진 상태로 그린다 (실제로는 뒤집기 전엔 비활성) */
  preview?: boolean;
}) {
  const [judged, setJudged] = useState(initialJudged);
  const [flipped, setFlipped] = useState(false);

  const remaining = useMemo(() => deck.filter((n) => !(n.id in judged)), [deck, judged]);
  const current = remaining[0];
  const doneCount = deck.length - remaining.length;
  const recalledCount = Object.values(judged).filter(Boolean).length;

  // 아웃박스 재전송 (마운트 시 + 판정마다)
  const flush = async () => {
    const box = readOutbox();
    if (box.length === 0) return;
    const left: Judgement[] = [];
    for (const j of box) {
      try {
        await judgeSeed(j.nodeId, j.recalled);
      } catch {
        left.push(j);
      }
    }
    writeOutbox(left);
  };
  useEffect(() => {
    void flush();
  }, []);

  const judge = (recalled: boolean) => {
    if (!current) return;
    setJudged((j) => ({ ...j, [current.id]: recalled }));
    setFlipped(false);
    writeOutbox([...readOutbox(), { nodeId: current.id, recalled, at: Date.now() }]);
    void flush();
  };

  const finish = async () => {
    await flush();
    if (readOutbox().length > 0) return; // 아직 못 보낸 판정이 있으면 끝내지 않는다
    await finishSeed();
  };

  if (!current) {
    return (
      <>
        <Card>
          <div className={s.flip}>
            <div className={s.flipWord}>끝</div>
            <div className={s.flipHint}>{deck.length}장 다 봤어</div>
          </div>
        </Card>
        <Space h={12} />
        <Status right={<Pill on>그래프에 심는 중</Pill>}>
          {doneCount} / {deck.length} · 떠오름 {recalledCount}
        </Status>
        <Grow />
        <Button onClick={finish}>시작할래</Button>
      </>
    );
  }

  return (
    <>
      <Card style={{ padding: 20 }}>
        <div
          className={s.flip}
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          onClick={() => setFlipped(true)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setFlipped(true)}
        >
          <div className={s.flipWord} lang="en">
            {current.display}
          </div>
          {flipped ? (
            <>
              <div className={s.flipDef} lang="en">
                {current.definition}
              </div>
              <div className={s.flipExample} lang="en">
                {current.example}
              </div>
            </>
          ) : (
            <div className={s.flipHint}>떠올렸으면 탭해서 뒤집기</div>
          )}
        </div>
      </Card>
      <Space h={12} />
      <Status right={<Pill on>그래프에 심는 중</Pill>}>
        {doneCount + 1} / {deck.length} · 떠오름 {recalledCount}
      </Status>
      <Grow />
      <ButtonRow>
        <Button outline disabled={!flipped && !preview} onClick={() => judge(false)}>
          안 떠올랐어
        </Button>
        <Button disabled={!flipped && !preview} onClick={() => judge(true)}>
          떠올랐어
        </Button>
      </ButtonRow>
      <Ghost onClick={finish}>여기까지, 시작할래</Ghost>
    </>
  );
}
