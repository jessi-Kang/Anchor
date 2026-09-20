import { Screen, Title, Grow, Button } from "@/components/ui";

/**
 * 없는 주소. 한국어 한 줄, 버튼은 "홈으로" 하나 (docs/FLOW.md 1′장).
 * 서비스 전체가 "화면" 으로 돈다 — 여기만 "페이지" 라고 부르면 다른 것을 가리키는 말로 읽힌다.
 * 상단 라벨 "없는 화면" 은 장소 이름이라 그대로 둔다.
 */
export default function NotFound() {
  return (
    <Screen where="없는 화면">
      <Grow />
      <Title>이 화면은 없어.</Title>
      <Grow />
      <Button href="/today">홈으로</Button>
    </Screen>
  );
}
