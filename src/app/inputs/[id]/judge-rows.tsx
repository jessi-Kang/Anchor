"use client";

import { useState, useTransition } from "react";
import { Card, Label, Row, Ja, Choice, ChoiceRow, Space, Grow, Button, Ghost } from "@/components/ui";
import { judge, startCard } from "./actions";

export type JudgeItem = {
  nodeId: string;
  kanji: string;
  /** "협력의 협" 또는 null(발판 없음) */
  anchor: string | null;
  known: boolean | null;
};

/**
 * F03 두 묶음 + 한자마다 알아/몰라 + 주 버튼 "協부터".
 * 판정은 즉시 화면에 반영하고 서버에 보낸다. 실패해도 화면은 유지(다음 탭에서 다시 보냄).
 * 주 버튼은 "몰라(또는 아직 판정 안 함)"인 첫 한자로 간다: 아는 소리 묶음 먼저.
 */
export function JudgeRows({ inputId, anchored, bare }: { inputId: string; anchored: JudgeItem[]; bare: JudgeItem[] }) {
  const [known, setKnown] = useState<Record<string, boolean | null>>(() =>
    Object.fromEntries([...anchored, ...bare].map((i) => [i.nodeId, i.known])),
  );
  const [pending, start] = useTransition();
  const [starting, setStarting] = useState(false);

  const first = [...anchored, ...bare].find((i) => known[i.nodeId] !== true) ?? null;
  const unknownCount = [...anchored, ...bare].filter((i) => known[i.nodeId] !== true).length;

  const set = (nodeId: string, v: boolean) => {
    setKnown((k) => ({ ...k, [nodeId]: v }));
    start(() => judge(nodeId, v));
  };

  const row = (i: JudgeItem, firstHere: boolean) => (
    <Row
      key={i.nodeId}
      title={<Ja>{i.kanji}</Ja>}
      sub={(i.anchor ?? "아직 아는 소리가 없음") + (firstHere ? " · 먼저" : "")}
      right={
        <ChoiceRow>
          <Choice on={known[i.nodeId] === true} onClick={() => set(i.nodeId, true)}>
            알아
          </Choice>
          <Choice on={known[i.nodeId] === false} onClick={() => set(i.nodeId, false)}>
            몰라
          </Choice>
        </ChoiceRow>
      }
    />
  );

  return (
    <>
      {anchored.length > 0 && (
        <Card>
          <Label>아는 소리에서 시작</Label>
          {anchored.map((i) => row(i, first?.nodeId === i.nodeId))}
        </Card>
      )}
      {anchored.length > 0 && bare.length > 0 && <Space h={12} />}
      {bare.length > 0 && (
        <Card>
          <Label>발판 없음</Label>
          {bare.map((i) => row(i, first?.nodeId === i.nodeId))}
        </Card>
      )}
      <Space h={12} />
      <Grow />
      {first ? (
        <Button
          disabled={starting || pending}
          onClick={() => {
            setStarting(true);
            start(() => startCard(inputId, first.kanji));
          }}
        >
          {starting ? "카드 만드는 중" : `${first.kanji}부터`}
        </Button>
      ) : (
        <Button href="/today">{unknownCount === 0 ? "다 아는 글자야, 홈으로" : "홈으로"}</Button>
      )}
      <Ghost href="/inputs/new?lang=ja">다른 자료 넣기</Ghost>
    </>
  );
}
