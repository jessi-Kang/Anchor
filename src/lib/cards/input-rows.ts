import type { InputRow } from "@/lib/db/inputs";
import { inputProgress, nextCandidates } from "@/lib/cards/progress";
import { inputName } from "@/lib/input-name";
import { LANG_LABEL } from "@/lib/languages";

/**
 * 자료 행을 만드는 **한 곳**. 홈(F01)과 지난 자료(F19)가 같은 행을 쓴다.
 *
 * 왜 한 곳인가: 두 목록이 같은 행 모양을 쓰면 사용자가 한 번만 배운다(design/SCREENS.md F18·F19).
 * 그런데 같은 모양을 두 파일에서 각자 만들면 한쪽만 고쳐지는 날이 온다 — 자료 이름이 화면마다
 * 갈렸던 것과 같은 자리라 같은 방식으로 막는다(`lib/input-name.ts`).
 */
export type InputRowData = {
  input: InputRow;
  kanji: number;
  remaining: number;
  next: ReturnType<typeof nextCandidates>[number] | null;
  /** 오늘 들어갈 데가 있는가 — 남은 카드가 있거나, 아직 안 뽑았거나 */
  actionable: boolean;
};

export async function inputRowData(userId: string, inputs: InputRow[]): Promise<InputRowData[]> {
  return Promise.all(
    inputs.map(async (input) => {
      // 일본어만 한자를 뽑는다. 다른 언어는 뽑기가 다음 단계라 진행도가 없다.
      if (input.lang !== "ja") return { input, kanji: 0, remaining: 0, next: null, actionable: true };
      const prog = await inputProgress(userId, input);
      const next = prog.remaining > 0 ? (nextCandidates(prog)[0] ?? null) : null;
      return {
        input,
        kanji: prog.nodes.length,
        remaining: prog.remaining,
        next,
        // 아직 안 뽑은 자료도 오늘 들어갈 데가 있다 — 뽑기(F03)가 기다린다.
        actionable: prog.remaining > 0 || prog.nodes.length === 0,
      };
    }),
  );
}

/**
 * 행 하나. **부제 앞에 언어를 붙이는 것은 켠 언어가 둘 이상일 때만이다** (docs/FLOW.md 4장) —
 * 하나만 켰으면 그 언어를 말해 줄 이유가 없고, 매 행에 같은 낱말이 붙어 자료 이름이 묻힌다.
 *
 * 자료 행 하나가 **세 상태를 가른다** (docs/FLOW.md 4장): 안 뽑음 → 뽑기(F03), 남은 카드 →
 * 카드(F04, `next` 가 맡는다), 다 봄 → 재만남(F12). 다 본 자료를 뽑기로 보내면 할 일이 없는
 * 화면이 뜨고, 재만남에 들어갈 길이 어디에도 없다.
 */
export function toInputRow(d: InputRowData, showLang: boolean) {
  const { input, kanji, remaining } = d;
  const body =
    input.lang !== "ja"
      ? "뽑기는 다음 단계"
      : kanji === 0
        ? "아직 안 뽑았어"
        : remaining > 0
          ? `한자 ${kanji}개 · 남은 카드 ${remaining}`
          : `한자 ${kanji}개 · 다 봤어`;
  return {
    id: input.id,
    title: inputName(input),
    sub: showLang ? `${LANG_LABEL[input.lang]} · ${body}` : body,
    next: remaining > 0 ? (d.next?.kanji ?? null) : null,
    href: input.lang === "ja" && kanji > 0 && remaining === 0 ? `/inputs/${input.id}/read` : undefined,
  };
}

/** 홈에 세울 자료 행 수. 넘치는 것은 지난 자료(F19)로 간다 (docs/FLOW.md 4장). */
export const HOME_MAX = 4;

/**
 * 홈에 무엇을 남기고 무엇을 F19 로 넘길지. **자르는 기준은 날짜가 아니라 "오늘 들어갈 데가 있나" 다**
 * — 홈이 말해야 하는 것은 "오늘" 이지 "최근" 이 아니다 (docs/FLOW.md 4장).
 *
 * 남은 카드가 있거나 아직 안 뽑은 자료가 먼저(최근 순), 자리가 남으면 **다 본 자료 중 가장 최근
 * 하나**. 다 본 자료가 홈에 한 줄도 못 올라가는 날이 있어도 "지난 자료" 행이 있어서 재만남(F12)으로
 * 가는 길은 안 끊긴다.
 *
 * `rows` 는 최근 순으로 들어온다(`listInputs`). 자른 뒤에도 그 순서를 지킨다.
 */
export function splitForHome(all: InputRowData[]): { home: InputRowData[]; rest: InputRowData[] } {
  const home: InputRowData[] = [];
  for (const d of all) if (d.actionable && home.length < HOME_MAX) home.push(d);
  // 자리가 남으면 다 본 것 **하나**. 여럿 올리면 홈이 다시 목록이 된다.
  if (home.length < HOME_MAX) {
    const done = all.find((d) => !d.actionable);
    if (done) home.push(done);
  }
  const shown = new Set(home.map((d) => d.input.id));
  // 홈의 순서는 원래 순서(최근 순)를 따른다 — 고른 순서가 아니라.
  return { home: all.filter((d) => shown.has(d.input.id)), rest: all.filter((d) => !shown.has(d.input.id)) };
}
