import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { deleteApp, initializeApp } from "firebase/app";
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer,
  getDocsFromServer, getFirestore, serverTimestamp, setDoc, setLogLevel,
  terminate, updateDoc, writeBatch
} from "firebase/firestore";
import { createServer as createViteServer } from "vite";

// This verification starts its own loopback emulator and a fixed demo project.
// It never loads production Firebase configuration or contacts production data.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectId = "demo-community-album-rules";
const host = "127.0.0.1";
const outputDir = await mkdtemp(path.join(tmpdir(), "community-album-rules-"));
const java = process.env.JAVA_BIN || (process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, "bin", "java.exe")
  : "C:/Program Files/Android/Android Studio/jbr/bin/java.exe");
const jar = process.env.FIRESTORE_EMULATOR_JAR || path.join(
  homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar"
);
await access(jar);
const rulesPath = path.join(outputDir, "firestore.rules");
await writeFile(rulesPath, await readFile(path.join(root, "firestore.rules")));

async function unusedPort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const port = await unusedPort();
const origin = `http://${host}:${port}`;
const documentsUrl = `${origin}/v1/projects/${projectId}/databases/(default)/documents`;
const emulatorLog = createWriteStream(path.join(outputDir, "emulator.log"));
const emulator = spawn(java, [
  "-jar", jar, "--host", host, "--port", String(port),
  "--project_id", projectId, "--single_project_mode", "true", "--rules", rulesPath
], { cwd: outputDir, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let emulatorError;
emulator.on("error", (error) => { emulatorError = error; });
emulator.stdout.pipe(emulatorLog);
emulator.stderr.pipe(emulatorLog);
const apps = [];
const databases = [];
let vite;
const report = { projectId, origin, productionDataAccess: false, cases: [] };

async function waitForEmulator() {
  const deadline = Date.now() + 45_000;
  let lastResponse = "No HTTP response";
  while (Date.now() < deadline) {
    if (emulatorError) throw emulatorError;
    if (emulator.exitCode !== null) throw new Error(`Emulator exited: ${emulator.exitCode}`);
    try {
      const response = await fetch(`${documentsUrl}/ready-check/document`, {
        headers: { Authorization: "Bearer owner" }, signal: AbortSignal.timeout(1000)
      });
      if (response.status === 404) return;
      lastResponse = `${response.status}: ${await response.text()}`;
    } catch (error) {
      lastResponse = error.message;
      // Retry only while the private emulator is starting.
    }
    await delay(200);
  }
  throw new Error(`Private Firestore emulator did not become ready within 45 seconds: ${lastResponse}`);
}

function fieldValue(value) {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fieldValue) } };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  return { mapValue: { fields: Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, fieldValue(item)])
  ) } };
}

async function adminRequest(documentPath, method = "GET", data) {
  const response = await fetch(`${documentsUrl}/${documentPath}`, {
    method,
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify({ fields: fieldValue(data).mapValue.fields }) } : {})
  });
  if (method === "GET" && response.status === 404) return null;
  if (!response.ok) throw new Error(`${method} ${documentPath}: ${response.status} ${await response.text()}`);
  return response.json();
}

