import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const catalogPath = path.join(root, "src", "music", "openSoundEffects.ts");
const source = fs.readFileSync(catalogPath, "utf8");
const diverseSource = fs.readFileSync(path.join(root, "src", "music", "diverseSoundEffects.ts"), "utf8");
const arrayEnd = source.lastIndexOf("] as const");
const arraySource = source.slice(source.indexOf("["), arrayEnd + 1);
const catalog = Function(`"use strict"; return (${arraySource});`)();
const familyName = (name) => name.replace(/\s+\d+$/, "");
const byFamily = new Map();
const byCategory = new Map();

for (const effect of catalog) {
  const key = `${effect.category}|${familyName(effect.name)}`;
  byFamily.set(key, [...(byFamily.get(key) ?? []), effect]);
  byCategory.set(effect.category, (byCategory.get(effect.category) ?? 0) + 1);
}

const files = fs.readdirSync(path.join(root, "public", "sound-effects", "cc0"))
  .filter((name) => name.endsWith(".ogg"))
  .map((name) => {
    const filePath = path.join(root, "public", "sound-effects", "cc0", name);
    const bytes = fs.readFileSync(filePath);
    return { name, bytes: bytes.length, hash: crypto.createHash("sha256").update(bytes).digest("hex") };
  });
const duplicateHashes = Object.entries(Object.groupBy(files, (file) => file.hash))
  .filter(([, matches]) => matches.length > 1);
const repeatedFamilies = [...byFamily.entries()]
  .filter(([, effects]) => effects.length > 2)
  .sort((first, second) => second[1].length - first[1].length);
const familyLimit = (family) => family.endsWith("|놀이 소리") ? 4 : 3;
const retainedNames = new Set();
const retainedFamilyCounts = new Map();
const prunedCatalog = catalog.filter((effect) => {
  const family = `${effect.category}|${familyName(effect.name)}`;
  const nameKey = `${effect.category}|${effect.name}`;
  const count = retainedFamilyCounts.get(family) ?? 0;
  if (retainedNames.has(nameKey) || count >= familyLimit(family)) return false;
  retainedNames.add(nameKey);
  retainedFamilyCounts.set(family, count + 1);
  return true;
});
const retainedSources = new Set(prunedCatalog.map((effect) => effect.source));
const diverseSources = [...diverseSource.matchAll(/"(\/sound-effects\/curated\/[^"]+)"/g)]
  .map((match) => match[1]);
const activeSources = [...retainedSources, ...diverseSources];
const missingActiveFiles = activeSources.filter((publicPath) =>
  !fs.existsSync(path.join(root, "public", publicPath)));
const invalidAudioFiles = activeSources.filter((publicPath) => {
  const filePath = path.join(root, "public", publicPath);
  if (!fs.existsSync(filePath)) return false;
  const header = fs.readFileSync(filePath).subarray(0, 12);
  if (path.extname(filePath) === ".ogg") return header.subarray(0, 4).toString() !== "OggS";
  if (path.extname(filePath) === ".wav") {
    return header.subarray(0, 4).toString() !== "RIFF" || header.subarray(8, 12).toString() !== "WAVE";
  }
  return true;
});
const retiredFiles = catalog
  .filter((effect) => !retainedSources.has(effect.source))
  .map((effect) => path.join(root, "public", effect.source));

if (process.argv.includes("--prune")) {
  const cc0Root = path.resolve(root, "public", "sound-effects", "cc0");
  for (const filePath of retiredFiles) {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(`${cc0Root}${path.sep}`)) {
      throw new Error(`Refusing to delete outside ${cc0Root}: ${resolved}`);
    }
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  }
}

console.log(JSON.stringify({
  catalogCount: catalog.length,
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  categories: Object.fromEntries([...byCategory.entries()].sort()),
  exactDuplicateGroups: duplicateHashes.length,
  retainedCatalogCount: prunedCatalog.length,
  retiredCatalogCount: catalog.length - prunedCatalog.length,
  curatedCatalogCount: diverseSources.length,
  activeCatalogCount: activeSources.length,
  missingActiveFiles,
  invalidAudioFiles,
  deletedRetiredFiles: process.argv.includes("--prune"),
  repeatedFamilies: repeatedFamilies.map(([family, effects]) => ({
    family,
    count: effects.length,
    ids: effects.map((effect) => effect.id)
  }))
}, null, 2));
