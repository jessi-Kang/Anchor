import { Mark, Ruby, rubyKanji } from "@/components/ui";
import { kanjiRuns } from "@/lib/kanji/extract";

/**
 * 시각 (참고 HTML 의 "점심 12:30" 자리). 한국어로만 쓴다 — 화면에 영어가 들어가면 안 된다.
 * toLocaleTimeString("ko-KR") 은 ICU 가 작은 빌드에서 "PM 10:25" 로 떨어져서, 직접 만든다.
 */
export function nowKST() {
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Seoul",
  }).format(new Date());
  const [h, m] = hhmm.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`;
}

/**
 * 문장 안에서 단어를 배경 틴트로 강조 (F04), 나머지 한자에는 よみがな 를 단다.
 *
 * 두 가지가 한 화면에 같이 있다 (CLAUDE.md 디자인 시스템 + docs/FLOW.md 4장):
 *  - **맞혀야 할 단어**는 추측 전까지 읽기를 가린다. 글자마다 점선 빈칸 (`rubyKanji` 를 읽기 없이).
 *  - **나머지 한자**는 읽기를 보여 준다. 그래야 자료 문장이 읽히는 문장이 된다.
 *
 * `readings` 는 `kanjiRuns(sentence)` 와 길이·순서가 같다(`lib/kanji/furigana.ts`). 없거나 빈
 * 문자열인 덩어리는 ruby 없이 그대로 둔다 — 확신 없는 읽기를 다느니 안 다는 쪽이다.
 */
export function markWord(sentence: string, word: string, readings?: string[]) {
  const chars = Array.from(sentence);
  const runs = kanjiRuns(sentence);
  const target = word ? runs.findIndex((r) => r.text === word) : -1;
  if (word && target < 0) return <>{sentence}</>;

  const out = [];
  let cur = 0;
  runs.forEach((r, i) => {
    if (r.start > cur) out.push(<span key={`t${i}`}>{chars.slice(cur, r.start).join("")}</span>);
    const reading = readings?.[i];
    if (i === target) out.push(<Mark key={`w${i}`}>{rubyKanji(r.text)}</Mark>);
    else if (reading) out.push(<Ruby key={`r${i}`} reading={reading}>{r.text}</Ruby>);
    else out.push(<span key={`r${i}`}>{r.text}</span>);
    cur = r.end;
  });
  if (cur < chars.length) out.push(<span key="tail">{chars.slice(cur).join("")}</span>);
  return <>{out}</>;
}
