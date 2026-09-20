import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

// 디자인 시스템: Noto Sans KR / Noto Sans JP 만. 세리프·모노스페이스 금지.
const notoKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-kr",
  display: "swap",
});
const notoJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-jp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anchor",
  description: "내가 읽고 들은 것에서 시작하는 영어·일본어·스페인어",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F6F6F7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${notoKR.variable} ${notoJP.variable}`}>
      <body>{children}</body>
    </html>
  );
}
