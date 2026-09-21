import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { getChunk, hasEnglish, type ChunkRow } from "@/lib/db/chunks";
import { loadSpeakLoop, type SpeakLoopData } from "@/lib/speak-loop";
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
  meta: { chunk: "push this to", guess: "Let's move this to next week." },
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
 * 맨 위는 F13 에서 쓴 그 한국어 한 줄이다 — 다음 화면에서 사라지면 무엇을 말하려 했는지 잃는다.
 * 한국어 말끝이 무슨 태도인지는 화면에 쓰지 않는다. 그건 문법 설명이고 원칙 1 에 걸린다(태도는 DB 에만 남긴다).
 */
export default async function TalkChunkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fixed?: string; native?: string }>;
}) {
  const { id } = await params;
  const { fixed, native } = await searchParams;
  const preview = isDesignPreview();
  let chunk = PREVIEW;
  // 루프가 받을 것(회차·마지막 곡선·겨눌 소리 유무)은 한 군데에서 푼다 (lib/speak-loop.ts).
  // 페이지마다 따로 고르다가 F10 이 곡선을 두고 왔다 — 범례는 회차를 말하는데 곡선이 없었다.
  let loop: SpeakLoopData = { startAttempt: 0, startPrev: null, targetVoice: true };

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const row = await getChunk(user.id, id);
    if (!row) notFound();
    // 영어 문장이 아직 없으면 추측을 안 거친 것이다. F17 로 돌려보낸다 — 여기서 만들어 주면
    // 추측 화면을 건너뛰는 길이 생긴다 (docs/FLOW.md 1′장: F13 → F17 → F14).
    if (!hasEnglish(row)) redirect(`/talk/${id}/guess`);
    chunk = row;
    loop = await loadSpeakLoop(user.id, { chunk: row.id }, "en");
  }

  const highlight = chunk.meta.chunk ?? chunk.text;
  // 디자인 미리보기에서만 `?native=0` 으로 F14a(겨눌 소리 없음)를 띄운다 — 참고 화면이 둘이라
  // 둘 다 눈으로 견줄 수 있어야 한다. 실제 화면은 이 파라미터를 보지 않는다.
  const targetVoice = preview ? native !== "0" : loop.targetVoice;

  return (
    <Screen where="못 한 말" up="/talk" aside={preview ? "오후 7:11" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Card>
        <Label>내가 하려던 말</Label>
        <div className={s.talkSituation}>{chunk.situation}</div>
      </Card>
      <Space h={10} />
      {/*
        내 추측과 영어 문장을 **나란히**. 채점하지 않는다 — 정오·점수·빨간 줄·취소선이 없고,
        두 줄의 크기·굵기·색이 같다(`s.talkLine` 하나를 같이 쓴다). 나란히 놓는 것 자체가 비교이고,
        거기에 판정을 얹는 순간 교정 화면이 된다 (docs/FLOW.md 4장, design/SCREENS.md).
        추측이 없는 행(이 화면이 생기기 전에 만든 것)은 아랫줄만 나온다.
      */}
      <Card>
        {chunk.meta.guess && (
          <>
            <div className={s.talkPair}>
              <Label>내가 쓴 것</Label>
              <p className={s.talkLine} lang="en">
                {chunk.meta.guess}
              </p>
            </div>
            <div className={s.talkDivider} />
          </>
        )}
        <div className={s.talkPair}>
          <Label>이 말</Label>
          <h1 className={s.talkLine} lang="en">
            {markChunk(chunk.text, highlight)}
          </h1>
        </div>
      </Card>
      <Space h={16} />
      <TalkLoop chunkId={chunk.id} text={highlight} preview={preview} startAttempt={loop.startAttempt} targetVoice={targetVoice} startPrev={loop.startPrev} />
    </Screen>
  );
}
