"use client";

import { useTransition } from "react";
import { Space, Button, uiStyles as s } from "@/components/ui";
import { submitGuess } from "@/app/talk/actions";
import { useDraft } from "@/lib/use-draft";

/**
 * F17 입력. 영어 한 줄 하나 + 주 버튼 하나. 빈 줄이면 주 버튼이 꺼져 있다 (docs/FLOW.md 1′장).
 *
 * **플레이스홀더에 영어 예시를 넣지 않는다.** 거기 한 줄 넣으면 그게 곧 힌트고, 추측할 이유가 사라진다
 * (design/SCREENS.md "추측 화면에는 답이 없다"). 무엇을 쓰는 칸인지만 말한다.
 *
 * **이미 낸 추측이 있으면 이 칸 자체가 안 선다** — 화면이 F17a 로 갈리고 그 줄은 카드로 나온다.
 * 못 쓰게 막은 칸을 남겨 두면 모양이 거짓말을 하고, 다시 누르는 것이 "새 추측" 으로 읽힌다.
 */
export function GuessForm({ chunkId, preview }: { chunkId: string; preview: boolean }) {
  // 줄마다 따로 남긴다 — 다른 "못 한 말" 의 추측이 이 칸에 뜨면 안 된다.
  const draft = useDraft(`guess:${chunkId}`);
  const line = draft.value;
  const [pending, start] = useTransition();

  return (
    <>
      <input
        className={s.guess}
        type="text"
        lang="en"
        value={line}
        onChange={(e) => draft.set(e.target.value)}
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
          draft.clear();
          start(() => submitGuess(chunkId, line));
        }}
      >
        이제 확인
      </Button>
    </>
  );
}
