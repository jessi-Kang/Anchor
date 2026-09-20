import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import s from "./ui.module.css";

/**
 * 공통 레이아웃 컴포넌트. design/screens/*.html 의 인라인 스타일을 토큰 기반 클래스로 옮긴 것.
 * 화면 하나 = 이 컴포넌트들의 조합. 새 스타일이 필요하면 여기와 ui.module.css 에 추가하고,
 * 페이지 파일에 인라인 스타일을 쓰지 않는다.
 */

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");

/** 화면 뼈대. `where` 가 상단 왼쪽 "지금 어디", `aside` 가 오른쪽(시간 등). */
export function Screen({
  where,
  aside,
  progress,
  fixed,
  children,
}: {
  where: string;
  aside?: ReactNode;
  /** 카드 모드 진행 막대: [완료 칸 수, 전체 칸 수] */
  progress?: [number, number];
  /** 참고 HTML 과 픽셀 비교할 때 844px 고정 */
  fixed?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={cx(s.screen, fixed && s.screenFixed)}>
      <div className={s.topBar}>
        <span>{where}</span>
        <span>{aside}</span>
      </div>
      {progress && (
        <div className={s.progress} aria-label={`${progress[0]} / ${progress[1]}`}>
          {Array.from({ length: progress[1] }, (_, i) => (
            <span key={i} className={cx(s.progressCell, i < progress[0] && s.progressCellDone)} />
          ))}
        </div>
      )}
      {children}
    </main>
  );
}

export function Grow() {
  return <div className={s.grow} />;
}

export function Space({ h }: { h: number }) {
  return <div style={{ height: h }} aria-hidden />;
}

export function Title({ children, lg }: { children: ReactNode; lg?: boolean }) {
  return <div className={cx(s.title, lg && s.titleLg)}>{children}</div>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <div className={s.lead}>{children}</div>;
}

export function Card({
  children,
  tint,
  list,
  style,
}: {
  children: ReactNode;
  /** 강조 카드 (tint2 배경) */
  tint?: boolean;
  /** 행(Row) 목록용 패딩 */
  list?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className={cx(s.card, tint && s.cardTint, list && s.cardList)} style={style}>
      {children}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className={s.label}>{children}</div>;
}

export function Row({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className={s.row}>
      <div className={s.rowText}>
        <span className={s.rowTitle}>{title}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
      </div>
      {right}
    </div>
  );
}

export function Pill({ children, on }: { children: ReactNode; on?: boolean }) {
  return <span className={cx(s.pill, on && s.pillOn)}>{children}</span>;
}

/** 글자 강조: 색이 아니라 배경 틴트로 */
export function Mark({ children }: { children: ReactNode }) {
  return <span className={s.mark}>{children}</span>;
}

type ButtonProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  outline?: boolean;
  type?: "button" | "submit";
};

/** 화면당 주 버튼 1개. href 가 있으면 링크, 없으면 버튼. */
export function Button({ children, href, onClick, disabled, outline, type = "button" }: ButtonProps) {
  const cls = cx(s.button, outline && s.buttonOutline);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** 회색 텍스트 보조 링크. 화면당 최대 1개. */
export function Ghost({ children, href, onClick }: { children: ReactNode; href?: string; onClick?: () => void }) {
  if (href) {
    return (
      <Link href={href} className={s.ghost}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={s.ghost} onClick={onClick}>
      {children}
    </button>
  );
}

export function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.8 19.8 8.1 22 12 22z" />
      <path fill="#FBBC05" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.5H3.1C2.4 8.9 2 10.4 2 12s.4 3.1 1.1 4.5l3.3-2.6z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8C17 3.1 14.7 2 12 2 8.1 2 4.8 4.2 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6z" />
    </svg>
  );
}

/* ── 온보딩에서 추가된 뼈대 ─────────────────────────────────────────────────── */

/** 목록 카드 안의 묶음: 제목 + 내용 (O02 언어별 칩) */
export function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className={s.group}>
      <span className={s.groupTitle}>{title}</span>
      {children}
    </div>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <div className={s.chips}>{children}</div>;
}

/** 선택 칩. 켜지면 배경 틴트. */
export function Chip({ children, on, onClick }: { children: ReactNode; on?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={cx(s.chip, on && s.chipOn)} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

export function Tiles({ children }: { children: ReactNode }) {
  return <div className={s.tiles}>{children}</div>;
}

/** 92px 정사각 타일 (가나·한자 표시). 일본어 폰트. */
export function Tile({ children, on, lang = "ja" }: { children: ReactNode; on?: boolean; lang?: string }) {
  return (
    <div className={cx(s.tile, on && s.tileOn)} lang={lang}>
      {children}
    </div>
  );
}

/** 상태 카드: 점 + 한 줄 (+ 오른쪽 Pill) */
export function Status({ children, right, dot }: { children: ReactNode; right?: ReactNode; dot?: "on" | "off" }) {
  return (
    <div className={s.status}>
      <div className={s.statusRow}>
        <span className={s.statusText}>
          {dot && <span className={cx(s.dot, dot === "off" && s.dotOff)} aria-hidden />}
          <span>{children}</span>
        </span>
        {right}
      </div>
    </div>
  );
}

/** 버튼 두 개 나란히. 왼쪽은 outline, 오른쪽이 주 버튼. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <div className={s.buttonRow}>{children}</div>;
}

/** 확정 로고 A안 마크 (design/logo/anchor-mark.svg). 새로 그리지 않는다. */
export function LogoMark({ size = 72 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- 정적 SVG, 최적화 불필요
  return <img src="/logo/anchor-mark.svg" alt="" width={size} height={size} className={s.logoMark} style={{ width: size, height: size }} />;
}

export const uiStyles = s;
