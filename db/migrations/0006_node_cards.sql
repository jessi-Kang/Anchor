-- 0006_node_cards.sql — 발견 카드 문안 캐시 (공용, 사용자 데이터 아님)
--
-- 한자 하나의 카드 문안(후킹·부품 뜻·추측 질문·정답·착지·패턴)은 사전 데이터에서 만든 공용 내용이다.
-- 손으로 적은 것은 db/seed/kanji-cards.json 이 nodes.meta.card 로 들어가고, 없는 한자는 Claude API 가 만든다.
-- 앱 역할(anchor_app)은 공용 nodes 를 고칠 수 없으므로(RLS: 본인 노드만) 생성 결과는 이 표에 둔다.
-- /api/health 의 "모든 표에 RLS" 확인을 위해 RLS 는 켜고, 정책으로 연다.
--
-- 이 표의 내용은 모든 계정의 화면에 그대로 뜬다. 그래서 "사용자 자료는 넣지 않는다" 를 주석이 아니라 정책이 막는다:
-- 읽기는 누구에게나 열고, 쓰기는 공용 노드(nodes.user_id IS NULL)에만 허용한다.
-- 사용자는 자기 개인 노드를 만들 수 있으므로(0002 의 nodes_write_own), 쓰기를 열어 두면
-- 자기 노드 id 로 임의의 문안을 넣어 남의 화면에 띄울 수 있다.

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

CREATE POLICY node_cards_read ON node_cards FOR SELECT TO anchor_app
  USING (true);

CREATE POLICY node_cards_write_public ON node_cards FOR INSERT TO anchor_app
  WITH CHECK (EXISTS (SELECT 1 FROM nodes n WHERE n.id = node_cards.node_id AND n.user_id IS NULL));

-- 캐시 저장은 ON CONFLICT DO UPDATE 라 UPDATE 도 같은 조건으로 연다.
CREATE POLICY node_cards_update_public ON node_cards FOR UPDATE TO anchor_app
  USING (EXISTS (SELECT 1 FROM nodes n WHERE n.id = node_cards.node_id AND n.user_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM nodes n WHERE n.id = node_cards.node_id AND n.user_id IS NULL));

GRANT SELECT, INSERT, UPDATE ON node_cards TO anchor_app;
