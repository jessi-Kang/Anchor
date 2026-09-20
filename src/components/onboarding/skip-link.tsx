"use client";

import { useTransition } from "react";
import type { Lang3, StepKey } from "@/lib/db/onboarding";
import { TopLink } from "@/components/ui";
import { skipStep } from "@/app/onboarding/actions";

/** 상단 오른쪽 "나중에 할게". 단계를 skipped 로 두고 다음으로 넘어간다. */
export function SkipLink({ step, lang }: { step: StepKey; lang: Lang3 }) {
  const [pending, start] = useTransition();
  return (
    <TopLink disabled={pending} onClick={() => start(() => skipStep(step, lang))}>
      나중에 할게
    </TopLink>
  );
}
