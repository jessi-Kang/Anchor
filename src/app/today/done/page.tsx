import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { listInputs } from "@/lib/db/inputs";
import { litToday, spokenToday } from "@/lib/db/today";
import { inputProgress, freshKanji } from "@/lib/cards/progress";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Card, Label, Row, Pill, Grow, Button } from "@/components/ui";
import { nowKST } from "@/components/card-bits";

export const dynamic = "force-dynamic";

/** 한 줄에 들어가는 한자 수. 넘으면 글자 대신 개수로 말한다. */
const FITS = 6;

const PREVIEW = { lit: ["協", "開", "基"], spoken: ["push this to"], waiting: ["妥"] };

/**
 * `/today/done` — F15 하루 끝. 뼈대·문구는 design/screens/F15.html.
 * 카드 큐가 비었을 때 홈 대신 뜬다. 상단 라벨 → 홈, 주 버튼 "내일 아침에" → 홈.
 *
 * **세는 자리지 칭찬하는 자리가 아니다.** 스트리크·점수·"잘했어요" 는 없다 (CLAUDE.md 하지 않는 것).
 * 오늘 켜진 것과 내일 기다리는 것을 그대로 센다.
 *
 * "대기" 는 재만남(F12)이 진하게 보여 주는 바로 그 한자들이다 — `freshKanji` 한 곳에서 온다.
 * 따로 세면 F12 는 하나라고 하는데 여기서는 둘이라고 말하게 된다.
 */
export default async function DonePage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  const preview = isDesignPreview();
  let lit = PREVIEW.lit;
  let spoken = PREVIEW.spoken;
  let waiting = PREVIEW.waiting;

  if (!preview) {
    const user = await currentUser();
    if (!user) redirect("/");
    const inputs = await listInputs(user.id, 20);
    const progs = await Promise.all(inputs.filter((i) => i.lang === "ja").map((i) => inputProgress(user.id, i)));
    [lit, spoken] = await Promise.all([litToday(user.id), spokenToday(user.id)]);
    // 아직 안 만난 한자는 자료마다 나오니 글자로 모은다 — 같은 한자가 두 기사에 있어도 하나다.
    waiting = [...new Set(progs.flatMap(freshKanji))];
  }

  return (
    <Screen where="오늘 끝" up="/today" aside={preview ? "오후 7:14" : nowKST()} fixed={fixed === "1"}>
      <Space h={28} />
      <Title lg>오늘 켜진 것</Title>
      <Space h={22} />
      <Card>
        <Label>그래프</Label>
        {lit.length > 0 && <Row title={lit.join(" ")} sub={`한자 ${lit.length}`} right={<Pill on>켜짐</Pill>} plain />}
        {spoken.length > 0 && (
          <Row title={spoken.join(" · ")} sub={`말해본 덩어리 ${spoken.length}`} right={<Pill on>켜짐</Pill>} plain />
        )}
        {waiting.length > 0 && (
          /*
            한자가 적으면 참고 화면처럼 글자를 늘어놓고, 많으면 개수로 말한다.
            둘 다 돌려 보고 정한 것이다 — 열여덟 자를 다 늘어놓으면 두 줄로 흘러 "대기" 알약이
            세로로 찌그러지고, 여섯 자만 보이면 나머지가 있다는 걸 화면이 숨긴다.
            개수 쪽 문구는 FLOW 1′장 F15 행의 말("내일 재만남 대기 n")을 그대로 쓴다.
          */
          <Row
            title={waiting.length <= FITS ? waiting.join(" ") : `내일 재만남 대기 ${waiting.length}`}
            sub="내일 기사에 또 나오면"
            right={<Pill>대기</Pill>}
            plain
          />
        )}
      </Card>
      <Grow />
      <Button href="/today">내일 아침에</Button>
    </Screen>
  );
}
