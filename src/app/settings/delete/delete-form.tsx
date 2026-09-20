"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lead, Space, Grow, Button, uiStyles as s } from "@/components/ui";

/** 계정 삭제 확인 1장: "삭제"를 입력해야 진행. POST /api/account/delete → 로그인 화면. */
export function DeleteForm() {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy || typed !== "삭제") return;
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
      <Button disabled={busy || typed !== "삭제"} onClick={run}>
        {busy ? "지우는 중" : "계정 삭제"}
      </Button>
    </>
  );
}
