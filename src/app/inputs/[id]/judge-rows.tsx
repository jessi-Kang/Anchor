"use client";

import { useState, useTransition } from "react";
import { Card, Label, Row, Ja, Choice, ChoiceRow, Space, Grow, Button, Title, Lead, Note } from "@/components/ui";
import { judge, startCard } from "./actions";
import type { JudgeItem } from "@/lib/cards/judge-items";

/**
 * F03 (design/screens/F03.html · F03a.html): 제목 "모르는 한자 N개", 두 묶음 + 한자 행마다 알아/몰라 선택 칩, 주 버튼 "協부터".
 * "알아"로 표시한 한자는 카드 큐에서 빠져 "아는 것" 묶음으로 내려가고 제목의 개수가 줄어든다 (F03a).
 * 판정은 즉시 화면에 반영하고 서버에 보낸다. 주 버튼은 큐의 첫 한자(아는 소리 묶음 먼저)로 간다.
 */
export function JudgeRows({
  inputId,
  anchored,
  bare,
  seen,
  found,
}: {
  inputId: string;
  anchored: JudgeItem[];
  bare: JudgeItem[];
  /** 자료에서 뽑아낸 한자 수 */
  seen: number;
  /** 그중 우리가 아는 한자 수 */
  found: number;
}) {
  const [known, setKnown] = useState<Record<string, boolean | null>>(() =>
    Object.fromEntries([...anchored, ...bare].map((i) => [i.nodeId, i.known])),
  );
  const [pending, start] = useTransition();
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState(false);

  const isKnown = (i: JudgeItem) => known[i.nodeId] === true;
  const queueA = anchored.filter((i) => !isKnown(i));
  const queueB = bare.filter((i) => !isKnown(i));
  const knownItems = [...anchored, ...bare].filter(isKnown);
  // 주 버튼이 가리킬 글자. **소리가 없으면 카드가 못 서므로 내밀지 않는다** — 규칙은
  // `nextKanji` 와 같은 한 줄이다 (lib/cards/judge-items.ts). 행은 그대로 선다: 판정은 발판 없이도 된다.
  const first = queueA.find((i) => i.hasSound) ?? queueB.find((i) => i.hasSound) ?? null;
  const unknownCount = queueA.length + queueB.length;

  /*
    **한 화면에 들어갈 만큼만 줄로 내고 나머지는 개수로 접는다** (docs/FLOW.md 1′장 F03).

    자료 한 편의 한자는 스물이 넘는다. 다 세우면 둘째 묶음도 주 버튼도 첫 화면 밖으로 밀리고,
    **비어서 안 보이는 것과 밀려서 안 보이는 것은 사용자에게 같은 일이다.** 2026-09-21 에
    Jessi 가 프로덕션에서 여기 갇혔다 — 여섯 줄짜리 화면에서 「協부터」가 아래에 있었다.

    **이 수는 재서 나왔고, 임시다.** `pnpm design:fold` 로 360×650(= Jessi 의 폰에서 실제로
    보이는 창, `scripts/design/frame.ts`)에서 주 버튼 아래끝을 재면 이렇다:

        6줄 ▼63px 밖   4줄 ▼63px 밖   3줄 ▼42px 밖   2줄 보임(여유 24)

    **두 줄밖에 안 선다.** 행 하나가 94px 이고 창이 650px 인데, 제목·머리줄·묶음 제목 둘·주 버튼이
    먼저 자리를 먹는다. 두 줄이면 묶음마다 한 줄씩이라 **구조는 보이지만**(그게 이 화면의 조건이다)
    자료 스무 자 중 둘이다.

    **그게 이 화면을 뽑기에서 맛보기로 바꾸는지는 여기서 정할 일이 아니다.** 막힌 것을 먼저 풀고
    (Jessi 가 프로덕션에서 갇혀 있었다) 수는 PM·기획과 같이 정한다. 고칠 길이 셋이고 셋 다 근간이다:
    행을 줄일 것인가 · 화면을 나눌 것인가 · 두 줄짜리 화면으로 둘 것인가.

    **줄 수를 잇달아 치게 하는 것이 목적이 아니다.** 여기서 다 판정하지 않아도 된다: 알아로 고른
    것은 큐에서 빠지고 몰라·미표시는 남으며 다음 카드는 그래프가 정한다(커리큘럼 없음).
    스무 줄을 잇달아 알아/몰라로 치게 하면 그 자체가 레벨 테스트의 모양이 된다.
  */
  const BUDGET = 2;

  /**
   * 묶음마다 몇 줄을 낼지. **빈 묶음이 아닌 것에 한 줄씩 먼저 주고** 남는 것을 큰 묶음부터 붓는다 —
   * 「두 묶음이 한 화면에 같이 보인다」가 이 화면의 조건이라, 한 묶음이 예산을 다 먹으면 안 된다.
   * 묶음 순서는 안 바꾼다(시작점은 늘 이미 아는 것, 원칙 2).
   */
  const budget = (sizes: number[]): number[] => {
    const take: number[] = sizes.map((n) => (n > 0 ? 1 : 0));
    let left = BUDGET - take.reduce((a, b) => a + b, 0);
    while (left > 0) {
      // 남은 자리가 가장 많은 묶음에 한 줄씩. 다 차면 그만둔다.
      let best = -1;
      for (let i = 0; i < sizes.length; i++)
        if (sizes[i] - take[i] > 0 && (best < 0 || sizes[i] - take[i] > sizes[best] - take[best])) best = i;
      if (best < 0) break;
      take[best] += 1;
      left -= 1;
    }
    return take;
  };

  const [takeA, takeB, takeK] = budget([queueA.length, queueB.length, knownItems.length]);
  const showA = open ? queueA : queueA.slice(0, takeA);
  const showB = open ? queueB : queueB.slice(0, takeB);
  const showK = open ? knownItems : knownItems.slice(0, takeK);
  const folded = queueA.length + queueB.length + knownItems.length - (showA.length + showB.length + showK.length);

  const set = (nodeId: string, v: boolean) => {
    setKnown((k) => ({ ...k, [nodeId]: v }));
    start(() => judge(nodeId, v));
  };

  const row = (i: JudgeItem) => (
    <Row
      key={i.nodeId}
      title={<Ja>{i.kanji}</Ja>}
      // 없으면 아예 안 낸다. "아직 아는 소리가 없음" 은 거짓이었다 — 소리는 거의 다 있고
      // 없는 것은 낱말이다. 그리고 묶음 제목이 이미 한 말을 행이 되풀이하지 않는다 (docs/FLOW.md 1장).
      sub={i.sub ?? undefined}
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
      {/*
        **"한자가 없다" 와 "우리가 그 한자를 모른다" 는 다른 말이다.**

        전에는 우리가 아는 한자가 0이면 무조건 "이 자료엔 한자가 없어" 라고 했다. 한자가 열아홉인
        기사에도 그렇게 말하고 "다른 자료를 넣어 봐" 로 돌려보냈다. **사용자의 자료를 두고 사실이
        아닌 말을 한 자리**였고, 비어 있던 것은 자료가 아니라 우리 쪽 행이었다.

        주어는 사용자가 아니라 앱이다 — 아래 "부를 낱말이 아직 없어" 묶음과 같은 규칙이다.
        자료를 탓하지 않고 못 하는 쪽을 우리로 둔다.
      */}
      {/*
        위 간격이 여기 있다. 부르는 쪽(`page.tsx`)이 미리보기와 실제 화면 두 군데서 따로 넣고
        있었는데, 같은 화면이라 두 값이 갈릴 자리였다. 24 는 참고에서 읽은 값이다
        (`design/screens/F03.html` 의 `height: 24px` — 24 · 6 · 18 · 10 넷이 이 화면의 세로 간격 전부다).
      */}
      <Space h={24} />
      <Title>
        {seen === 0
          ? "이 자료엔 한자가 없어"
          : found === 0
            ? "아직 카드로 못 만들어"
            : unknownCount > 0
              ? `모르는 한자 ${unknownCount}개`
              : found < seen
                ? // **주어가 갈린다 — 물은 건 우리고 아는 건 사용자다.** `다 아는 한자야` 는
                  // "이 자료의 한자를 네가 다 안다" 로 읽히는데, 실제로 일어난 일은 "우리가 낼 수
                  // 있는 걸 다 냈고 그걸 네가 다 안다" 다. 안 보이는 글자가 남은 채로 「다」라고
                  // 말하면 바로 아래 "그 밖에 N자" 가 그 말을 뒤집는다 — 머리줄을 가른 것과
                  // 같은 자리다 (PM 판정). 참고 F03a 에는 이 상태 그림이 아예 없다.
                  "물어본 건 다 알아"
                : "다 아는 한자야"}
      </Title>
      <Space h={6} />
      <Lead>
        {/*
          못 낸 쪽이 둘(자료에 한자가 없다 · 우리가 그 한자를 모른다)이지만 지금 할 수 있는 일은
          같다. **언제 되는지는 약속하지 않는다** — 못 지킬 약속이 이 표를 다시 여는 길이다.
        */}
        {seen === 0
          ? "다른 자료를 넣어 봐."
          : found === 0
            ? // **개수가 여기 있는 이유.** 우리가 그 글자들을 **봤다는 것**이 이 화면에서 가장
              // 중요한 사실이다 — 못 본 척하면 "한자가 없어" 로 되돌아간다. 제목은 짧게 한 줄로
              // 두고(F04a 와 같은 결) 개수는 이 줄이 진다.
              `한자 ${seen}개를 봤어. 다른 자료를 넣어 봐.`
          : unknownCount > 0
            ? // 묶음 제목이 이미 축과 순서를 말하므로 이 줄은 **묶음이 안 하는 일**(무엇을 하면 되는지)만
              // 한다. 옛 문구 "아는 소리로 시작할 수 있는 것부터" 는 가르는 축이 소리였을 때의 말이라
              // 지금은 틀린 데다 묶음 제목과 같은 말을 두 번 했다 (docs/FLOW.md 1장 F03 행).
              "하나씩 알아 / 몰라만 골라."
            : found < seen
              ? // **아래 줄이 바로 반박할 말을 안 한다.** "여기서 새로 배울 건 없어" 밑에
                // "그 밖에 4자는 아직 카드로 못 만들어" 가 서면 한 화면이 제 말을 뒤집는다.
                // 안 보이는 글자가 남아 있는 한 **배울 게 없다고 말할 자격이 우리한테 없다** —
                // 못 만든 쪽은 우리고, 그건 사용자가 다 안다는 뜻이 아니다 (PM 판정).
                "다른 자료를 넣어 봐."
              : "여기서 새로 배울 건 없어. 다른 자료를 넣어 봐."}
      </Lead>
      <Space h={18} />
      {queueA.length > 0 && (
        <Card group>
          {/* 가르는 축은 낱말이라 "아는 소리에서 시작" 이 아니다 — 소리는 양쪽 다 있다 */}
          <Label>아는 낱말에서 시작</Label>
          {showA.map(row)}
        </Card>
      )}
      {queueA.length > 0 && queueB.length > 0 && <Space h={10} />}
      {queueB.length > 0 && (
        <Card group>
          {/* "발판" 은 우리끼리 쓰는 말이라 화면에 안 쓴다. 그리고 주어는 사용자가 아니라 앱이다 —
              그 소리를 모르는 게 아니라, 그 글자를 부를 낱말을 우리가 아직 못 골랐다. */}
          <Label>부를 낱말이 아직 없어</Label>
          {showB.map(row)}
        </Card>
      )}
      {knownItems.length > 0 && (
        <>
          {unknownCount > 0 && <Space h={10} />}
          <Card group>
            <Label>아는 것</Label>
            {showK.map(row)}
          </Card>
        </>
      )}
      {/*
        **안 보이는 것을 셈에 넣는 한 줄** (design/screens/F03d.html). 자료에서 한자를 열아홉 뽑았는데
        우리 표에 둘만 있으면 나머지 열일곱이 **말없이 빠진다** — 제목은 `모르는 한자 2개` 라고만 한다.

        **`N` 은 「카드로 못 만드는 글자 수」가 아니라 「행으로 안 선 글자 수」다.** 갈리는 축은
        `judgeItems` 의 `found`(= 우리 표에 노드가 있나)이고, `extractKanji` 가 중복을 지우므로
        **글자 종류 수**다. 소리가 없어 카드가 못 서는 글자(`枠`)는 **행으로는 서니까 여기 안 센다** —
        이 줄의 일은 안 보이는 것을 세는 것이지 카드 가능 여부를 세는 게 아니다. 그걸 섞으면
        보이는 것을 두 번 센다.

        **묶음 수와 무관하다.** 조건은 `found > 0 && found < seen` 하나뿐이다 — 다 "알아" 로 내리면
        두 묶음이 사라지고 제목이 "다 아는 한자야" 가 되는데, **열일곱이 안 보이는 그 화면에서
        그 말이 가장 큰 거짓말**이라 그때도 이 줄이 서야 한다.

        "다른 자료를 넣어 봐" 는 안 붙인다. 넣을 자료가 잘못된 게 아니다 (PM 판정).
      */}
      {/*
        **펴는 길.** 접은 것은 개수로 말하고 펴는 길을 둔다 (docs/FLOW.md 1′장 F03).
        숨기는 것이 아니라 접는 것이라, 한 탭이면 전부 선다 — 그 뒤로는 스크롤이 정상이다.

        **아래 "그 밖에 N자" 와 다른 줄이다.** 저쪽은 **우리 표에 없어서 행조차 못 만든** 글자를 세고,
        이쪽은 **행은 있는데 첫 화면에 안 낸** 글자를 센다. 같은 「그 밖에」로 부르면 두 수가 한 화면에
        나란히 서서 어느 쪽이 무엇인지 알 길이 없어진다.
      */}
      {folded > 0 && (
        <>
          <Space h={10} />
          <Card group>
            <Row title={`나머지 ${folded}자`} onClick={() => setOpen(true)} />
          </Card>
        </>
      )}
      {found > 0 && found < seen && (
        <>
          <Space h={14} />
          <Note>그 밖에 {seen - found}자는 아직 카드로 못 만들어</Note>
        </>
      )}
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
