import { createHash } from "node:crypto";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const sourceArgument = process.argv[2];
if (!sourceArgument) {
  throw new Error("Usage: npm run ratings:prepare -- benchmarks/runs/<run-id>");
}
const runDirectory = resolve(sourceArgument);
const artifactDirectory = join(runDirectory, "artifacts");
const sessionDirectory = join(process.cwd(), "benchmarks", "ratings", "session");
const sessionAssets = join(sessionDirectory, "assets");
const entries = (await readdir(artifactDirectory))
  .filter((entry) => /\.(png|jpe?g|webp|svg)$/i.test(entry))
  .sort();
if (entries.length === 0) {
  throw new Error(
    "No retained synthetic artifacts found. Re-run with MALIANG_KEEP_BENCHMARK_ARTIFACTS=1."
  );
}

function score(value: string): string {
  return createHash("sha256")
    .update(`${basename(runDirectory)}:${value}`, "utf8")
    .digest("hex");
}

await rm(sessionDirectory, { recursive: true, force: true });
await mkdir(sessionAssets, { recursive: true, mode: 0o700 });
const randomized = entries
  .map((entry) => ({ entry, sortKey: score(entry) }))
  .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
for (const item of randomized) {
  await cp(join(artifactDirectory, item.entry), join(sessionAssets, item.entry), {
    dereference: true
  });
}
await writeFile(
  join(sessionDirectory, "session.json"),
  JSON.stringify({
    schemaVersion: 1,
    sourceRunId: basename(runDirectory),
    syntheticOnly: true,
    candidates: randomized.map((item, index) => ({
      blindedId: `candidate-${String(index + 1).padStart(3, "0")}`,
      image: `./session/assets/${item.entry}`
    }))
  }, null, 2),
  { mode: 0o600 }
);
console.log(`Prepared ${randomized.length} blinded candidates.`);
