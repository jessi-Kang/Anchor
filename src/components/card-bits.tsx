import { Mark } from "@/components/ui";

/** 시각 (참고 HTML 의 "점심 12:30" 자리) */
export function nowKST() {
  return new Date().toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
}

/** 문장 안에서 단어를 배경 틴트로 강조 (F04) */
export function markWord(sentence: string, word: string) {
  const i = word ? sentence.indexOf(word) : -1;
  if (i < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, i)}
      <Mark>{word}</Mark>
      {sentence.slice(i + word.length)}
    </>
  );
}
