"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth/client";
import { Button, GoogleMark } from "@/components/ui";

export function GoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && (
        <div style={{ fontSize: 13, color: "var(--color-text2)", textAlign: "center", marginBottom: 10 }}>
          {error}
        </div>
      )}
      <Button
        outline
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
      >
        <GoogleMark />
        Google로 계속하기
      </Button>
    </>
  );
}
