-- 0003_owner_reads_for_backup.sql — 소유자(관리 연결)는 RLS 를 통과해 전체를 읽는다
--
-- 0002 는 모든 테이블에 FORCE ROW LEVEL SECURITY 를 걸어 소유자도 정책을 따르게 했다.
-- 그런데 정책은 전부 anchor_app 에게만 있어서, 소유자 연결(백업·마이그레이션·복구)은 어떤 행도 볼 수 없었다.
-- 백업이 데이터를 읽지 못하면 백업이 아니다. 그래서 FORCE 만 푼다.
--
-- 앱 역할(anchor_app)의 격리는 그대로다: ENABLE ROW LEVEL SECURITY 와 정책은 변함없고,
-- anchor_app 은 테이블 소유자가 아니므로 정책을 그대로 따른다. /api/health 가 두 가지를 계속 확인한다:
-- (1) 모든 테이블에 RLS 가 켜져 있다, (2) anchor_app 이 BYPASSRLS 가 아니다.

ALTER TABLE users             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE inputs            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE nodes             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE edges             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE user_node_state   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE cards             NO FORCE ROW LEVEL SECURITY;
ALTER TABLE chunks            NO FORCE ROW LEVEL SECURITY;
ALTER TABLE recordings        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE encounters        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE account_deletions NO FORCE ROW LEVEL SECURITY;
