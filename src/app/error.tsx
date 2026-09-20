"use client";

import { useEffect } from "react";
import { Screen, Space, Title, Lead, Grow, Button, Ghost } from "@/components/ui";

/** 렌더 중 오류. 한국어 한 줄, 주 버튼 "홈으로", 이탈 "다시 시도" (docs/FLOW.md 1′장). */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Screen where="문제가 생겼어">
      <Grow />
      <Title>잠깐 문제가 생겼어.</Title>
      <Space h={6} />
      <Lead>방금 한 건 저장돼 있어.</Lead>
      <Grow />
      <Button href="/today">홈으로</Button>
      <Ghost onClick={reset}>다시 시도</Ghost>
    </Screen>
  );
}
