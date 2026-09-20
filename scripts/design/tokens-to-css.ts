/**
 * design/tokens.json → src/app/tokens.css
 *   pnpm design:tokens
 *
 * 토큰 파일이 단일 진실이다. CSS 변수는 손으로 고치지 않고 이 스크립트로만 만든다.
 * 이름 규칙: --color-text1, --font-size-body, --radius-card, --space-screen-pad-x, --button-height, --curve-me, --graph-known
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const src = path.resolve(process.cwd(), "design/tokens.json");
const out = path.resolve(process.cwd(), "src/app/tokens.css");

type Tokens = {
  color: Record<string, string>;
  font: { family: string; weights: number[]; size: Record<string, number> };
  radius: Record<string, number>;
  space: Record<string, number | string>;
  button: Record<string, number>;
  curve: Record<string, string | number>;
  graph: Record<string, string>;
};

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const px = (v: number | string) => (typeof v === "number" ? `${v}px` : v);

const t = JSON.parse(readFileSync(src, "utf8")) as Tokens;
const lines: string[] = [];

lines.push("/* 자동 생성: pnpm design:tokens (원본 design/tokens.json). 손으로 고치지 말 것. */", ":root {");
for (const [k, v] of Object.entries(t.color)) lines.push(`  --color-${kebab(k)}: ${v};`);
lines.push("");
lines.push(`  --font-family: ${t.font.family};`);
for (const [k, v] of Object.entries(t.font.size)) lines.push(`  --font-size-${kebab(k)}: ${px(v)};`);
lines.push("");
for (const [k, v] of Object.entries(t.radius)) lines.push(`  --radius-${kebab(k)}: ${px(v)};`);
lines.push("");
for (const [k, v] of Object.entries(t.space)) lines.push(`  --space-${kebab(k)}: ${px(v)};`);
lines.push("");
for (const [k, v] of Object.entries(t.button)) lines.push(`  --button-${kebab(k)}: ${px(v)};`);
lines.push("");
for (const [k, v] of Object.entries(t.curve)) {
  const name = kebab(k);
  lines.push(`  --curve-${name}: ${name === "stroke-width" ? px(v) : v};`);
}
lines.push("");
for (const [k, v] of Object.entries(t.graph)) lines.push(`  --graph-${kebab(k)}: ${v};`);
lines.push("}", "");

writeFileSync(out, lines.join("\n"));
console.log(`wrote ${path.relative(process.cwd(), out)} (${lines.length - 3} vars)`);
