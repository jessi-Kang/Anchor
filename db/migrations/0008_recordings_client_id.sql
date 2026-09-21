-- 0008_recordings_client_id.sql — 재전송이 회차를 부풀리지 못하게 멱등 키를 둔다
--
-- **왜 지금.** 저장 실패 재전송(outbox)이 서면 README 의 약속("녹음 한 번도 잃지 않는다")이 지켜지는데,
-- 순진하게 붙이면 **다른 약속이 깨진다.** `/api/recordings` 는 회차를 `count(*)+1` 로 세므로,
-- 서버는 성공했는데 응답이 끊겨 브라우저가 다시 보낸 건이 **새 회차로 앉는다.** 5회차 자리에
-- 4회차 소리가 앉으면 곡선 통과 기준("거리(1회차) > 거리(5회차)", docs/MEASURE.md 2장)이 그 자리에서
-- 아무 말도 안 하게 된다. 유실을 막으려다 측정을 깨는 꼴이다.
--
-- **키는 브라우저가 만든다.** 녹음을 만든 그 순간에 붙이고, 같은 녹음을 몇 번을 다시 보내도 같은 값이다.
-- 서버가 만들면 재전송마다 달라져서 아무것도 못 막는다.
--
-- nullable 이다. 키 없이 오는 요청은 전과 똑같이 동작한다 — 재전송이 서기 전에 저장된 회차와,
-- 키를 못 만드는 브라우저가 있다. **키가 없다고 녹음을 버리지 않는다.**
ALTER TABLE recordings ADD COLUMN client_id text;

-- 부분 유니크: 키가 있는 행끼리만 겹치지 않는다. 계정을 같이 묶어 남의 키와 부딪히지 않게 한다.
CREATE UNIQUE INDEX recordings_client_uq ON recordings (user_id, client_id) WHERE client_id IS NOT NULL;

-- GRANT 는 표 단위라 새 칸에 그대로 걸린다. RLS 정책도 칸을 안 본다.
