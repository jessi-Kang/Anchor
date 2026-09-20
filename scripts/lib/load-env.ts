import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/** .env.local → .env 순으로 읽어 process.env 에 없는 키만 채운다. 의존성 없이 최소 구현. */
export function loadEnv(cwd = process.cwd()) {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(cwd, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith("#")) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
