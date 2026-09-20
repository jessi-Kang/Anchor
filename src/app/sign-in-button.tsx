"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth/client";

export function SignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && (
        <div style={{ fontSize: 13, color: "var(--text2)", textAlign: "center", marginBottom: 10 }}>{error}</div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const { error } = await signInWithGoogle("/today");
          if (error) {
            setError(error.message ?? "로그인에 실패했다. 다시 시도해 달라.");
            setPending(false);
          }
        }}
        style={{
          height: 56,
          width: "100%",
          border: 0,
          borderRadius: 14,
          background: "var(--button)",
          color: "var(--button-text)",
          fontSize: 16,
          fontWeight: 500,
          fontFamily: "inherit",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "이동 중…" : "Google로 시작"}
      </button>
    </>
  );
}
