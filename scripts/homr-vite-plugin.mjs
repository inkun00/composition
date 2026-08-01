import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, platform, tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const HOMR_TIMEOUT_MS = 15 * 60 * 1000;
const OUTPUT_LIMIT = 16 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

let installInProgress = false;
let recognitionInProgress = false;

function trimOutput(value) {
  return value.length > OUTPUT_LIMIT ? value.slice(-OUTPUT_LIMIT) : value;
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs ?? 10_000);
    child.stdout.on("data", (chunk) => { stdout = trimOutput(stdout + chunk.toString()); });
    child.stderr.on("data", (chunk) => { stderr = trimOutput(stderr + chunk.toString()); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

async function commandWorks(command, args) {
  try {
    const result = await run(command, args, { timeoutMs: 8_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

async function pythonCommand() {
  const candidates = platform() === "win32" ? ["py", "python"] : ["python3", "python"];
  for (const command of candidates) {
    if (await commandWorks(command, ["--version"])) return command;
  }
  return null;
}

async function uvxCandidates() {
  const candidates = ["uvx"];
  if (platform() === "win32") {
    candidates.push(
      join(homedir(), ".local", "bin", "uvx.exe"),
      join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Links", "uvx.exe")
    );
  } else {
    candidates.push(join(homedir(), ".local", "bin", "uvx"));
  }
  const python = await pythonCommand();
  if (python) {
    try {
      const scriptsPath = await run(python, [
        "-c",
        "import sysconfig; print(sysconfig.get_path('scripts', scheme='nt_user' if __import__('os').name == 'nt' else 'posix_user'))"
      ]);
      const scripts = scriptsPath.stdout.trim();
      if (scripts) candidates.push(join(scripts, platform() === "win32" ? "uvx.exe" : "uvx"));
    } catch {
      // A usable uvx may still exist in PATH or the standard user location.
    }
  }
  return [...new Set(candidates.filter(Boolean))];
}

async function findHomrRunner() {
  if (await commandWorks("homr", ["--help"])) return { kind: "homr", command: "homr" };
  for (const candidate of await uvxCandidates()) {
    if ((candidate === "uvx" || existsSync(candidate)) && await commandWorks(candidate, ["--version"])) {
      return { kind: "uvx", command: candidate };
    }
  }
  return null;
}

function publicStatus(runner, detail) {
  return {
    available: Boolean(runner),
    runner: runner?.kind ?? null,
    platform: platform(),
    detail
  };
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function sendError(response, status, code, message) {
  sendJson(response, status, { code, message });
}

function isTrustedLocalOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  return Boolean(host) && origin === `http://${host}`;
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function safeImageName(request) {
  const encoded = String(request.headers["x-score-filename"] ?? "score.png");
  let decoded = "score.png";
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    // Fall back to a known-safe filename.
  }
  const extension = extname(decoded).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return null;
  const name = basename(decoded, extension).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "score";
  return `${name}${extension}`;
}

async function findMusicXml(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findMusicXml(path);
      if (nested) return nested;
    } else if (/\.(musicxml|xml)$/i.test(entry.name)) {
      return path;
    }
  }
  return null;
}

async function installUv() {
  const python = await pythonCommand();
  if (!python) {
    throw new Error("자동으로 준비하지 못했어요. 앱을 다시 연 뒤 시도해 주세요.");
  }
  const result = await run(python, [
    "-m", "pip", "install", "--user", "--disable-pip-version-check", "uv"
  ], { timeoutMs: 5 * 60 * 1000 });
  if (result.code !== 0) {
    throw new Error("자동으로 준비하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  const runner = await findHomrRunner();
  if (!runner) throw new Error("준비를 마치지 못했어요. 앱을 다시 연 뒤 시도해 주세요.");
  return runner;
}

async function recognizeImage(runner, imagePath, workingDirectory) {
  const args = runner.kind === "uvx"
    ? ["--python", "3.11", "homr", imagePath]
    : [imagePath];
  const result = await run(runner.command, args, {
    cwd: workingDirectory,
    timeoutMs: HOMR_TIMEOUT_MS,
    env: { ...process.env, PYTHONUTF8: "1" }
  });
  if (result.timedOut) throw new Error("악보 읽기가 오래 걸리고 있어요. 더 작고 선명한 사진으로 다시 시도해 주세요.");
  if (result.code !== 0) {
    throw new Error("악보를 읽지 못했어요. 더 선명한 사진으로 다시 시도해 주세요.");
  }
  const outputPath = await findMusicXml(workingDirectory);
  if (!outputPath) throw new Error("악보를 읽지 못했어요. 더 선명한 사진으로 다시 시도해 주세요.");
  return readFile(outputPath);
}

async function homrMiddleware(request, response, next) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (!url.pathname.startsWith("/api/homr/")) {
    next();
    return;
  }

  if (request.method === "POST" && !isTrustedLocalOrigin(request)) {
    sendError(response, 403, "UNTRUSTED_ORIGIN", "이 앱 화면에서만 악보를 읽을 수 있어요.");
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/homr/status") {
    const runner = await findHomrRunner();
    sendJson(response, 200, publicStatus(
      runner,
      runner ? "악보 사진을 바로 읽을 수 있어요." : "악보 읽기를 처음 한 번만 준비해 주세요."
    ));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/homr/install") {
    if (installInProgress) {
      sendError(response, 409, "INSTALL_IN_PROGRESS", "악보 읽기를 준비하고 있어요. 잠시만 기다려 주세요.");
      return;
    }
    installInProgress = true;
    try {
      const existing = await findHomrRunner();
      const runner = existing ?? await installUv();
      sendJson(response, 200, publicStatus(runner, "악보 읽기 준비를 마쳤어요."));
    } catch (error) {
      sendError(response, 500, "INSTALL_FAILED", error instanceof Error ? error.message : "준비하지 못했어요.");
    } finally {
      installInProgress = false;
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/homr/recognize") {
    if (recognitionInProgress) {
      sendError(response, 409, "RECOGNITION_IN_PROGRESS", "다른 악보를 인식하고 있어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const filename = safeImageName(request);
    if (!filename) {
      sendError(response, 415, "UNSUPPORTED_IMAGE", "읽을 수 있는 악보 사진을 골라 주세요.");
      return;
    }
    const runner = await findHomrRunner();
    if (!runner) {
      sendError(response, 503, "HOMR_NOT_READY", "악보 읽기를 먼저 준비해 주세요.");
      return;
    }

    recognitionInProgress = true;
    let workingDirectory = "";
    try {
      const image = await readRequestBody(request);
      if (image.length === 0) throw new Error("빈 이미지 파일은 인식할 수 없어요.");
      workingDirectory = await mkdtemp(join(tmpdir(), "maeum-homr-"));
      const imagePath = resolve(workingDirectory, filename);
      await writeFile(imagePath, image);
      const musicXml = await recognizeImage(runner, imagePath, workingDirectory);
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/vnd.recordare.musicxml+xml; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(musicXml);
    } catch (error) {
      if (error instanceof Error && error.message === "IMAGE_TOO_LARGE") {
        sendError(response, 413, "IMAGE_TOO_LARGE", "악보 이미지는 7MB 이하로 올려 주세요.");
      } else {
        sendError(response, 500, "RECOGNITION_FAILED", error instanceof Error ? error.message : "악보를 읽지 못했어요.");
      }
    } finally {
      recognitionInProgress = false;
      if (workingDirectory) await rm(workingDirectory, { recursive: true, force: true });
    }
    return;
  }

  sendError(response, 404, "NOT_FOUND", "지원하지 않는 요청이에요.");
}

export function homrLocalPlugin() {
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      void homrMiddleware(request, response, next).catch((error) => {
        if (!response.headersSent) {
          sendError(response, 500, "LOCAL_SERVER_ERROR", error instanceof Error ? error.message : "앱에서 문제가 생겼어요.");
        }
      });
    });
  };
  return {
    name: "maeum-melody-homr-local",
    apply: "serve",
    configureServer: configure,
    configurePreviewServer: configure
  };
}
