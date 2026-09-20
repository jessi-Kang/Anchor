# Claude Code 첫 프롬프트 (그대로 붙여넣기)

이 폴더는 언어학습 웹앱 "Anchor"의 기획 산출물이다. CLAUDE.md를 먼저 읽고, docs/SPEC.md 전체를 읽은 뒤, design/SCREENS.md와 design/screens/ 를 훑어라. 그 다음 아래 순서로 진행하되, 각 단계가 끝날 때마다 멈추고 나에게 보여줘라.

1단계: 프로젝트 골격
- Next.js(App Router, TypeScript) + Neon Postgres + Neon Auth(Google) + Vercel 배포 설정.
- 스키마: users, inputs(붙여넣은 자료), nodes(부품/단어, 언어 무관), edges, user_node_state(knows_sound/knows_meaning/can_say + confidence), cards(생성된 발견 카드와 추측 기록), chunks(대화 덩어리), recordings(피치 데이터만).
- 모든 테이블 user_id + RLS 정책. 마이그레이션 파일로.
- 백업: Neon PITR 확인 + 매일 스냅샷을 외부 스토리지로 내보내는 cron, 전체 내보내기(JSON) 엔드포인트, 계정 삭제 엔드포인트. 이걸 화면보다 먼저 만든다.

2단계: 디자인 시스템
- design/tokens.json을 CSS 변수로. 공통 레이아웃(상단 라벨 / 카드 / 하단 버튼 1개) 컴포넌트.
- design/screens/O01.html을 픽셀 수준으로 재현해서 토큰이 맞는지 확인.

3단계: 온보딩 O01~O04
- O03은 실제 마이크 인식(Web Speech API 또는 서버 STT), O04는 40장 카드에서 "떠올랐어/안 떠올랐어"를 user_node_state에 기록.

4단계: 일본어 발견 카드 F04 → Scene1~5 → F11
- 카드 생성은 Claude API. 입력: 한자 1개 + 사용자의 known 노드. 출력: 후킹 질문(아는 한국어 단어에서 시작), 부품 분해(IDS 기반), 쉬운 일본어 정의(よみがな 포함), 착지 단어 2개(사용자가 아는 한국어 한자어 우선), 음독 패턴 한 줄.
- 추측 입력은 반드시 정답보다 먼저. 정답 화면에서 추측과 나란히.
- 그래프: 다음 카드 = 아는 노드에서 가장 가까운 모르는 노드. F11처럼 시각화 + 범례.

5단계: 영어 대화 루프 F13~F14
- 한국어 한 줄 → Claude API로 태도 기능 분류(SPEC 5장 표) + 영어 덩어리 1~2개 → ElevenLabs TTS(기본 목소리와 voice_id pwjMkbtUbj1hBa0RkN5N 둘 다) → 브라우저 녹음 → 피치 곡선 추출(pitchy 등) → 두 곡선 오버레이 + 한 줄 힌트.
- 텍스트 교정 없음. 규칙 설명 없음.

금지: 레벨 질문 UI, 스트리크/포인트, 공개 프로필, SRS 카드 반복, 세리프/모노 폰트, 채도 높은 색, 한 화면에 여러 단계 합치기.
