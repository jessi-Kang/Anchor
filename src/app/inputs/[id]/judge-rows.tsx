"use client";

import { useState, useTransition } from "react";
import { Card, Label, Row, Ja, Choice, ChoiceRow, Space, Grow, Button, Title, Lead } from "@/components/ui";
import { judge, startCard } from "./actions";

export type JudgeItem = {
  nodeId: string;
  kanji: string;
  /** "협력의 협" 또는 null(발판 없음) */
  anchor: string | null;
  known: boolean | null;
};

/**
 * F03 (design/screens/F03.html · F03a.html): 제목 "모르는 한자 N개", 두 묶음 + 한자 행마다 알아/몰라 선택 칩, 주 버튼 "協부터".
 * "알아"로 표시한 한자는 카드 큐에서 빠져 "아는 것" 묶음으로 내려가고 제목의 개수가 줄어든다 (F03a).
 * 판정은 즉시 화면에 반영하고 서버에 보낸다. 주 버튼은 큐의 첫 한자(아는 소리 묶음 먼저)로 간다.
 */
export function JudgeRows({ inputId, anchored, bare, empty }: { inputId: string; anchored: JudgeItem[]; bare: JudgeItem[]; empty: boolean }) {
  const [known, setKnown] = useState<Record<string, boolean | null>>(() =>
    Object.fromEntries([...anchored, ...bare].map((i) => [i.nodeId, i.known])),
  );
  const [pending, start] = useTransition();
  const [starting, setStarting] = useState(false);

  const isKnown = (i: JudgeItem) => known[i.nodeId] === true;
  const queueA = anchored.filter((i) => !isKnown(i));
  const queueB = bare.filter((i) => !isKnown(i));
  const knownItems = [...anchored, ...bare].filter(isKnown);
  const first = queueA[0] ?? queueB[0] ?? null;
  const unknownCount = queueA.length + queueB.length;

  const set = (nodeId: string, v: boolean) => {
    setKnown((k) => ({ ...k, [nodeId]: v }));
    start(() => judge(nodeId, v));
  };

  const row = (i: JudgeItem) => (
    <Row
      key={i.nodeId}
      title={<Ja>{i.kanji}</Ja>}
      sub={i.anchor ?? "아직 아는 소리가 없음"}
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
      <Title lg>{empty ? "이 자료엔 한자가 없어" : unknownCount > 0 ? `모르는 한자 ${unknownCount}개` : "다 아는 한자야"}</Title>
      <Space h={6} />
      <Lead>
        {empty
          ? "다른 자료를 넣어 봐."
          : unknownCount > 0
            ? "아는 소리로 시작할 수 있는 것부터. 나머지는 나중에."
            : "여기서 새로 배울 건 없어. 다른 자료를 넣어 봐."}
      </Lead>
      <Space h={22} />
      {queueA.length > 0 && (
        <Card>
          <Label>아는 소리에서 시작</Label>
          {queueA.map(row)}
        </Card>
      )}
      {queueA.length > 0 && queueB.length > 0 && <Space h={12} />}
      {queueB.length > 0 && (
        <Card>
          <Label>발판 없음</Label>
          {queueB.map(row)}
        </Card>
      )}
      {knownItems.length > 0 && (
        <>
          {unknownCount > 0 && <Space h={12} />}
          <Card>
            <Label>아는 것</Label>
            {knownItems.map(row)}
          </Card>
        </>
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
        <Button href="/today">홈으로</Button>
      )}
    </>
  );
}
