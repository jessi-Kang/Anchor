"use client";

import { useState, useTransition } from "react";
import type { Purposes } from "@/lib/db/onboarding";
import { LANG_LABEL, LANGS } from "@/lib/onboarding-flow";
import { Card, Group, Chips, Chip, Grow, Button } from "@/components/ui";
import { submitPurposes } from "./actions";

export function PurposeForm({
  options,
  initial,
  returning,
}: {
  options: Record<keyof Purposes, string[]>;
  initial: Purposes;
  /** 온보딩을 이미 마친 사용자가 언어를 추가·변경하러 온 경우 */
  returning: boolean;
}) {
  const [picked, setPicked] = useState<Purposes>(initial);
  const [pending, start] = useTransition();

  const toggle = (lang: keyof Purposes, v: string) =>
    setPicked((p) => ({ ...p, [lang]: p[lang].includes(v) ? p[lang].filter((x) => x !== v) : [...p[lang], v] }));

  const anyPicked = LANGS.some((l) => picked[l].length > 0);

  return (
    <>
      <Card list>
        {LANGS.map((lang) => (
          <Group key={lang} title={LANG_LABEL[lang]}>
            <Chips>
              {options[lang].map((v) => (
                <Chip key={v} on={picked[lang].includes(v)} onClick={() => toggle(lang, v)}>
                  {v}
                </Chip>
              ))}
            </Chips>
          </Group>
        ))}
      </Card>
      <Grow />
      <Button disabled={pending || !anyPicked} onClick={() => start(() => submitPurposes(picked))}>
        {returning ? "저장" : "다음"}
      </Button>
    </>
  );
}
