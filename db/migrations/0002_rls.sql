-- 0002_rls.sql — Row Level Security
-- 모든 사용자 테이블: ENABLE + FORCE (소유자도 정책을 따른다). 정책은 anchor_app 역할에만 준다.
-- app.current_user_id() 가 NULL 이면 모든 비교가 NULL → false → 어떤 행도 보이지 않는다.

-- users: 본인 행만. INSERT 는 자기 id 로만 (첫 로그인 시 ensureUser).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_self ON users FOR ALL TO anchor_app
  USING (id = app.current_user_id())
  WITH CHECK (id = app.current_user_id());

-- 사용자 소유 테이블 공통 패턴
ALTER TABLE inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inputs FORCE ROW LEVEL SECURITY;
CREATE POLICY inputs_owner ON inputs FOR ALL TO anchor_app
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

ALTER TABLE user_node_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_node_state FORCE ROW LEVEL SECURITY;
CREATE POLICY user_node_state_owner ON user_node_state FOR ALL TO anchor_app
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards FORCE ROW LEVEL SECURITY;
CREATE POLICY cards_owner ON cards FOR ALL TO anchor_app
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY chunks_owner ON chunks FOR ALL TO anchor_app
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings FORCE ROW LEVEL SECURITY;
CREATE POLICY recordings_owner ON recordings FOR ALL TO anchor_app
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters FORCE ROW LEVEL SECURITY;
CREATE POLICY encounters_owner ON encounters FOR ALL TO anchor_app
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

-- nodes / edges: 공용(user_id IS NULL)은 모두 읽기, 쓰기는 본인 것만.
-- 공용 참조 데이터 적재는 admin 연결(scripts/)로만 한다.
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes FORCE ROW LEVEL SECURITY;
CREATE POLICY nodes_read ON nodes FOR SELECT TO anchor_app
  USING (user_id IS NULL OR user_id = app.current_user_id());
CREATE POLICY nodes_write_own ON nodes FOR INSERT TO anchor_app
  WITH CHECK (user_id IS NOT NULL AND user_id = app.current_user_id());
CREATE POLICY nodes_update_own ON nodes FOR UPDATE TO anchor_app
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());
CREATE POLICY nodes_delete_own ON nodes FOR DELETE TO anchor_app
  USING (user_id = app.current_user_id());

ALTER TABLE edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges FORCE ROW LEVEL SECURITY;
CREATE POLICY edges_read ON edges FOR SELECT TO anchor_app
  USING (user_id IS NULL OR user_id = app.current_user_id());
CREATE POLICY edges_write_own ON edges FOR INSERT TO anchor_app
  WITH CHECK (user_id IS NOT NULL AND user_id = app.current_user_id());
CREATE POLICY edges_update_own ON edges FOR UPDATE TO anchor_app
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());
CREATE POLICY edges_delete_own ON edges FOR DELETE TO anchor_app
  USING (user_id = app.current_user_id());

-- account_deletions: 앱은 자기 id 로 INSERT 만. 읽기·수정은 admin 연결만.
ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletions FORCE ROW LEVEL SECURITY;
CREATE POLICY account_deletions_insert_self ON account_deletions FOR INSERT TO anchor_app
  WITH CHECK (user_id = app.current_user_id());
