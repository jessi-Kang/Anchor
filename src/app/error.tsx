"use client";

import { useEffect } from "react";
import { Screen, Title, Grow, Button, Ghost } from "@/components/ui";

/**
 * 렌더 중 오류. 한국어 한 줄, 주 버튼 "홈으로", 이탈 "다시 시도" (docs/FLOW.md 1′장).
 *
 * **"방금 한 건 저장돼 있어." 는 재전송이 설 때까지 띄우지 않는다.** 그 줄은 위로가 아니라
 * 약속이고, 보낸 것이 실패하면 기기에 남았다가 다시 올라가야 참이 된다 (FLOW 1′장 error 행).
 * 지금은 재전송이 없어서, 이 화면을 본 사람은 안심하고 홈으로 가고 추측과 녹음은 사라진다.
 * 거짓을 며칠 켜 두느니 줄을 뺀다. 재전송이 서는 커밋에서 같이 되살린다.
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    // 상단 라벨은 "지금 어디" 가 오는 자리다. "문제가 생겼어" 를 넣으면 바로 아래 제목과 같은 말을
    // 두 번 하고, 장소가 아닌 것이 장소 자리에 앉는다. 참고 화면(X02.html)의 라벨도 "오류" 다.
    <Screen where="오류">
      <Grow />
      <Title>잠깐 문제가 생겼어.</Title>
      <Grow />
      <Button href="/today">홈으로</Button>
      <Ghost onClick={reset}>다시 시도</Ghost>
    </Screen>
  );
}
