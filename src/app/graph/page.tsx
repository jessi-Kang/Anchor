import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getCard } from "@/lib/db/cards";
import { cardContext, nextCandidates, KNEW_VERB } from "@/lib/cards/progress";
import { isDesignPreview } from "@/lib/design-preview";
import { withParticle, type Spoken } from "@/lib/ko";
import { inputTo } from "@/lib/input-name";
import { Screen, Space, Title, Lead, Card, Grow, Button, Ghost, uiStyles as s } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { NextCard } from "./next-card";

export const dynamic = "force-dynamic";

/**
 * 원 안 글자와, 조사를 고르기 위한 한국 한자음. 「아는 것」 원은 조사가 안 붙으니 글자만 받는다.
 * 대체 텍스트도 화면 문장과 같은 자리(`withParticle`)를 거쳐야 한다 — 화면에 안 보인다고 예외가 아니다.
 */
type GraphData = { center: Spoken; known: string[]; next: Spoken[] };

function graphLabel(g: GraphData): string {
  const lit = `${withParticle(g.center, "이가")} 켜진 그래프`;
  if (!g.next.length) return `${lit}. 다음 후보는 없어.`;
  const next = { text: g.next.map((n) => n.text).join("·"), sound: g.next[g.next.length - 1].sound };
  return `${withParticle(g.center, "이가")} 켜지고 ${withParticle(next, "이가")} 다음으로 뜬 그래프`;
}

