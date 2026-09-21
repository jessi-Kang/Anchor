import { requireUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";
// 내보내기 대상 목록과 「왜 어긋나는가」는 한 곳에 있고, `pnpm test:db` 가 스키마와 견준다.
import { USER_TABLES } from "@/lib/db/export-tables";

export const dynamic = "force-dynamic";


/**
 * GET /api/export — 내 데이터 전체를 JSON 파일 하나로.
 * "서비스가 사라져도 학습 기록은 남는다." 언제든, 조건 없이.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    return res as Response;
  }

  const data = await withUser(user.id, async (tx) => {
    const out: Record<string, unknown[]> = {};
    for (const table of USER_TABLES) {
      // RLS 가 이미 본인 행으로 제한하지만, 공용 노드/엣지(user_id NULL)는 명시적으로 뺀다.
      const where = table === "nodes" || table === "edges" ? "WHERE user_id IS NOT NULL" : "";
      const { rows } = await tx.query(`SELECT * FROM ${table} ${where}`);
      out[table] = rows;
    }
    return out;
  });

  const body = JSON.stringify(
    {
      format: "anchor-export",
      version: 1,
      exported_at: new Date().toISOString(),
      user_id: user.id,
      data,
    },
    null,
    2,
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="anchor-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
