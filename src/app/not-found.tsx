import { Screen, Title, Grow, Button } from "@/components/ui";

/** 없는 주소. 한국어 한 줄, 버튼은 "홈으로" 하나 (docs/FLOW.md 1′장). */
export default function NotFound() {
  return (
    <Screen where="없는 화면">
      <Grow />
      <Title>이 페이지는 없어.</Title>
      <Grow />
      <Button href="/today">홈으로</Button>
    </Screen>
  );
}
