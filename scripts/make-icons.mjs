// src/app/icon.svg(원본 벡터) 하나로 파비콘·홈화면 아이콘·공유 미리보기 이미지를 전부 만든다.
//   node scripts/make-icons.mjs
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const svg = readFileSync("src/app/icon.svg");
const render = (size, input = svg) => sharp(input, { density: 600 }).resize(size, size).png();

/** PNG 여러 장을 ICO 컨테이너로 묶는다 (Vista 이후 브라우저는 PNG 항목을 지원) */
function toIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = [];
  const bodies = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    dir.push(e);
    bodies.push(buf);
  }
  return Buffer.concat([header, ...dir, ...bodies]);
}

// 홈 화면용(maskable): 기기가 모서리를 깎으므로 내용을 80% 로 줄이고 흰 바탕을 꽉 채운다
async function maskable(size) {
  const inner = await render(Math.round(size * 0.8)).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toBuffer();
}

// 링크 공유 미리보기(1200×630)
async function ogImage() {
  const icon = await render(360).toBuffer();
  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <text x="500" y="300" font-family="Helvetica, Arial, sans-serif" font-size="120" font-weight="700" fill="#1e3a8a">MCQuiz</text>
    <text x="504" y="380" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#475569">객관식 문제를 올리면 바로 퀴즈로</text>
  </svg>`);
  return sharp({ create: { width: 1200, height: 630, channels: 4, background: "#eff6ff" } })
    .composite([{ input: icon, left: 100, top: 135 }, { input: text, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

mkdirSync("public/icons", { recursive: true });
const ico = toIco(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await render(size).toBuffer() }))));
writeFileSync("src/app/favicon.ico", ico);
await render(180).toFile("src/app/apple-icon.png");
await render(192).toFile("public/icons/icon-192.png");
await render(512).toFile("public/icons/icon-512.png");
writeFileSync("public/icons/icon-maskable-512.png", await maskable(512));
writeFileSync("src/app/opengraph-image.png", await ogImage());
console.log("icons written");
