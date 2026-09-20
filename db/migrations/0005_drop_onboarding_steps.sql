-- 0005_drop_onboarding_steps.sql — 준비 단계(상황·단계 상태)를 settings 에서 지운다
--
-- 2026-09-20 플로우 점검(docs/FLOW.md 5장)으로 상황 고르기와 씨앗·단계 개념을 폐기했다.
-- 남기는 것: languages[lang].enabled_at (켠 언어와 순서), kana (가나 읽기 결과).
-- 지우는 것: languages[lang].purposes, steps, kana_module.
--
-- kana 는 옛 형태 {recognized,total,passed,supported,checked_at} 에 status 가 없다.
-- passed=true → 'passed', kana_module=true → 'locked', 그 외 → 'recheck' 로 바꿔 새 형태에 맞춘다.
-- 멱등: 두 번 실행해도 결과가 같다.

UPDATE users
SET settings = (settings - 'steps'::text - 'kana_module'::text)
  || CASE WHEN settings ? 'languages' THEN jsonb_build_object(
       'languages',
       coalesce((SELECT jsonb_object_agg(k, v - 'purposes'::text) FROM jsonb_each(settings->'languages') AS e(k, v)), '{}'::jsonb))
     ELSE '{}'::jsonb END
  || CASE WHEN settings ? 'kana' AND NOT (settings->'kana' ? 'status') THEN jsonb_build_object(
       'kana',
       ((settings->'kana') - 'passed'::text) || jsonb_build_object(
         'status',
         CASE WHEN coalesce((settings->'kana'->>'passed')::boolean, false) THEN 'passed'
              WHEN coalesce((settings->>'kana_module')::boolean, false) THEN 'locked'
              ELSE 'recheck' END))
     ELSE '{}'::jsonb END
WHERE settings ? 'steps' OR settings ? 'kana_module'
   OR (settings ? 'kana' AND NOT (settings->'kana' ? 'status'))
   OR EXISTS (SELECT 1 FROM jsonb_each(coalesce(settings->'languages', '{}'::jsonb)) AS e(k, v) WHERE v ? 'purposes');
