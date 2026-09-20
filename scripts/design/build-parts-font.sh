#!/usr/bin/env bash
# 부품 자리 전용 서브셋 폰트를 다시 만든다. seed 의 부품이 바뀐 날에만 돌린다.
#   bash scripts/design/build-parts-font.sh
#
# 왜 결과물(design/fonts/anchor-parts.woff2)을 레포에 두나: 원본이 20MB 이고 릴리스에서
# 받아야 해서, 빌드 때마다 네트워크를 타면 배포가 남의 릴리스에 묶인다. 5KB 짜리를 넣어 둔다.
#
# 원본: Plangothic P1 (遍黑) — SIL OFL 1.1, 흑체(산세리프). 확장 B 를 덮는 산세리프라서 골랐다.
# Noto Sans CJK 는 53종 중 22종뿐이고 JP·SC·TC·HK·KR 다섯이 같은 글리프 집합이라 합쳐도 늘지 않는다.
#
# 이름을 Plangothic 으로 두지 않는 이유: OFL 의 보류 이름(Reserved Font Name) 조항이다.
# 형식 변환만이면 이름을 유지해도 되지만 서브셋은 수정이라, 다른 이름으로 내고 OFL 을 같이 싣는다.
set -euo pipefail
cd "$(dirname "$0")/../.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

CODES="$(node -e '
const rows = require("./db/seed/kanji.json").items;
const s = new Set();
for (const e of rows) for (const p of e.parts ?? []) for (const ch of [...p]) if (ch.codePointAt(0) > 0xffff) s.add(ch.codePointAt(0));
console.log([...s].sort((a, b) => a - b).map((c) => "U+" + c.toString(16).toUpperCase()).join(","));
')"
echo "글리프 $(tr ',' '\n' <<<"$CODES" | wc -l)자"

curl -sSL -o "$TMP/plan1.ttf" \
  "https://github.com/Fitzgerald-Porthmouth-Koenigsegg/Plangothic_Project/releases/latest/download/PlangothicP1-Regular.ttf"
pyftsubset "$TMP/plan1.ttf" --unicodes="$CODES" --flavor=woff2 \
  --layout-features='' --no-hinting --desubroutinize \
  --output-file=design/fonts/anchor-parts.woff2
ls -la design/fonts/anchor-parts.woff2
