import { readFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { experiment } from "../lib/evaluation.js";
import { csv } from "../lib/exports.js";
const dataset = JSON.parse(
  await readFile(new URL("../benchmarks/dataset.json", import.meta.url)),
);
const result = experiment(dataset, {
  repetitions: Number(process.argv[2] ?? 30),
  environment: `${os.platform()} ${os.release()}; ${os.arch()}; ${os.cpus()[0]?.model}; Node ${process.version}; first iteration cold, no excluded warm-up`,
});
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/evaluation.json", JSON.stringify(result, null, 2));
await writeFile("artifacts/evaluation.csv", csv(result.runs));
console.log(JSON.stringify(result, null, 2));
