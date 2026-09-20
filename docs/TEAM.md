# 세션 운영 규칙 (누가 무엇을 소유하는가)

Anchor 는 사람 1명(Jessi)과 여러 Claude 세션이 동시에 만든다. 세션은 서로의 작업 트리를 볼 수 없고 브랜치로만 만난다.
그래서 **소유권·통합 순서·완결 기준**을 여기에 적는다. 화면 순서는 `docs/FLOW.md`, 왜는 `docs/SPEC.md`, 이 파일은 "누가 어디를 고치는가".

## 1. 멤버와 소유 영역

세션 이름은 `Anchor · <역할>` 하나로 통일한다. 서로를 부를 때도 이 이름을 쓴다(예전의 `Plan_main`·`UX_QA`·`Dev` 같은 별칭은 쓰지 않는다).
세션끼리 메시지를 보낼 때는 이름이 아니라 세션 ID 가 주소다: `create_trigger(persistent_session_id=<ID>, 스케줄 없음)` + `fire_trigger`.

| 이름 | 하는 일 | 이 세션만 고치는 곳 | 브랜치 | 세션 ID |
| --- | --- | --- | --- | --- |
| **Anchor · PM (조율)** | 결정·우선순위·통합 순서·완결 판정. 코드/디자인/기획 문서를 직접 고치지 않는다 | `docs/TEAM.md` | `claude/affectionate-brahmagupta-947f48` | `session_01QPJ4i1hJ5zENanv7ykjp1t` |
| **Anchor · 기획** | 화면 순서·목적·나가는 길·문구 의도 | `docs/SPEC.md` · `docs/FLOW.md` · `docs/SITEMAP.md` · `README.md` | `claude/create-readme-vibelog-9c5xnb` | `session_01GLHC1ArhYJTqPuDysDoSWt` |
| **Anchor · 디자인** | 화면의 모양, 참고 HTML, 토큰, 로고 | `design/**` | `claude/nice-lovelace-9aaqtf` | `session_01PvJ2dicM8k7dndU4smUys1` |
| **Anchor · 개발** | 코드 전부. 버그 수정도 여기서만 | `src/**` · `db/**` · `scripts/**` · `package.json` | `claude/serene-pasteur-hflx6o` | `session_019gYCLNic9TA9jvmQikfhfk` |
| **Anchor · QA** | 실제로 써 보고 결함을 찾는다. **코드를 고치지 않는다** | (없음. 읽기 전용) | `claude/optimistic-hopper-kaafdu` | `session_01QxSgxQRsFT1grCVZrxTEhi` |
| ~~Anchor · 버그픽스~~ | 개발로 통합, 종료. 브랜치만 남긴다 | — | `claude/gallant-clarke-qt36ez` | `session_01ANSrRXJkcbqr7SwicPUVpM` |

모든 세션에 `anchor` 태그가 붙어 있다. 명단을 다시 볼 때는 `list_sessions(tags=["anchor"])`.

보내는 길:
- QA 가 찾은 것 → 코드 결함은 **개발**, 기획 문제는 **PM**. QA 가 두 곳에 같은 건을 보내지 않는다.
- 디자인이 화면 순서·화면 추가/삭제·문구 의도를 바꾸고 싶으면 → **PM**. PM 이 결정하고 **기획**이 `docs/FLOW.md` 에 반영한 뒤 **개발**에 알린다.
- 개발이 기획 문서와 다르게 만들어야 할 이유를 찾으면 → **PM**. 혼자 판단해서 문서와 다르게 만들지 않는다.
- 남의 영역이 고쳐져야 하면 직접 고치지 말고 그 세션에 요청한다. 두 세션이 같은 파일을 고치면 둘 중 하나는 반드시 버려진다.

## 2. 브랜치와 통합

- `main` 이 프로덕션. 세션마다 자기 작업 브랜치.
- **작업 단계가 끝나면 그 자리에서 푸시한다.** 세션 컨테이너는 사라지고, 푸시하지 않은 커밋은 같이 사라진다.
- 푸시 전에 `git merge origin/main` → `pnpm typecheck && pnpm lint && pnpm build` → 통과하면 `main` 에도 푸시.
- fast-forward 가 안 되면 `main` 을 자기 브랜치로 merge 한 뒤 푸시한다. 남의 커밋을 되돌리거나 force-push 하지 않는다.
- 기준 문서(`docs/FLOW.md`)가 바뀌면 기획 세션이 Dev·디자이너에게 알린다. 코드가 문서와 다르면 코드가 틀린 것이다.

## 3. 완결 기준 (이게 되면 1차 완결)

`docs/FLOW.md` 1장의 첫 방문 경로가 실제로 끝까지 돈다.

1. 로그인 → 언어 → 예시 자료 → 뽑기 → 가나 1회 → 카드(F04 + 장면 5) → 말하기 → 그래프 → 홈
2. 404 0건, 어느 화면에서도 홈까지 2탭, 5분 안
3. `pnpm typecheck && pnpm lint && pnpm build` 통과, Vercel 프로덕션 배포 성공
4. UX_QA 가 같은 경로를 초기화된 계정으로 돌려 "막힘" 등급 결함 0건

그다음이 영어 대화 루프(F13~F14) → 재만남(F12) → 하루 끝(F15).

## 4. 우선순위

| 순위 | 무엇 | 누구 |
| --- | --- | --- |
| P0 | 폐기 단계 걷어내기 + F02 자료 넣기 + F03 뽑기 (첫 5분 경로의 앞쪽) | Dev, 디자이너 |
| P1 | O03 가나 1회 게이트 + F04 → Scene1~5 → F10 → F11 | Dev, 디자이너 |
| P2 | F01 홈 · 설정 · not-found/error · 빈 상태 | Dev, 디자이너 |
| P3 | 영어 대화 루프 F13~F14 | Dev |

P0 이 끝나기 전에 P3 를 시작하지 않는다. 화면 하나가 끝날 때마다 커밋하고 푸시한다.
