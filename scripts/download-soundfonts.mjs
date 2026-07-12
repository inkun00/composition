import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "public", "soundfonts", "musescore-general");

const files = [
  {
    name: "MuseScore_General.sf2",
    url: "https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2",
    minBytes: 200_000_000
  },
  {
    name: "MuseScore_General_License.md",
    url: "https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md",
    minBytes: 2_000
  },
  {
    name: "MuseScore_General_Readme.md",
    url: "https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_Readme.md",
    minBytes: 2_000
  }
];

await mkdir(output, { recursive: true });

for (const file of files) {
  const target = join(output, file.name);
  const existing = await stat(target).catch(() => null);
  if (existing && existing.size >= file.minBytes) {
    console.log(`${file.name}: already present (${existing.size} bytes)`);
    continue;
  }
  const response = await fetch(file.url);
  if (!response.ok || !response.body) throw new Error(`${file.name} download failed: ${response.status}`);
  await pipeline(response.body, createWriteStream(target));
  const downloaded = await stat(target);
  if (downloaded.size < file.minBytes) throw new Error(`${file.name} is too small: ${downloaded.size}`);
  console.log(`${file.name}: ${downloaded.size} bytes`);
}

await writeFile(join(output, "NOTICE.txt"), [
  "MuseScore General SoundFont",
  "Source: https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/",
  "License: MIT, see MuseScore_General_License.md",
  ""
].join("\n"));
