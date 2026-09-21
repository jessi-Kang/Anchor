/**
 * 피치 검출. **브라우저와 스크립트가 같은 이 함수를 쓴다** — 두 벌이 되면 화면이 그리는 곡선과
 * 측정이 재는 곡선이 다른 알고리즘에서 나오고, 그때 숫자가 뜻을 잃는다.
 * 입력은 PCM 한 채널과 표본율이라 브라우저 밖에서도 돌아간다(디코딩만 해 주면 된다).
 */
export type PitchPoint = { t: number; f0: number };

/**
 * 피치 검출 (브라우저): 40ms 창, 자기상관 최대점. 80~500Hz. 무성 구간은 f0 0.
 * 정밀한 알고리즘은 다음 단계(곡선 비교). 지금은 "올라가는지 내려가는지"가 보이면 된다.
 */
export function pitchTrack(x: Float32Array, sr: number): PitchPoint[] {
  const win = Math.floor(sr * 0.04);
  const hop = Math.floor(sr * 0.02);
  const minLag = Math.floor(sr / 500);
  const maxLag = Math.floor(sr / 80);
  const out: PitchPoint[] = [];
  for (let start = 0; start + win < x.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < win; i++) energy += x[start + i] * x[start + i];
    if (energy / win < 1e-4) {
      out.push({ t: Math.round((start / sr) * 1000), f0: 0 });
      continue;
    }
    let bestLag = 0;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < win - lag; i++) sum += x[start + i] * x[start + i + lag];
      const r = sum / energy;
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    out.push({ t: Math.round((start / sr) * 1000), f0: best > 0.3 && bestLag ? Math.round((sr / bestLag) * 10) / 10 : 0 });
  }
  // 튀는 점을 중앙값으로 눌러 곡선이 읽히게
  return out.map((p, i, a) => {
    if (p.f0 === 0) return p;
    const nb = [a[i - 1]?.f0, p.f0, a[i + 1]?.f0].filter((v): v is number => typeof v === "number" && v > 0).sort((u, v) => u - v);
    return { t: p.t, f0: nb[Math.floor(nb.length / 2)] };
  });
}

