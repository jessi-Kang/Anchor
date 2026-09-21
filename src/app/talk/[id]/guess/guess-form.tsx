"use client";

import { useTransition } from "react";
import { Space, Button, uiStyles as s } from "@/components/ui";
import { retryEnglish, submitGuess } from "@/app/talk/actions";
import { useDraft } from "@/lib/use-draft";

/**
 * F17 입력. 영어 한 줄 하나 + 주 버튼 하나. 빈 줄이면 주 버튼이 꺼져 있다 (docs/FLOW.md 1′장).
 *
 * **플레이스홀더에 영어 예시를 넣지 않는다.** 거기 한 줄 넣으면 그게 곧 힌트고, 추측할 이유가 사라진다
 * (design/SCREENS.md "추측 화면에는 답이 없다"). 무엇을 쓰는 칸인지만 말한다.
 */
export function GuessForm({ chunkId, preview, saved }: { chunkId: string; preview: boolean; saved?: string | null }) {
  // 줄마다 따로 남긴다 — 다른 "못 한 말" 의 추측이 이 칸에 뜨면 안 된다.
  const draft = useDraft(`guess:${chunkId}`);
  /*
    **이미 낸 추측이 있으면 읽기 전용이다** (F17a). 이유가 데이터 원칙이다 — 다시 누르는 것은
    **새 추측이 아니라 문장을 다시 만드는 것**이고, 고쳐 쓸 수 있게 두면 첫 추측을 덮을 길이 생긴다.
    그 줄은 "지난번엔 이렇게 말하려 했지" 의 재료라 한 번도 유실되면 안 된다 (CLAUDE.md).
  */
  const locked = typeof saved === "string";
  const line = locked ? saved : draft.value;
  const [pending, start] = useTransition();

  return (
    <>
      <input
        className={s.guess}
        type="text"
        lang="en"
        value={line}
        onChange={(e) => !locked && draft.set(e.target.value)}
        readOnly={locked}
        placeholder="영어로 한 줄"
        autoComplete="off"
        autoCapitalize="none"
        aria-label="영어 추측"
      />
      <Space h={12} />
      {/* 누르는 동안 글자를 바꾸지 않는다 — 주 버튼은 누른 뒤에도 같은 말이어야 한다. 게다가
          "영어로 옮기는 중" 은 내 추측을 번역하는 것처럼 읽혔다. 영어 문장은 F13 에 쓴 한국어
          줄에서 만든다. 꺼짐으로 충분하다. */}
      <Button
        disabled={pending || line.trim().length === 0}
        onClick={() => {
          if (preview) return;
          if (locked) return start(() => retryEnglish(chunkId));
          draft.clear();
          start(() => submitGuess(chunkId, line));
        }}
      >
        {/*
          **한자 축과 갈리는 기준은 축이 아니라 "다시 해서 얻을 게 있나" 다.** 여기는 그 덩어리를
          얻는 길이 이것뿐이라 다시 하는 것이 **앞으로 가는 유일한 길**이다. 한자 축에서는 다시 눌러도
          더 잘될 까닭이 없어 "다시" 버튼을 안 낸다 (PM 판정).
        */}
        {locked ? "다시 만들기" : "이제 확인"}
      </Button>
    </>
  );
}
