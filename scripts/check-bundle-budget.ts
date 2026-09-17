import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const assetDirectory = "apps/web/dist/assets";
const files = await readdir(assetDirectory);
const scripts = files.filter((file) => file.endsWith(".js"));
const manifest = JSON.parse(await readFile("apps/web/dist/.vite/manifest.json", "utf8")) as Record<
  string,
  { file: string; isEntry?: boolean }
>;
const entryFiles = new Set(
  Object.values(manifest)
    .filter((item) => item.isEntry)
    .map((item) => item.file.split("/").at(-1)),
);
const initialMaximumGzipBytes = 200 * 1024;
const asyncMaximumGzipBytes = 650 * 1024;

for (const script of scripts) {
  const bytes = await Bun.file(`${assetDirectory}/${script}`).arrayBuffer();
  const gzipBytes = gzipSync(bytes).byteLength;
  const isEntry = entryFiles.has(script);
  const maximumGzipBytes = isEntry ? initialMaximumGzipBytes : asyncMaximumGzipBytes;
  if (gzipBytes > maximumGzipBytes) {
    throw new Error(
      `${script} is ${(gzipBytes / 1024).toFixed(1)} KiB gzipped; ${isEntry ? "entry" : "async"} budget is ${maximumGzipBytes / 1024} KiB.`,
    );
  }
}

console.log(`Bundle budget passed for ${scripts.length} JavaScript asset(s).`);
