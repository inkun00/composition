import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prd = await readFile(path.join(root, "PRD.md"), "utf8");
const rowPattern = /^\| (H\d{3}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm;
const rows = [...prd.matchAll(rowPattern)].map((match) => ({
  id: match[1].trim(),
  teacherName: match[2].trim(),
  mood: match[3].trim(),
  original: match[4].trim(),
  bars: match[5].trim().split("│").map((bar) => bar.trim().split("→").map((chord) => chord.trim()))
}));

if (rows.length !== 100) {
  throw new Error(`PRD에서 화음 진행 100개를 찾지 못했습니다. 현재 ${rows.length}개입니다.`);
}

for (const row of rows) {
  if (row.bars.length !== 4) throw new Error(`${row.id}의 4마디 배치가 올바르지 않습니다.`);
}

const output = `// PRD.md의 공식 화음 표에서 자동 생성합니다. 직접 수정하지 마세요.\n` +
  `export type HarmonyTheoryRow = Readonly<{\n` +
  `  id: string;\n  teacherName: string;\n  mood: string;\n  original: string;\n` +
  `  bars: readonly (readonly string[])[];\n}>;\n\n` +
  `export const HARMONY_THEORY: readonly HarmonyTheoryRow[] = ${JSON.stringify(rows, null, 2)};\n`;

await writeFile(path.join(root, "src/music/harmonyTheory.generated.ts"), output, "utf8");
console.log(`화음 진행 ${rows.length}개를 생성했습니다.`);
