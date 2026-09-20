"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Lang3 } from "@/lib/db/settings";
import { LANGS, LANG_LABEL, LANG_START } from "@/lib/languages";
import { Row, Pill } from "@/components/ui";
import { turnOffLanguage } from "./actions";

/**
 * 설정의 언어 행. 켜진 언어는 탭하면 끈다(알약 켜짐 → 꺼짐). 꺼진 언어는 탭하면 언어 고르기(O02a)로.
 * 알약 어휘는 켜짐 / 꺼짐 두 가지 (FLOW 4장).
 */
export function LanguageRows({ enabled }: { enabled: Lang3[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <>
      {LANGS.map((l) => {
        const on = enabled.includes(l);
        if (!on) return <Row key={l} href="/onboarding/languages" title={LANG_LABEL[l]} sub={LANG_START[l]} right={<Pill>꺼짐</Pill>} />;
        return (
          <Row
            key={l}
            title={LANG_LABEL[l]}
            sub="탭하면 꺼져. 자료는 남아"
            right={<Pill on>켜짐</Pill>}
            pressed
            onClick={() => {
              if (pending) return;
              start(async () => {
                await turnOffLanguage(l);
                router.refresh();
              });
            }}
          />
        );
      })}
    </>
  );
}
