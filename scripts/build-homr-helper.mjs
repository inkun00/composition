import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourcePath = resolve("scripts/homr-vite-plugin.mjs");
const outputPath = resolve("public/homr-helper.generated.mjs");
const source = await readFile(sourcePath, "utf8");

const serverSource = `${source}

import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 37641;

const server = createServer((request, response) => {
  void homrMiddleware(request, response, () => {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("악보 읽기 도우미가 켜져 있어요. 이 창은 닫지 마세요.");
  }, { allowHostedOrigin: true }).catch((error) => {
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({
        code: "LOCAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "악보 읽기 도우미에 문제가 생겼어요."
      }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(\`악보 읽기 도우미가 켜졌어요: http://\${HOST}:\${PORT}\`);
  console.log("이 창은 악보 읽기가 끝날 때까지 닫지 마세요.");
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.log("악보 읽기 도우미가 이미 켜져 있어요.");
    process.exit(0);
  }
  throw error;
});
`;

await writeFile(outputPath, serverSource, "utf8");
console.log(`Generated ${outputPath}`);
