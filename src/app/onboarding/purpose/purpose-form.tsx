"use client";

import { useState, useTransition } from "react";
import type { Purposes } from "@/lib/db/onboarding";
import { Card, Group, Chips, Chip, Grow, Button } from "@/components/ui";
import { submitPurposes } from "./actions";

const LANG_LABEL: Record<keyof Purposes, string> = { en: "영어", ja: "일본어", es: "스페인어" };

export function PurposeForm({ options, initial }: { options: Record<keyof Purposes, string[]>; initial: Purposes }) {
  const [picked, setPicked] = useState<Purposes>(initial);
  const [pending, start] = useTransition();

  const toggle = (lang: keyof Purposes, v: string) =>
    setPicked((p) => ({ ...p, [lang]: p[lang].includes(v) ? p[lang].filter((x) => x !== v) : [...p[lang], v] }));

  return (
    <>
      <Card list>
        {(Object.keys(options) as Array<keyof Purposes>).map((lang) => (
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
      <Button disabled={pending} onClick={() => start(() => submitPurposes(picked))}>
        다음
      </Button>
    </>
  );
}
