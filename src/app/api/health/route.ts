import { withoutUser } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — DB 연결과 RLS 상태 확인. 인증 불필요, 사용자 데이터 노출 없음.
 * `rls_all_forced` 가 false 면 배포를 멈춘다.
 */
export async function GET() {
  try {
    const result = await withoutUser(async (tx) => {
      const { rows: role } = await tx.query<{ current_user: string; bypass: boolean }>(
        `SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`,
      );
      const { rows: tables } = await tx.query<{ relname: string; rowsecurity: boolean; forcerowsecurity: boolean }>(
        `SELECT c.relname, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'
         ORDER BY c.relname`,
      );
      const { rows: mig } = await tx.query<{ name: string }>(
        `SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1`,
      ).catch(() => ({ rows: [] as { name: string }[] }));
      return { role: role[0], tables, latest_migration: mig[0]?.name ?? null };
    });

    const rlsAllForced = result.tables.every((t) => t.rowsecurity && t.forcerowsecurity);
    const ok = rlsAllForced && !result.role.bypass;
    return Response.json(
      {
        ok,
        db_role: result.role.current_user,
        role_bypasses_rls: result.role.bypass,
        rls_all_forced: rlsAllForced,
        tables: result.tables,
        latest_migration: result.latest_migration,
      },
      { status: ok ? 200 : 503 },
    );
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
