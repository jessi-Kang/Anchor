import { Client as NeonClient } from "@neondatabase/serverless";
import { Client as PgClient } from "pg";

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
