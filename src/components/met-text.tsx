"use client";

import { Fragment, useState } from "react";
import { Ruby, Card, Label, Grow, Button, Space, uiStyles as s } from "@/components/ui";
import { kanjiRuns } from "@/lib/kanji/extract";

/**
 * 재만남(F12)의 자료 본문. **만난 한자의 읽기를 가린 채 시작하고, 탭하면 그 덩어리만 열린다.**
 *
 * 왜 가리는가: 재만남 인식률을 재려면 **"열어 보지 않고 읽었다" 는 사실이 생겨야 한다**
 * (`docs/MEASURE.md` 1장). 읽기를 그냥 보여 주면 그 사실 자체가 안 생기고, 한 번 보여 준 읽기는
 * 그 자료에서 다시 가릴 수 없다 — 읽는 자료마다 표본이 하나씩 사라진다.
 *
 * 가리는 것은 **틴트 붙은 덩어리뿐**이고 여는 단위도 덩어리다(`協力` 통째, 낱자로 안 쪼갠다).
 * 실제로 일어나는 사건이 "이 낱말을 못 읽었다" 이기 때문이다 — 낱자로 쪼개면 한 글자만 열어도
 * 나머지는 읽은 것으로 세게 된다. `基盤`·`妥協` 처럼 안 만난 글자가 섞인 덩어리는 **열리지 않는다**:
 * 열면 다음 카드의 답이 샌다(원칙 1).
 *
 * **표시를 새로 붙이지 않는다. 틴트가 곧 그 자리의 표시다** — 틴트 = 만난 것 = 가려진 것 =
 * 탭하면 열린다. 아이콘도 "탭해 보세요" 도 없다. 적는 순간 시험처럼 읽힌다. 연 뒤에도 열었다는
 * 표시를 남기지 않는다(그건 점수판이 된다). design/SCREENS.md F12 · F12a.
 *
 * 세는 단위가 둘이라 나눠 둔다:
 *  - **틴트는 글자마다.** 참고 화면의 `妥協` 이 妥(새것) + 協(틴트)으로 한 낱말 안에서 갈린다.
 *  - **읽기와 여는 것은 덩어리마다.** 世代 를 せ + だい 로 쪼갤 수 없다.
 */
export function MetText({
  body,
  name,
  met,
  readings,
  children,
  doneLabel,
  onDone,
}: {
  body: string;
  /** 자료 이름. 이 화면의 h1 이다 */
  name: string;
  /** 이미 만난 한자 글자들 */
  met: Set<string>;
  /** `kanjiRuns(body)` 와 길이·순서가 같다. 없거나 빈 문자열이면 읽기를 안 단다. */
  readings?: string[];
  /** 본문 아래 칸 (서버가 그린다) */
  children: React.ReactNode;
  doneLabel: string;
  /**
   * 연 덩어리 번호를 들고 나간다 — 기록은 여기서 한 번에 남는다. 서버 액션이다.
   * 미리보기(디자인 비교)에서는 없다: 누를 서버가 없으니 홈으로만 간다.
   */
  onDone?: (opened: number[]) => void | Promise<void>;
}) {
  const [opened, setOpened] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const chars = Array.from(body);
  const runs = kanjiRuns(body);
  const out = [];
  let cur = 0;

  runs.forEach((run, i) => {
    if (run.start > cur) out.push(<Fragment key={`t${i}`}>{chars.slice(cur, run.start).join("")}</Fragment>);
    const runChars = Array.from(run.text);
    const allMet = runChars.every((ch) => met.has(ch));
    const isOpen = opened.includes(i);
    const reading = allMet && isOpen ? readings?.[i] : undefined;
    // 판정은 글자마다, **그리는 것은 붙어 있는 만큼 한 덩어리로.** 글자마다 틴트 상자를 씌우면
    // 상자마다 좌우 여백이 들어가 協 力 사이에 흰 틈이 생기고, 한 낱말이 두 조각으로 보인다.
    const glyphs = runChars
      .reduce<{ seen: boolean; text: string }[]>((acc, ch) => {
        const seen = met.has(ch);
        const last = acc[acc.length - 1];
        if (last && last.seen === seen) last.text += ch;
        else acc.push({ seen, text: ch });
        return acc;
      }, [])
      .map((g, j) => (
        <span key={j} className={g.seen ? s.metSeen : undefined}>
          {g.text}
        </span>
      ));

    if (allMet) {
      // 탭 영역은 글자 자체다 — 따로 키우면 옆 글자를 덮는다. 본문 줄높이(2.3)가 세로를 벌어 준다.
      out.push(
        <span
          key={`r${i}`}
          role="button"
          tabIndex={0}
          aria-label={isOpen ? `${run.text} 읽기` : `${run.text} 읽기 보기`}
          className={s.metOpenable}
          onClick={() => setOpened((o) => (o.includes(i) ? o : [...o, i]))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpened((o) => (o.includes(i) ? o : [...o, i]));
            }
          }}
        >
          {reading ? <Ruby reading={reading}>{glyphs}</Ruby> : <>{glyphs}</>}
        </span>,
      );
    } else {
      // 아직 안 만난 글자가 섞인 덩어리. 읽기는 빈칸으로 가린다 (docs/FLOW.md 1′장 F12 행).
      out.push(<Ruby key={`r${i}`}>{glyphs}</Ruby>);
    }
    cur = run.end;
  });
  if (cur < chars.length) out.push(<Fragment key="tail">{chars.slice(cur).join("")}</Fragment>);

  return (
    <>
      <Card>
        {/* 화면마다 h1 하나 (CLAUDE.md). 상단 "지금 어디" 라벨은 제목이 아니다 — 이 화면의 제목은
            다시 읽는 그 자료의 이름이다. Scene1~5 가 같은 꼴로 카드 라벨을 h1 으로 쓴다. */}
        <Label as="h1">{name}</Label>
        <div className={s.metBody} lang="ja">
          {out}
        </div>
      </Card>
      <Grow />
      {children}
      <Space h={12} />
      {onDone ? (
        <Button
          disabled={pending}
          onClick={() => {
            if (pending) return;
            setPending(true);
            void onDone(opened);
          }}
        >
          {doneLabel}
        </Button>
      ) : (
        <Button href="/today">{doneLabel}</Button>
      )}
    </>
  );
}
