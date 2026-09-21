import { kanjiRuns } from "@/lib/kanji/extract";

/**
 * 본문의 한자 덩어리를 "이미 만났는가" 기준으로 갈라 둔다. **틴트·읽기·여는 단위가 여기 한 값에서
 * 나온다** — 따로 계산하면 언젠가 읽기는 보이는데 틴트는 없는 낱말이 생긴다.
 */
export type RunState = {
  text: string;
  chars: string[];
  /** 덩어리의 한자를 **전부** 만났는가. 읽기도 여는 것도 이게 참일 때만 일어난다. */
  allMet: boolean;
  met: string[];
  fresh: string[];
};

export function runStates(body: string, met: Set<string>): RunState[] {
  return kanjiRuns(body).map((r) => {
    const chars = Array.from(r.text);
    return {
      text: r.text,
      chars,
      allMet: chars.every((c) => met.has(c)),
      met: chars.filter((c) => met.has(c)),
      fresh: chars.filter((c) => !met.has(c)),
    };
  });
}
