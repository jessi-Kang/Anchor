-- pg_restore --no-privileges 후 역할·권한·RLS 재적용 (docs/BACKUP.md 절차 C-3)
-- 0001 의 역할/권한 블록 + 0002 전체. 0002 를 바꾸면 이 파일도 같이 바꾼다.
-- 실행 전 :app_password 를 넘긴다:  psql ... -v app_password='...' -f db/recovery/reapply-roles-and-rls.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anchor_app') THEN
    EXECUTE format('CREATE ROLE anchor_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
                   current_setting('anchor.app_password', true));
  END IF;
END $$;

GRANT CONNECT ON DATABASE neondb TO anchor_app;
GRANT USAGE ON SCHEMA public TO anchor_app;
GRANT USAGE ON SCHEMA app TO anchor_app;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO anchor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, inputs, nodes, edges, user_node_state, cards, chunks, recordings, encounters
  TO anchor_app;
GRANT INSERT ON account_deletions TO anchor_app;

-- 정책은 덤프에 포함되어 있을 수 있다(pg_dump 는 POLICY 를 스키마로 취급). 있으면 지우고 다시 만든다.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

\i db/migrations/0002_rls.sql
