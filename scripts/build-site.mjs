import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");

const FILES_TO_COPY = [
  "index.html",
  "app.js",
  "analytics.js",
  "style.css",
  "favicon.svg",
  "robots.txt",
  "sitemap.xml",
];

const DIRECTORIES_TO_COPY = ["data"];

async function copyEntry(relativePath) {
  await cp(join(ROOT, relativePath), join(DIST, relativePath), { recursive: true });
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await Promise.all(FILES_TO_COPY.map(copyEntry));
  await Promise.all(DIRECTORIES_TO_COPY.map(copyEntry));
  await writeFile(join(DIST, ".nojekyll"), "", "utf8");

  console.log("Built static site into dist/.");
}

await main();
