-- 0006_node_cards.sql — 발견 카드 문안 캐시 (공용, 사용자 데이터 아님)
--
-- 한자 하나의 카드 문안(후킹·부품 뜻·추측 질문·정답·착지·패턴)은 사전 데이터에서 만든 공용 내용이다.
-- 손으로 적은 것은 db/seed/kanji-cards.json 이 nodes.meta.card 로 들어가고, 없는 한자는 Claude API 가 만든다.
-- 앱 역할(anchor_app)은 공용 nodes 를 고칠 수 없으므로(RLS: 본인 노드만) 생성 결과는 이 표에 둔다.
-- 사용자 자료는 넣지 않는다: 키는 한자 노드, 값은 카드 문안뿐. 그래서 정책은 "누구나 읽고 쓴다".
-- /api/health 의 "모든 표에 RLS" 확인을 위해 RLS 는 켜고, 정책으로 연다.

CREATE TABLE node_cards (
  node_id     uuid PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  card        jsonb NOT NULL,
  source      text NOT NULL DEFAULT 'claude',   -- 'claude' | 'fallback'
  model       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER node_cards_touch BEFORE UPDATE ON node_cards
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE node_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY node_cards_shared ON node_cards FOR ALL TO anchor_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON node_cards TO anchor_app;
