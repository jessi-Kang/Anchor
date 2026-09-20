/**
 * Neon 브랜치 스냅샷 생성 (배포 전 자동 백업).
 *   pnpm backup:snapshot                 수동
 *   pnpm vercel-build                    빌드 전에 --pre-deploy 로 실행
 *
 * --pre-deploy 모드: NEON_API_KEY / NEON_PROJECT_ID / NEON_BRANCH_ID 중 하나라도 없거나
 * 프로덕션 빌드(VERCEL_ENV=production)가 아니면 건너뛴다. 프로덕션에서 스냅샷 실패는 빌드 실패다.
 *
 * API: POST /api/v2/projects/{project_id}/branches/{branch_id}/snapshot?name=&expires_at=
 */
import { loadEnv } from "../lib/load-env";

loadEnv();

const preDeploy = process.argv.includes("--pre-deploy");
const RETENTION_DAYS = Number(process.env.SNAPSHOT_RETENTION_DAYS ?? 14);

async function main() {
  const { NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID, VERCEL_ENV } = process.env;

  if (preDeploy && VERCEL_ENV && VERCEL_ENV !== "production") {
    console.log(`[snapshot] ${VERCEL_ENV} 빌드 → 건너뜀`);
    return;
  }
  if (!NEON_API_KEY || !NEON_PROJECT_ID || !NEON_BRANCH_ID) {
    if (preDeploy) {
      console.log("[snapshot] NEON_API_KEY / NEON_PROJECT_ID / NEON_BRANCH_ID 없음 → 건너뜀");
      return;
    }
    throw new Error("NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID 가 필요하다");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${preDeploy ? "pre-deploy" : "manual"}-${stamp}${process.env.VERCEL_GIT_COMMIT_SHA ? `-${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : ""}`;
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString();

  const url = new URL(`https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches/${NEON_BRANCH_ID}/snapshot`);
  url.searchParams.set("name", name);
  url.searchParams.set("expires_at", expiresAt);

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${NEON_API_KEY}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`[snapshot] 실패 ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { snapshot?: { id?: string } };
  console.log(`[snapshot] 생성됨 ${name} (id=${body.snapshot?.id ?? "?"}, 만료 ${expiresAt})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
