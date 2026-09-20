"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Row, Pill } from "@/components/ui";

/**
 * 계정 삭제 행. 탭 → "삭제"를 직접 입력 → POST /api/account/delete → 로그인 화면.
 * 복구 불가. 백업 사본은 35일 안에 사라진다 (docs/BACKUP.md).
 */
export function DeleteAccountRow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;
    const typed = window.prompt("모든 데이터가 지워지고 되돌릴 수 없어. 백업 사본도 35일 안에 사라져.\n계속하려면 '삭제' 라고 입력해.");
    if (typed !== "삭제") return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "삭제" }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "삭제에 실패했어. 다시 시도해.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return <Row title="계정 삭제" sub={error ?? "데이터와 백업 사본까지. 되돌릴 수 없어"} right={<Pill>{busy ? "지우는 중" : "삭제"}</Pill>} onClick={run} />;
}