function databaseFor(label, uid, email = `${uid}@example.test`) {
  const app = initializeApp({ apiKey: "demo-key", projectId }, `album-rules-${label}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, port, uid ? { mockUserToken: { sub: uid, email } } : undefined);
  apps.push(app);
  databases.push(db);
  return db;
}

function song(ownerId) {
  return {
    ownerId, ownerName: "검증 사용자", sourceScoreId: "fixture-score",
    title: "앨범 규칙 검증", creator: "검증 작곡가", access: "project", draft: { version: 1 }
  };
}

async function verify(name, action) {
  await action();
  report.cases.push(name);
  console.log(`PASS ${name}`);
}

async function denied(action) {
  await assert.rejects(action, (error) => error.code === "permission-denied");
}

try {
  await waitForEmulator();
  setLogLevel("silent");
  const anonymous = databaseFor("anonymous");
  const owner = databaseFor("owner", "owner-1");
  const friend = databaseFor("friend", "friend-1");
  const admin = databaseFor("admin", "admin-1", "inkun00@hanmail.net");

  // Keep the actual backend module and SDK; substitute its client connection.
  const clientModulePath = path.join(root, "src/firebase/client.ts").replaceAll("\\", "/");
  vite = await createViteServer({
    root, configFile: false, envDir: outputDir, appType: "custom",
    cacheDir: path.join(outputDir, "vite-cache"),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    plugins: [{
      name: "private-community-album-rules-client",
      enforce: "pre",
      load(id) {
        if (id.replaceAll("\\", "/") === clientModulePath) return `
          export let firestore;
          export let firebaseAuth;
          export function setVerificationClient(db, uid) {
            firestore = db;
            firebaseAuth = { currentUser: uid ? { uid } : null };
          }
        `;
      },
      transform(code) {
        // Native Node SSR needs default interop for this CommonJS package.
        if (code.includes('from "lz-string"')) return code.replace(
          /import\s+\{([^}]+)\}\s+from\s+"lz-string";/g,
          'import LZStringModule from "lz-string";\nconst {$1} = LZStringModule;'
        );
      }
    }]
  });
  const backend = await vite.ssrLoadModule("/src/firebase/communityAlbums.ts");
  const client = await vite.ssrLoadModule("/src/firebase/client.ts");
  const { albumPasswordProof } = await vite.ssrLoadModule("/src/firebase/albumPassword.ts");
  const password = "앨범삭제1234";
  const salt = "a".repeat(32);
  const proof = await albumPasswordProof(password, salt);
  const authorization = { userId: "owner-1", password, salt };
  const albumPath = (id) => `communityAlbums/${id}`;
  const songPath = (id) => `${albumPath(id)}/songs/fixture-song`;
  const proofPath = (id) => `albumDeletionAccess/${id}`;

  async function seedAlbum(id, locked = true, songOwner = "friend-1") {
    await adminRequest(albumPath(id), "PATCH", {
      name: id, ownerId: "owner-1", ownerName: "앨범 작성자", locked,
      ...(locked ? { passwordSalt: salt } : {})
    });
    await adminRequest(songPath(id), "PATCH", song(songOwner));
    if (locked) await adminRequest(`albumSecrets/${id}`, "PATCH", { ownerId: "owner-1", proof });
  }

  async function assertIntact(id) {
    assert.ok(await adminRequest(albumPath(id)), "Album must remain");
    assert.ok(await adminRequest(songPath(id)), "Song must remain");
  }

  async function assertDeleted(id) {
    for (const documentPath of [albumPath(id), songPath(id), `albumSecrets/${id}`, proofPath(id)]) {
      assert.equal(await adminRequest(documentPath), null, `${documentPath} must be removed`);
    }
  }

  await seedAlbum("public-entry");
  await verify("locked album allows anonymous read and list", async () => {
    assert.equal((await getDocFromServer(doc(anonymous, songPath("public-entry")))).exists(), true);
    assert.equal((await getDocsFromServer(collection(anonymous, `${albumPath("public-entry")}/songs`))).size, 1);
  });
  await verify("locked album allows friend read and list without proof", async () => {
    assert.equal((await getDocFromServer(doc(friend, songPath("public-entry")))).exists(), true);
    assert.equal((await getDocsFromServer(collection(friend, `${albumPath("public-entry")}/songs`))).size, 1);
    assert.equal(await adminRequest(proofPath("public-entry")), null);
  });
  await verify("friend publishes and updates own song without album password", async () => {
    const ref = doc(friend, `${albumPath("public-entry")}/songs/friend-song`);
    await setDoc(ref, song("friend-1"));
    await updateDoc(ref, { access: "audio" });
    assert.equal((await getDocFromServer(ref)).data().access, "audio");
    await deleteDoc(ref);
  });
  await verify("anonymous publishing is rejected", async () => {
    await denied(() => setDoc(doc(anonymous, `${albumPath("public-entry")}/songs/anonymous-song`), song("anonymous")));
  });

  await seedAlbum("missing-proof", true, "owner-1");
  await verify("owner direct deletion without proof is rejected", async () => {
    await denied(() => deleteDoc(doc(owner, albumPath("missing-proof"))));
    await assertIntact("missing-proof");
  });
  await verify("backend stale no-password deletion keeps even owner songs intact", async () => {
    client.setVerificationClient(owner, "owner-1");
    await denied(() => backend.deleteCommunityAlbum("missing-proof"));
    await assertIntact("missing-proof");
  });
  await verify("wrong password is rejected before deleting contents", async () => {
    await denied(() => backend.deleteCommunityAlbum("missing-proof", { ...authorization, password: "잘못된암호" }));
    await assertIntact("missing-proof");
    assert.equal(await adminRequest(proofPath("missing-proof")), null);
  });

  await seedAlbum("legacy-proof");
  await adminRequest("albumMemberAccess/legacy-proof/users/owner-1", "PATCH", { proof });
  await verify("legacy entry proof does not authorize deletion", async () => {
    await denied(() => deleteDoc(doc(owner, albumPath("legacy-proof"))));
    await assertIntact("legacy-proof");
  });
  await verify("nonowner knowing password cannot authorize or delete album", async () => {
    await denied(() => setDoc(doc(friend, proofPath("legacy-proof")), {
      ownerId: "friend-1", proof, verifiedAt: serverTimestamp()
    }));
    await denied(() => deleteDoc(doc(friend, albumPath("legacy-proof"))));
    await assertIntact("legacy-proof");
  });

  await seedAlbum("expired-proof");
  await adminRequest(proofPath("expired-proof"), "PATCH", {
    ownerId: "owner-1", proof, verifiedAt: new Date(Date.now() - 10 * 60_000)
  });
  await verify("expired deletion authorization cannot remove album or others' songs", async () => {
    await denied(() => deleteDoc(doc(owner, albumPath("expired-proof"))));
    await denied(() => deleteDoc(doc(owner, songPath("expired-proof"))));
    await assertIntact("expired-proof");
  });

  await seedAlbum("correct-proof");
  await verify("correct password deletes songs, album, secret, and authorization", async () => {
    client.setVerificationClient(owner, "owner-1");
    await backend.deleteCommunityAlbum("correct-proof", { ...authorization, password: `  ${password}  ` });
    await assertDeleted("correct-proof");
  });
  await seedAlbum("unlocked-owner", false);
  await verify("unlocked owner deletion passes server preflight and cleans all data", async () => {
    await backend.deleteCommunityAlbum("unlocked-owner");
    await assertDeleted("unlocked-owner");
  });
  await seedAlbum("admin-delete");
  await verify("admin deletes locked album without knowing password", async () => {
    client.setVerificationClient(admin, "admin-1");
    await backend.deleteCommunityAlbum("admin-delete");
    await assertDeleted("admin-delete");
  });

  // Atomic deletes must check the pre-write secret/access documents.
  await seedAlbum("atomic-cleanup");
  await verify("single batch can delete song, secret, authorization, and album", async () => {
    await setDoc(doc(owner, proofPath("atomic-cleanup")), {
      ownerId: "owner-1", proof, verifiedAt: serverTimestamp()
    });
    const batch = writeBatch(owner);
    for (const documentPath of [songPath("atomic-cleanup"), `albumSecrets/atomic-cleanup`,
      proofPath("atomic-cleanup"), albumPath("atomic-cleanup")]) batch.delete(doc(owner, documentPath));
    await batch.commit();
    await assertDeleted("atomic-cleanup");
  });

  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Verified ${report.cases.length} emulator cases. Report: ${path.join(outputDir, "report.json")}`);
} catch (error) {
  console.error(`Emulator log: ${path.join(outputDir, "emulator.log")}`);
  throw error;
} finally {
  await Promise.allSettled(databases.map((db) => terminate(db)));
  await Promise.allSettled(apps.map((app) => deleteApp(app)));
  if (vite) await vite.close();
  if (emulator.exitCode === null && emulator.signalCode === null) emulator.kill();
  emulatorLog.end();
}
