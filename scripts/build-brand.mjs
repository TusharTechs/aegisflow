// Rasterizes the brand SVGs into the PNGs the README and app reference.
//   node scripts/build-brand.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const B = "docs/brand";
const read = (p) => readFileSync(p);

const jobs = [
  // README wordmarks (2x for retina)
  [`${B}/wordmark-light.svg`, `${B}/wordmark-light.png`, { width: 600 }],
  [`${B}/wordmark-dark.svg`, `${B}/wordmark-dark.png`, { width: 600 }],
  // Standalone mark
  [`${B}/aegisflow-mark.svg`, `${B}/aegisflow-mark.png`, { width: 512 }],
  // Apple touch icon: mark centred on white, rounded by the OS
  [`${B}/aegisflow-mark.svg`, "app/apple-icon.png", { width: 160, pad: 180, bg: "#ffffff" }],
  // App favicon PNG fallback (Next serves app/icon.svg + app/icon.png)
  ["app/icon.svg", "app/icon.png", { width: 96 }],
  // OpenGraph / social preview (both the docs copy and the served copy)
  ["__og__", "docs/brand/og.png", {}],
  ["__og__", "public/og.png", {}],
];

const OG = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0B1220"/>
  <rect width="1200" height="6" fill="#2563EB"/>
  <g transform="translate(96,150) scale(2.1)">
    ${readFileSync(`${B}/wordmark-dark.svg`, "utf8").replace(/<\?xml.*?\?>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}
  </g>
  <text x="100" y="430" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#F8FAFC">AI incident response for critical procurement.</text>
  <text x="100" y="486" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="30" fill="#94A3B8">The AI does the four hours of investigation. A human keeps the pen.</text>
  <text x="100" y="560" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="22" fill="#64748B">SerpApi · Nutrient · Doctavian · Foxit · Xano · Gemini</text>
</svg>`;

for (const [src, out, opts] of jobs) {
  let img;
  if (src === "__og__") {
    img = sharp(Buffer.from(OG));
  } else if (opts.pad) {
    const mark = await sharp(read(src)).resize(opts.width).png().toBuffer();
    img = sharp({
      create: { width: opts.pad, height: opts.pad, channels: 4, background: opts.bg },
    }).composite([{ input: mark, gravity: "center" }]);
  } else {
    img = sharp(read(src)).resize(opts.width);
  }
  await img.png().toFile(out);
  console.log("→", out);
}
