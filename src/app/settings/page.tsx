import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { withUser } from "@/lib/db";
import { getSettings, type Lang3 } from "@/lib/db/settings";
import { enabledLanguages } from "@/lib/languages";
import { isDesignPreview } from "@/lib/design-preview";
import { Screen, Space, Title, Card, Label, Row, Grow, Button } from "@/components/ui";
import { LanguageRows } from "./language-rows";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

/**
 * `/settings` — docs/FLOW.md 1′장. 라벨 "언어": 언어 행(켜짐/꺼짐, 탭하면 켜기·끄기) + "언어 추가" 행.
 * 라벨 "계정": 이메일, 로그아웃, 음성 보관 기간(기본 30일, 기준은 SPEC 6.6), 전체 내보내기, 계정 삭제(확인 1장).
 * 주 버튼 "홈으로". 이탈 없음(행이 전부 이동). 상단 라벨도 홈.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ fixed?: string }> }) {
  const { fixed } = await searchParams;
  let email = "jessi@example.com";
  // 미리보기는 **참고 화면이 그리는 상태**를 그린다 — 화면이 아니라 붙박이 값이라, 참고와 다른
  // 상태를 들고 있으면 `design:diff` 가 문구 차이도 상태 차이도 똑같이 빨갛게 칠한다.
  // `design/screens/F16.html` 은 **둘 켜짐**(흔한 쪽)을 그린다. 하나만 켜면 「마지막 하나」
  // 상태가 되어 켜진 행 부제가 `켜져 있어. 하나는 켜 둬` 로 갈린다 — 그 상태는 참고가 없어서
  // 어차피 못 재고, 문구는 design/SCREENS.md 의 표가 지킨다.
  let active: Lang3[] = ["ja", "es"];
  let retention = 30;

  // 디자인 미리보기(로컬 pnpm design:check 전용). 다른 화면과 같은 규칙으로 예시 데이터를 쓴다.
  if (!isDesignPreview()) {
    const user = await currentUser();
    if (!user) redirect("/");
    const { settings } = await getSettings(user.id);
    active = enabledLanguages(settings);
    email = user.email;
    retention = await withUser(user.id, async (tx) => {
      const { rows } = await tx.query<{ voice_retention_days: number }>("SELECT voice_retention_days FROM users WHERE id = $1", [user.id]);
      return rows[0]?.voice_retention_days ?? 30;
    });
  }

  return (
    <Screen where="설정" up="/today" fixed={fixed === "1"}>
      {/*
        위 간격 24 · 카드 사이 10 은 참고에서 읽은 값이다 (`design/screens/F16.html`).
      */}
      <Space h={24} />
      {/*
        **제목은 화면 이름이 아니라 「여기 무엇이 있나」다.** 전에는 상단 라벨도 "설정", 제목도
        "설정" 이라 같은 이름을 두 번 불렀다 — 다른 화면은 안 그렇다(홈은 라벨 `홈` + 제목
        `오늘 만날 것`). 문구는 디자인이 셋을 그려 고르고 PM 이 확정했다.

        크기는 `lg`(28)가 아니라 기본(26)이다. `tokens.css` 가 둘을 갈라 뒀고 참고 49장에서
        28 을 쓰는 것은 홈(F01)뿐이다 — F03 에서 고친 것과 같은 자리다.
      */}
      <Title>켠 언어와 내 데이터</Title>
      {/* 제목 26 → 18 → 카드 (design/screens/F16.html 을 열어 읽은 값: `height: 24px` · 26px · `height: 18px`).
          22 였을 때 카드가 4px 아래에 서서 아래 전부가 그만큼 밀렸다. */}
      <Space h={18} />
      {/*
        카드 꼴은 F03 과 같다 — 참고가 `padding: 4px 20px` · 라벨 `padding-top: 14px` · 행 `14px 0`
        으로 똑같이 그려져 있다. 열어서 확인했다.
      */}
      <Card group>
        <Label>언어</Label>
        <LanguageRows enabled={active} />
      </Card>
      <Space h={10} />
      <Card group>
        <Label>계정</Label>
        <Row title={email} sub="Google 로그인 · 기본 비공개" />
        <form action={signOut}>
          <Row title="로그아웃" sub="이 기기에서만" submit />
        </form>
        <Row title="음성 보관 기간" sub={`녹음 원본은 ${retention}일 뒤 지움. 억양 곡선은 남아`} />
        <Row title="전체 내보내기" sub="내 데이터 전부를 JSON 파일 하나로" href="/api/export" plain />
        <Row title="계정 삭제" sub="데이터와 백업 사본까지. 되돌릴 수 없어" href="/settings/delete" />
      </Card>
      <Grow />
      <Button href="/today">홈으로</Button>
    </Screen>
  );
}
