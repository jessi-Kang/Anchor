import { Client as NeonClient } from "@neondatabase/serverless";
import { Client as PgClient } from "pg";
import { inspect } from "node:util";

/**
 * 관리 연결(테이블 소유자) 클라이언트. 앱의 src/lib/db 와 같은 규칙:
 * Neon 호스트면 서버리스 드라이버(WebSocket, 443), 아니면 일반 pg(TCP 5432).
 * 5432 가 막힌 환경(클라우드 세션, 일부 회사망)에서도 마이그레이션·적재가 돌아가게 하기 위해서다.
 * DATABASE_URL_ADMIN 이 없으면 Vercel Neon 통합이 주입하는 DATABASE_URL(소유자 역할)을 쓴다.
 */
export function adminClient(): PgClient {
  const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_ADMIN (또는 DATABASE_URL) 이 필요하다 (.env.example 참고)");
  const host = new URL(url).hostname;
  const isNeon = host.endsWith(".neon.tech") || host.endsWith(".neon.build");
  // 두 드라이버는 query/connect/end 가 같은 모양이라 pg 의 Client 로 취급한다.
  return (isNeon ? new NeonClient({ connectionString: url }) : new PgClient({ connectionString: url })) as unknown as PgClient;
}

/**
 * 던져진 것에서 **읽을 수 있는 한 줄**을 낸다. DB 쪽 스크립트의 `main().catch` 자리에 쓴다.
 *
 * **왜 `e instanceof Error ? e.message : e` 로는 안 되나.** Neon 드라이버는 WebSocket 이 깨지면
 * 그 자리의 `ErrorEvent` 를 **그대로** 던진다(`@neondatabase/serverless/index.js` 의
 * `c.addEventListener("error", f => { this.emit("error", f) ... })`). `ErrorEvent` 는 `Error` 가
 * 아니라 `Event` 라서 삼항의 거짓 가지로 떨어지고, Node 의 Event 검사기는 밑바탕 넷
 * (`type`·`defaultPrevented`·`cancelable`·`timeStamp`)만 찍는다 — **까닭이 든 `.message`·`.error`
 * 는 안 찍힌다.**
 *
 * **2026-09-22 적재 액션이 꼭 이렇게 죽었다.** 로그에 남은 것이 이 한 덩이뿐이었다:
 *
 *   ErrorEvent { type: 'error', defaultPrevented: false, cancelable: false, timeStamp: 959.15798 }
 *
 * 같은 모양을 로컬에서 냈다(업그레이드를 거절하는 서버로 드라이버를 보냄). 같은 객체에서
 * `.message` 를 꺼내니 "Received network error or non-101 status code." 가 있었다 — **까닭은
 * 처음부터 손에 있었고 찍히지만 않았다.** 그러니 막는 자리는 던지는 쪽이 아니라 **찍는 쪽**이다.
 */
export function reason(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const ev = e as { message?: unknown; error?: unknown };
    const inner = ev.error instanceof Error ? ev.error.message : typeof ev.error === "string" ? ev.error : undefined;
    const msg = typeof ev.message === "string" && ev.message ? ev.message : inner;
    if (msg) return `${e.constructor?.name ?? "object"}: ${msg}`;
  }
  return inspect(e, { depth: 3 });
}
