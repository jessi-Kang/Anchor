import { auth } from "@/lib/auth/server";

// Neon Auth API 프록시: 로그인, OAuth 콜백, 세션, 로그아웃 전부 여기로 온다.
export const { GET, POST } = auth.handler();
