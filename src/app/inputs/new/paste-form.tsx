"use client";

import { useState, useTransition } from "react";
import type { Lang3 } from "@/lib/db/settings";
import { Card, Label, Row, Pill, Space, Grow, Button, uiStyles as s } from "@/components/ui";
import { submitInput } from "./actions";

/**
 * F02 붙여넣기 폼. 카드 안: 라벨 "붙여넣은 글" + 글 상자.
 * 첫 방문(이 언어의 자료가 없음)엔 예시 자료 행이 하나 더 있고, 탭 한 번에 상자가 채워진다.
 * 주 버튼 "모르는 것만 뽑기" 하나.
 */
export function PasteForm({ lang, example, firstVisit }: { lang: Lang3; example: { title: string; body: string }; firstVisit: boolean }) {
  const [text, setText] = useState("");
  const [usedExample, setUsedExample] = useState(false);
  const [pending, start] = useTransition();
  const isExample = usedExample && text === example.body;

  return (
    <>
      <Card>
        <Label>붙여넣은 글</Label>
        <textarea
          className={s.paste}
          lang={lang}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="여기에 붙여넣어"
          rows={6}
          aria-label="붙여넣은 글"
        />
        {firstVisit && (
          <Row
            title="예시 자료로 시작"
            sub={example.title}
            right={<Pill on={isExample}>{isExample ? "넣었어" : "탭 한 번"}</Pill>}
            pressed={isExample}
            onClick={() => {
              setText(example.body);
              setUsedExample(true);
            }}
          />
        )}
      </Card>
      <Space h={12} />
      <Grow />
      <Button disabled={pending || text.trim().length === 0} onClick={() => start(() => submitInput(lang, text, isExample))}>
        모르는 것만 뽑기
      </Button>
    </>
  );
}
