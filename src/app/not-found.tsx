import { Screen, Space, Title, Lead, Grow, Button } from "@/components/ui";

/** 없는 주소. 한국어 1장, 버튼은 "홈으로" 하나 (docs/FLOW.md 4장). */
export default function NotFound() {
  return (
    <Screen where="없는 화면">
      <Grow />
      <Title>이 주소엔 아무것도 없어</Title>
      <Space h={6} />
      <Lead>지워졌거나 잘못 들어온 길이야. 홈에서 다시 시작해.</Lead>
      <Grow />
      <Button href="/today">홈으로</Button>
    </Screen>
  );
}