/** 그래프 1장: 가운데 오늘 켜진 한자, 위에 아는 부품(최대 2), 아래 다음 후보(최대 2). 범례 항상. */
function Graph({ g }: { g: GraphData }) {
  const top = [78, 238];
  const bottom = [78, 238];
  return (
    <svg width="316" height="236" viewBox="0 0 316 236" role="img" aria-label={graphLabel(g)} style={{ maxWidth: "100%" }}>
      {g.known.slice(0, 2).map((k, i) => (
        <line key={`ke${k}`} x1={158} y1={112} x2={g.known.length === 1 ? 158 : top[i]} y2={40} stroke="var(--graph-edge-known)" strokeWidth={3} />
      ))}
      {g.next.slice(0, 2).map((k, i) => (
        <line key={`ne${k.text}`} x1={158} y1={112} x2={g.next.length === 1 ? 158 : bottom[i]} y2={196} stroke="var(--graph-edge-next)" strokeWidth={3} strokeDasharray="6 6" />
      ))}
      {g.known.slice(0, 2).map((k, i) => {
        const x = g.known.length === 1 ? 158 : top[i];
        return (
          <g key={`k${k}`}>
            <circle cx={x} cy={40} r={30} fill="var(--graph-known)" />
            <text x={x} y={51} textAnchor="middle" fontFamily="var(--font-jp), Noto Sans JP" fontSize={30} fontWeight={700} fill="var(--color-accent-dark)">
              {k}
            </text>
          </g>
        );
      })}
      <circle cx={158} cy={112} r={42} fill="var(--graph-today)" />
      <text x={158} y={127} textAnchor="middle" fontFamily="var(--font-jp), Noto Sans JP" fontSize={42} fontWeight={700} fill="#FFFFFF">
        {g.center.text}
      </text>
      {g.next.slice(0, 2).map((k, i) => {
        const x = g.next.length === 1 ? 158 : bottom[i];
        return (
          <g key={`n${k.text}`}>
            <circle cx={x} cy={196} r={30} fill="var(--color-bg)" stroke="var(--graph-next)" strokeWidth={2} />
            <text x={x} y={207} textAnchor="middle" fontFamily="var(--font-jp), Noto Sans JP" fontSize={30} fontWeight={700} fill="var(--color-text3)">
              {k.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * `/graph?card=` — F11 그래프 1장. "協이 켜졌어. 協을 맞혔으니 助·加가 가장 가까워." 뼈대는 F11.html.
 * 다음 카드 = 아는 노드에서 가장 가까운 모르는 노드 (이 자료 안에서). 주 버튼 → 다음 카드, 보조 → 자료(F03).
 */
export default async function GraphPage({ searchParams }: { searchParams: Promise<{ card?: string; fixed?: string }> }) {
  const { card: cardId, fixed } = await searchParams;

  if (isDesignPreview()) {
    return (
      <Screen where="카드 1 / 4 끝" up="/today" aside="점심 12:36" fixed={fixed === "1"}>
        <Space h={28} />
        <Title lg>協이 켜졌어</Title>
        <Space h={6} />
        <Lead>協을 맞혔으니 助·加가 가장 가까워. 다음 카드는 이 둘 중 하나.</Lead>
        <Space h={18} />
        <Card style={{ padding: "20px 20px" }}>
          <Graph g={{ center: { text: "協", sound: "협" }, known: ["開", "基"], next: [{ text: "助", sound: "조" }, { text: "加", sound: "가" }] }} />
          <Legend />
        </Card>
        <Grow />
        <Button href="/today">{`${inputTo({ title: null, meta: { example: true } })} 돌아가기`}</Button>
        <Ghost href="/today">다음 카드 助</Ghost>
      </Screen>
    );
  }

  const user = await currentUser();
  if (!user) redirect("/");
  if (!cardId) redirect("/today");
  const card = await getCard(user.id, cardId);
  if (!card) notFound();
  if (!card.landed_at) redirect(`/cards/${card.id}/5`);
  const ctx = await cardContext(user.id, card);
  const p = card.payload;
  const cands = nextCandidates(ctx, p.kanji);
  // 「아는 것」 칸에는 **판정된** 노드만 올린다. 여기에 카드의 부품(p.parts)을 올리고 있어서
  // 보여 주기만 한 力 이 「아는 것」과 「다음」에 동시에 서 있었다 (docs/FLOW.md 8·4장).
  // 방금 켠 한자는 가운데에 따로 서므로 뺀다.
  const known = [...ctx.anchors].filter((k) => k !== p.kanji);
  const via = cands.find((c) => c.via)?.via ?? null;
  // 괄호로 앵커 단어를 보여 주면 아직 안 푼 카드의 정답을 미리 까는 꼴이다 (원칙 1).
  // F03 은 거기서 판정하니까 "支 · 지출의 지" 가 괜찮지만, 그래프는 판정하는 자리가 아니다.
  const candText = cands.map((c) => c.kanji).join("·");
  const last = cands[cands.length - 1];
  const candSubject = { text: candText, sound: last?.koSound ?? null };
  const lead =
    cands.length === 0
      ? "이 자료의 한자는 다 봤어. 다음 자료를 넣으면 이어져."
      : via
        ? `${withParticle({ text: via.kanji, sound: via.koSound }, "을를")} ${KNEW_VERB[via.how]} ${withParticle(candSubject, "이가")} 가장 가까워. 다음 카드는 ${cands.length > 1 ? "이 둘 중 하나" : "이거"}.`
        : `${withParticle(candSubject, "이가")} 남았어. 다음 카드는 ${cands.length > 1 ? "이 둘 중 하나" : "이거"}.`;
  // 일곱째 자리였다 — 다른 화면이 전부 inputName 을 거치는데 여기만 예시/아님 두 갈래로 직접 썼다.
  const backLabel = `${inputTo(ctx.input)} 돌아가기`;

  return (
    <Screen where={`${ctx.where} 끝`} up={card.input_id ? `/inputs/${card.input_id}` : "/today"} aside={nowKST()}>
      <Space h={28} />
      <Title lg>{withParticle({ text: p.kanji, sound: p.hook.mark }, "이가")} 켜졌어</Title>
      <Space h={6} />
      <Lead>{lead}</Lead>
      <Space h={18} />
      <Card style={{ padding: "20px 20px" }}>
        <Graph g={{ center: { text: p.kanji, sound: p.hook.mark }, known: known.slice(0, 2), next: cands.map((c) => ({ text: c.kanji, sound: c.koSound })) }} />
        <Legend />
      </Card>
      <Grow />
      <NextCard inputId={card.input_id} next={cands[0]?.kanji ?? null} backLabel={backLabel} />
    </Screen>
  );
}

function Legend() {
  return (
    <div className={s.legend}>
      <span className={s.legendItem}>
        <span className={s.legendDot} style={{ background: "var(--graph-known)" }} />
        아는 것
      </span>
      <span className={s.legendItem}>
        <span className={s.legendDot} style={{ background: "var(--graph-today)" }} />
        오늘
      </span>
      <span className={s.legendItem}>
        <span className={s.legendDot} style={{ border: "2px solid var(--graph-next)" }} />
        다음
      </span>
    </div>
  );
}
