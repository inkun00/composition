import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRECTORIES = ["src", "scripts"];
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss"]);
const HARD_LIMIT = 1000;
const WARNING_LIMIT = 800;

// These are frozen ceilings, not permanent exemptions. A legacy file may shrink
// but cannot grow. Remove an entry as soon as the file reaches HARD_LIMIT.
const LEGACY_FROZEN_LIMITS = new Map([
  ["src/App.tsx", 3131],
  ["src/audio/player.ts", 1705],
  ["src/styles.css", 1164]
]);

async function collectCodeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectCodeFiles(absolute);
    return CODE_EXTENSIONS.has(path.extname(entry.name)) ? [absolute] : [];
  }));
  return nested.flat();
}

function relativePath(absolute) {
  return path.relative(root, absolute).replaceAll(path.sep, "/");
}

function physicalLineCount(source) {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/).length;
}

const files = (await Promise.all(
  SOURCE_DIRECTORIES.map((directory) => collectCodeFiles(path.join(root, directory)))
)).flat();

const failures = [];
const warnings = [];

for (const absolute of files) {
  const relative = relativePath(absolute);
  if (relative.includes(".generated.")) continue;

  const lines = physicalLineCount(await readFile(absolute, "utf8"));
  const frozenLimit = LEGACY_FROZEN_LIMITS.get(relative);

  if (frozenLimit !== undefined) {
    if (lines > frozenLimit) {
      failures.push(`${relative}: ${lines}줄 (동결 상한 ${frozenLimit}줄)`);
    } else if (lines > HARD_LIMIT) {
      warnings.push(`${relative}: ${lines}줄 (레거시 동결 상한 ${frozenLimit}줄, 분리 필요)`);
    }
    continue;
  }

  if (lines > HARD_LIMIT) {
    failures.push(`${relative}: ${lines}줄 (제한 ${HARD_LIMIT}줄)`);
  } else if (lines >= WARNING_LIMIT) {
    warnings.push(`${relative}: ${lines}줄 (${WARNING_LIMIT}줄 경고선 도달)`);
  }
}

for (const warning of warnings) {
  console.warn(`경고: ${warning}`);
}

if (failures.length > 0) {
  console.error("\n파일 크기 원칙 위반:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`파일 크기 검사 통과: 수기 코드 ${files.length}개, 파일당 최대 ${HARD_LIMIT}줄`);
}
