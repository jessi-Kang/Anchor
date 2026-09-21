"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang3 } from "@/lib/db/settings";
import { LANGS, LANG_LABEL, LANG_START } from "@/lib/languages";
import { Row, Pill } from "@/components/ui";
import { toggleLanguage } from "./actions";

/**
 * 설정의 언어 행 (docs/FLOW.md 1′장): 켜짐/꺼짐 알약, 탭하면 켜기·끄기. 마지막 언어는 끄지 않는다(홈이 비니까).
 * 알약은 시스템 상태(켜짐/꺼짐)라 알약으로, 고르는 행위는 행 전체 탭으로.
 */
export function LanguageRows({ enabled }: { enabled: Lang3[] }) {
  const router = useRouter();
  const [state, setState] = useState<Set<Lang3>>(() => new Set(enabled));
  const [pending, start] = useTransition();

  const tap = (l: Lang3) => {
    if (pending) return;
    const on = state.has(l);
    if (on && state.size === 1) return; // 하나는 켜 둔다
    setState((s) => {
      const n = new Set(s);
      if (on) n.delete(l);
      else n.add(l);
      return n;
    });
    start(async () => {
      await toggleLanguage(l, !on);
      router.refresh();
    });
  };

  return (
    <>
      {LANGS.map((l) => {
        const on = state.has(l);
        return (
          <Row
            key={l}
            title={LANG_LABEL[l]}
            sub={on ? (state.size === 1 ? "켜져 있어. 하나는 켜 둬" : "탭하면 꺼져. 자료는 남아") : LANG_START[l]}
            right={<Pill on={on}>{on ? "켜짐" : "꺼짐"}</Pill>}
            pressed={on}
            onClick={() => tap(l)}
          />
        );
      })}
      {/* 부제를 안 단다. 누르면 그 화면이 나오는데 미리 설명할 게 없다 (참고에도 없다). */}
      <Row title="언어 추가" href="/onboarding/languages" />
    </>
  );
}
