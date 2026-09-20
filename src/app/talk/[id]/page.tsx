import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getChunk, type ChunkRow } from "@/lib/db/chunks";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Card, Label, Mark, uiStyles as s } from "@/components/ui";
import { nowKST } from "@/components/card-bits";
import { TalkLoop } from "./talk-loop";

export const dynamic = "force-dynamic";

const PREVIEW: ChunkRow = {
  id: "preview",
  lang: "en",
  situation: "이건 다음 스프린트로 미루죠",
  text: "Let's push this to the next sprint.",
  attitude: "제안",
  meta: { chunk: "push this to", note: '"~하죠"는 제안. 영어로는 이 덩어리 하나로' },
  created_at: "",
};

/** 문장 안에서 덩어리만 배경 틴트로 (F14). 색이 아니라 틴트다 — CLAUDE.md 디자인 시스템. */
function markChunk(text: string, chunk: string) {
  const i = chunk ? text.indexOf(chunk) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <Mark>{chunk}</Mark>
      {text.slice(i + chunk.length)}
    </>
  );
}

/**
 * `/talk/[id]` — F14 덩어리 + 음성 루프. 뼈대·문구는 design/screens/F14.html.
 * 상단 라벨 → F13(못 한 말). 원칙 3: 연음·억양을 글로 설명하지 않는다. 덩어리를 듣고, 따라 말하고, 곡선을 겹쳐 본다.
 * 화면의 글은 셋뿐이다 — 말끝의 태도 한 줄, 문장 하나, 곡선 밑 한 줄.
 */
export default async function TalkChunkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fixed?: string }>;
}) {
  const { id } = await params;
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let chunk = PREVIEW;

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const row = await getChunk(user.id, id);
    if (!row) notFound();
    chunk = row;
  }

  const highlight = chunk.meta.chunk ?? chunk.text;

  return (
    <Screen where="저녁" up="/talk" aside={preview ? "오후 7:11" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Card>
        <Label>{chunk.meta.note ?? `"${chunk.situation}"에서 이 덩어리 하나로`}</Label>
        <h1 className={s.source} lang="en">
          {markChunk(chunk.text, highlight)}
        </h1>
      </Card>
      <Space h={16} />
      <TalkLoop chunkId={chunk.id} text={highlight} preview={preview} />
    </Screen>
  );
}
