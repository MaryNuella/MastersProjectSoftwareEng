import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

export async function csvLocalDatabase() {
  if (!process.env.CSV_IMPORT_NATIVE_PORT) return new PGlite();
  const port = Number(process.env.CSV_IMPORT_NATIVE_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid isolated port");
  const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve("artifacts/pg17-tools/node_modules/embedded-postgres/dist/index.js")));
  const cluster = new EmbeddedPostgres({ port, user: "postgres", password: process.env.CSV_IMPORT_NATIVE_PASSWORD, persistent: true });
  async function connection() {
    const client = cluster.getPgClient("postgres", "127.0.0.1");
    await client.connect();
    const guard = await client.query("select current_setting('server_version_num')::int as version, current_setting('cluster_name') as name");
    if (guard.rows[0].version < 170000 || guard.rows[0].version >= 180000 || guard.rows[0].name !== "csv_import_isolated_tests") { await client.end(); throw Error("Refusing non-isolated PostgreSQL connection"); }
    return client;
  }
  const client = await connection();
  return { query: (...args) => client.query(...args), exec: sql => client.query(sql), close: () => client.end(), newConnection: connection };
}
