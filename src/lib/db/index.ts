import { Pool as NeonPool } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import { env } from "@/lib/env";

/**
 * 데이터 접근 규칙 (CLAUDE.md 데이터 원칙)
 *
 * - 연결은 `anchor_app` 역할(BYPASSRLS 없음)로만 한다.
 * - 모든 사용자 데이터 쿼리는 `withUser(userId, ...)` 안에서 실행한다.
 *   트랜잭션을 열고 `app.user_id` 를 SET LOCAL 하면, RLS 정책(`app.current_user_id()`)이
 *   그 사용자 행만 보이게/쓰이게 한다. 설정이 없으면 어떤 행도 보이지 않는다.
 * - 애플리케이션 코드에서 `WHERE user_id = ...` 를 빠뜨려도 다른 계정 데이터가 새지 않는다.
 *   (그래도 명시적으로 쓴다. RLS는 마지막 방어선이다.)
 */

/** 두 드라이버가 공유하는 최소 인터페이스 */
export interface Tx {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

interface Client extends Tx {
  release(): void;
}

interface AnyPool {
  connect(): Promise<Client>;
}

let pool: AnyPool | undefined;

/**
 * Neon 호스트면 서버리스 드라이버(WebSocket 프록시), 아니면 일반 pg(TCP).
 * 로컬 Postgres 로 마이그레이션·RLS 를 검증할 때 pg 가 필요하다.
 */
function getPool(): AnyPool {
  if (pool) return pool;
  const url = env.DATABASE_URL;
  const host = new URL(url).hostname;
  const isNeon = host.endsWith(".neon.tech") || host.endsWith(".neon.build");
  pool = (isNeon
    ? new NeonPool({ connectionString: url, max: 5 })
    : new PgPool({ connectionString: url, max: 5 })) as unknown as AnyPool;
  return pool;
}

/**
 * 사용자 컨텍스트 트랜잭션. 콜백이 던지면 롤백한다.
 * 추측 한 번, 녹음 한 번도 유실되지 않도록, 콜백 안에서 하는 쓰기는 전부 원자적으로 커밋된다.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!userId) throw new Error("withUser: userId 가 비어 있다");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // set_config(..., is_local = true) → 이 트랜잭션 안에서만 유효
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 사용자 컨텍스트가 없는 쿼리. 공용 참조 데이터(user_id IS NULL 인 nodes/edges)와
 * 헬스체크에만 쓴다. RLS 때문에 사용자 행은 어차피 보이지 않는다.
 */
export async function withoutUser<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
