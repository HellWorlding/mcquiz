import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { Nav } from "@/domains/auth/components/Nav";

const font = Noto_Sans_KR({ variable: "--font-app", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: { default: "mcquiz", template: "%s · mcquiz" },
  description: "객관식(4지·5지선다) 문제를 올리면 바로 퀴즈로 풀 수 있는 앱",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${font.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-4">{children}</main>
      </body>
    </html>
  );
}
