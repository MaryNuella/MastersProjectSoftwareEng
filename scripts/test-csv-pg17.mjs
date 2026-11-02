// Creates and stops a new loopback-only cluster. Never reads .env or a database URL.
import { mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve("artifacts/pg17-tools/node_modules/embedded-postgres/dist/index.js")));
const server = createServer();
await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
const port = server.address().port;
await new Promise(done => server.close(done));
const directory = await mkdtemp(resolve("artifacts/csv-pg17-"));
const password = randomBytes(24).toString("hex");
const cluster = new EmbeddedPostgres({ databaseDir: directory, user: "postgres", password, port, persistent: true,
  createPostgresUser: false, autoRehydrateSymlinks: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1", "-c", "cluster_name=csv_import_isolated_tests"],
  onLog: () => {}, onError: message => console.error(String(message)) });
try {
  await cluster.initialise();
  await cluster.start();
  const check = cluster.getPgClient("postgres", "127.0.0.1"); await check.connect();
  const version = (await check.query("show server_version")).rows[0].server_version;
  await check.end();
  if (!version.startsWith("17.")) throw Error("Isolated cluster must be PostgreSQL 17");
  console.log(`Isolated PostgreSQL ${version}; loopback port ${port}; no production connection.`);
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, ["--test", "tests/csv-import-functions.test.js"], {
      windowsHide: true, stdio: "inherit", env: { ...process.env, CSV_IMPORT_NATIVE_PORT: String(port), CSV_IMPORT_NATIVE_PASSWORD: password }
    });
    child.once("error", reject); child.once("exit", done);
  });
  process.exitCode = code ?? 1;
} finally { await cluster.stop(); }
// Keep only the stopped, disposable cluster under ignored artifacts for review.
