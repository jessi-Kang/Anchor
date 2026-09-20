import { Fragment } from "react";
import { Ruby, uiStyles as s } from "@/components/ui";
import { kanjiRuns } from "@/lib/kanji/extract";

/**
 * 재만남(F12)의 자료 본문. **틴트와 읽기가 한 사실에서 나온다.**
 *
 * 그 사실은 "이 한자를 이미 만났는가" 하나다 (docs/FLOW.md 1′장 F12 행):
 *  - 만났다 → 배경 틴트 + 읽기를 **보여 준다**. 정답이 나온 뒤라 가릴 이유가 없다.
 *  - 아직 → 진한 글자 + 읽기는 **빈칸**. 띄우면 다음 카드의 답을 추측 전에 주는 꼴이라 원칙 1 에
 *    걸린다. 빈칸 모양은 F04 와 같다 (`Ruby` 를 reading 없이).
 *
 * 따로 정하면 언젠가 틴트인데 빈칸인 한자가 나온다. 그래서 `met` 하나에서 둘 다 나온다.
 *
 * 세는 단위가 둘이라 나눠 둔다:
 *  - **틴트는 글자마다.** 참고 화면의 `妥協` 이 妥(새것) + 協(틴트)으로 한 낱말 안에서 갈린다.
 *  - **읽기는 덩어리마다.** 世代 를 せ + だい 로 쪼갤 수 없다.
 *  그래서 덩어리 안에 아직 안 만난 글자가 하나라도 있으면 그 덩어리의 읽기는 통째로 가린다 —
 *  안전한 쪽이 가리는 쪽이다.
 */
export function MetText({
  body,
  met,
  readings,
}: {
  body: string;
  /** 이미 만난 한자 글자들 */
  met: Set<string>;
  /** `kanjiRuns(body)` 와 길이·순서가 같다. 없거나 빈 문자열이면 읽기를 안 단다. */
  readings?: string[];
}) {
  const chars = Array.from(body);
  const runs = kanjiRuns(body);
  const out = [];
  let cur = 0;

  runs.forEach((run, i) => {
    if (run.start > cur) out.push(<Fragment key={`t${i}`}>{chars.slice(cur, run.start).join("")}</Fragment>);
    const runChars = Array.from(run.text);
    const allMet = runChars.every((ch) => met.has(ch));
    const reading = allMet ? readings?.[i] : undefined;
    const glyphs = runChars.map((ch, j) => (
      <span key={j} className={met.has(ch) ? s.metSeen : undefined}>
        {ch}
      </span>
    ));
    // 셋을 가른다. 만난 덩어리인데 읽기가 없으면 **빈칸을 달지 않는다** — 빈칸은 "아직 못 푼 것" 이라는
    // 뜻이라, 이미 만난 글자에 달면 화면이 거짓을 말한다. 읽기가 없으면 아무것도 안 단다.
    if (!allMet) out.push(<Ruby key={`r${i}`}>{glyphs}</Ruby>);
    else if (reading) out.push(<Ruby key={`r${i}`} reading={reading}>{glyphs}</Ruby>);
    else out.push(<Fragment key={`r${i}`}>{glyphs}</Fragment>);
    cur = run.end;
  });
  if (cur < chars.length) out.push(<Fragment key="tail">{chars.slice(cur).join("")}</Fragment>);

  return <>{out}</>;
}
