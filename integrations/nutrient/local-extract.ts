import fs from "fs/promises";

export async function extractTextLocal(pdfPath: string): Promise<string> {
  const buf = await fs.readFile(pdfPath);
  const raw = buf.toString("latin1");
  const out: string[] = [];
  const re = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    out.push(m[1].replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\"));
  }
  return out.join("\n");
}