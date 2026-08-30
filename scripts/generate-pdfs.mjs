import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let content = "BT /F1 10 Tf 50 780 Td 14 TL\n";
  for (const line of lines) content += `(${esc(line)}) Tj T*\n`;
  content += "ET";

  const objects = [];
  objects[1] = "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n";
  objects[2] = "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n";
  objects[3] =
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n";
  objects[4] = "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n";
  objects[5] = `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj\n`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pdf.length;
    pdf += objects[i];
  }
  const xrefPos = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return pdf;
}

const registry = JSON.parse(readFileSync(new URL("../data/demo/documents.json", import.meta.url), "utf8"));
mkdirSync("public/docs", { recursive: true });
for (const doc of registry) {
  writeFileSync(`public/docs/${doc.id}.pdf`, makePdf(doc.lines), "latin1");
  console.log(`wrote public/docs/${doc.id}.pdf`);
}