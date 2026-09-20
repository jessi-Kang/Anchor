"use client";

import { useState, useTransition } from "react";
import type { Lang3 } from "@/lib/db/onboarding";
import { LANGS, LANG_LABEL, LANG_START } from "@/lib/onboarding-flow";
import { Card, Row, Pill, Grow, Button, Ghost } from "@/components/ui";
import { submitLanguages } from "./actions";

/**
 * O02a 언어 고르기. 행을 탭해 토글. 이미 켠 언어는 "켜짐"으로 고정(끄기는 여기서 하지 않는다).
 * 추가 모드(켠 언어가 있음)일 때만 "돌아가기" 링크.
 */
export function LanguagePicker({ enabled, initial = [] }: { enabled: Lang3[]; initial?: Lang3[] }) {
  const [picked, setPicked] = useState<Lang3[]>(initial);
  const [pending, start] = useTransition();

  const toggle = (l: Lang3) => setPicked((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l]));

  return (
    <>
      <Card list>
        {LANGS.map((l) => {
          const on = enabled.includes(l);
          const want = picked.includes(l);
          const pill = on ? <Pill on>켜짐</Pill> : want ? <Pill on>할래</Pill> : <Pill>나중에</Pill>;
          return on ? (
            <Row key={l} title={LANG_LABEL[l]} sub={LANG_START[l]} right={pill} />
          ) : (
            <Row key={l} title={LANG_LABEL[l]} sub={LANG_START[l]} right={pill} onClick={() => toggle(l)} pressed={want} />
          );
        })}
      </Card>
      <Grow />
      <Button disabled={pending || picked.length === 0} onClick={() => start(() => submitLanguages(picked))}>
        다음
      </Button>
      {enabled.length > 0 && <Ghost href="/settings">돌아가기</Ghost>}
    </>
  );
}
