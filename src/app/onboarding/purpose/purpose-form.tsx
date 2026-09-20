"use client";

import { useState, useTransition } from "react";
import type { Lang3 } from "@/lib/db/onboarding";
import { Card, Group, Chips, Chip, Grow, Button } from "@/components/ui";
import { submitPurposes } from "./actions";

export function PurposeForm({
  lang,
  options,
  initial,
  editing,
}: {
  lang: Lang3;
  options: string[];
  initial: string[];
  /** 이미 상황을 고른 언어를 고치러 온 경우 ("저장") */
  editing: boolean;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [pending, start] = useTransition();

  const toggle = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));

  return (
    <>
      <Card list>
        <Group title="상황">
          <Chips>
            {options.map((v) => (
              <Chip key={v} on={picked.includes(v)} onClick={() => toggle(v)}>
                {v}
              </Chip>
            ))}
          </Chips>
        </Group>
      </Card>
      <Grow />
      <Button disabled={pending || picked.length === 0} onClick={() => start(() => submitPurposes(lang, picked))}>
        {editing ? "저장" : "다음"}
      </Button>
    </>
  );
}
