import { withoutUser } from "@/lib/db";
import { compareMigrations, MIGRATION_FILES } from "@/lib/db/migration-state";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — DB 연결과 RLS 상태 확인. 인증 불필요, 사용자 데이터 노출 없음.
 * `rls_all_enabled` 가 false 이거나 `role_bypasses_rls` 가 true 면 배포를 멈춘다.
 * (0003 이후 FORCE 는 걸지 않는다: 소유자 연결은 백업을 위해 전체를 읽어야 한다. 앱 역할의 격리는 ENABLE + 정책으로 유지된다.)
 *
 * **`migrations` 는 아는 만큼만 말한다.** 전에는 `latest_migration` 한 값이었고 원장에서 이름
 * 역순 첫 줄을 그대로 냈다 — 누가 손으로 돌린 SQL 이 원장에 뒤쪽 이름으로 남으면 **어느 커밋에도
 * 없는 파일 이름이 「최신」으로 나간다.** 이름 자체가 거짓말의 절반이었다: "이 배포에 적용된 최신"
 * 으로 읽혀서 `docs/SECURITY.md` E5 와 `docs/STATUS.md` 가 둘 다 그렇게 읽었고, E5 는 그 값을
 * **복구 리허설의 판정 기준**으로 쓴다. 그래서 원장 쪽과 레포 쪽을 갈라서 내고, 원장에만 있는
 * 이름을 따로 보여 준다.
 *
 * **`ok` 에는 안 넣는다.** `ok` 는 DB 연결과 RLS 얘기다. 여기에 마이그레이션을 섞으면 배포
 * 문지기가 두 가지 이유로 막히면서 어느 쪽인지 안 보인다.
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
      // 원장 전체를 읽는다. 마지막 한 줄만 읽으면 원장에만 있는 이름을 영영 못 본다.
      const { rows: mig } = await tx
        .query<{ name: string }>(`SELECT name FROM schema_migrations ORDER BY name`)
        .catch(() => ({ rows: [] as { name: string }[] }));
      return { role: role[0], tables, ledger: mig.map((r) => r.name) };
    });

    const rlsAllEnabled = result.tables.every((t) => t.rowsecurity);
    /*
      체크섬은 넘기지 않는다 — 번들에 `db/migrations/` 가 없어서 파일 내용을 못 읽는다. 못 보는
      것을 "어긋난 게 없다" 로 말하지 않으려고, 비교 함수가 체크섬 없는 호출에서는 `drifted` 를
      아예 안 채운다. 어긋남은 파일을 읽는 쪽(`pnpm test:db` 앞의 출처 줄)이 말한다.
    */
    const mig = compareMigrations(
      new Map(result.ledger.map((n) => [n, ""])),
      MIGRATION_FILES.map((name) => ({ name })),
    );
    const ok = rlsAllEnabled && !result.role.bypass && result.role.current_user === "anchor_app";
    return Response.json(
      {
        ok,
        db_role: result.role.current_user,
        role_bypasses_rls: result.role.bypass,
        rls_all_enabled: rlsAllEnabled,
        tables: result.tables,
        migrations: {
          ledger_latest: mig.ledger_latest,
          repo_latest: mig.repo_latest,
          ledger_only: mig.ledger_only,
          missing: mig.missing,
          applied: mig.applied,
        },
      },
      { status: ok ? 200 : 503 },
    );
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
