import type { MetadataRoute } from "next";

/** 휴대폰 "홈 화면에 추가" 용 웹 앱 매니페스트 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MCQuiz",
    short_name: "MCQuiz",
    description: "객관식(4지·5지선다) 문제를 올리면 바로 퀴즈로 풀 수 있는 앱",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
