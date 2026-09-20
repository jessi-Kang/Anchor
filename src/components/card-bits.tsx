import { Mark, rubyKanji } from "@/components/ui";

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
 * 문장 안에서 단어를 배경 틴트로 강조 (F04). 강조한 단어의 한자에는 ruby 를 단다.
 * F04 는 언제나 추측 전이라 읽기는 아직 빈칸이다 (docs/FLOW.md 4장).
 */
export function markWord(sentence: string, word: string) {
  const i = word ? sentence.indexOf(word) : -1;
  if (i < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, i)}
      <Mark>{rubyKanji(word)}</Mark>
      {sentence.slice(i + word.length)}
    </>
  );
}
