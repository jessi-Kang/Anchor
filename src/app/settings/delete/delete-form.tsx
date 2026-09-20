"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lead, Space, Grow, Button, Ghost, uiStyles as s } from "@/components/ui";

/**
 * 계정 삭제 확인 1장 (docs/FLOW.md 1′장, design/screens/F16a.html).
 * 검은 주 버튼은 **돌아가는 쪽**("아니, 그만둘래" → 설정, 아무것도 지우지 않는다).
 * 지우는 것은 그 아래 회색 링크이고, "삭제"를 입력해야 켜진다. POST /api/account/delete → 로그인 화면.
 */
export function DeleteForm() {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = typed === "삭제";

  const run = async () => {
    if (busy || !armed) return;
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

  return (
    <>
      <input
        className={s.guess}
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="삭제"
        autoComplete="off"
        aria-label="확인 입력"
      />
      {error && (
        <>
          <Space h={10} />
          <Lead>{error}</Lead>
        </>
      )}
      <Grow />
      <Button href="/settings">아니, 그만둘래</Button>
      {armed && !busy ? (
        <Ghost onClick={run}>지울게</Ghost>
      ) : (
        <div className={s.ghostOff} aria-disabled>
          {busy ? "지우는 중" : "지울게"}
        </div>
      )}
    </>
  );
}
