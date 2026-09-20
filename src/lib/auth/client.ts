"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/** 브라우저 측 인증 클라이언트. Google 로그인 버튼 등 클라이언트 컴포넌트에서만 쓴다. */
export const authClient = createAuthClient();

export function signInWithGoogle(callbackURL = "/today") {
  return authClient.signIn.social({ provider: "google", callbackURL });
}
