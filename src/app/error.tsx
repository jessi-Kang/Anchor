"use client";

import { useEffect } from "react";
import { Screen, Space, Title, Lead, Grow, Button, Ghost } from "@/components/ui";

/** 렌더 중 오류. 한국어 1장, 주 버튼은 "홈으로" 하나, 보조로 다시 시도 (docs/FLOW.md 4장). */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Screen where="문제가 생겼어">
      <Grow />
      <Title>화면을 그리다 멈췄어</Title>
      <Space h={6} />
      <Lead>입력한 건 저장돼 있어. 홈으로 가거나 한 번 더 시도해.</Lead>
      <Grow />
      <Button href="/today">홈으로</Button>
      <Ghost onClick={reset}>다시 시도</Ghost>
    </Screen>
  );
}
