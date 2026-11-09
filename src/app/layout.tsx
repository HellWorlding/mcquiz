import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { Nav } from "@/domains/auth/components/Nav";
import { LangProvider } from "@/domains/shared/i18n-client";
import { getLang } from "@/domains/shared/i18n-server";
import { t } from "@/domains/shared/i18n";
import { env } from "@/domains/shared/env";

const font = Noto_Sans_KR({ variable: "--font-app", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(`https://${process.env.NEXT_PUBLIC_CANONICAL_HOST || "mcquiz.site"}`),
  title: { default: "MCQuiz", template: "%s · MCQuiz" },
  description: "객관식(4지·5지선다) 문제를 올리면 바로 퀴즈로 풀 수 있는 앱",
  applicationName: "MCQuiz",
  appleWebApp: { title: "MCQuiz", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${font.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <LangProvider lang={lang}>
          <Nav />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-8 pt-4">{children}</main>
          <footer className="mx-auto w-full max-w-3xl px-4 pb-8 text-center text-xs leading-relaxed text-muted/70">
            {t(lang, "footer.disclaimer", { email: env.adminEmail || "" })}
          </footer>
        </LangProvider>
      </body>
    </html>
  );
}
