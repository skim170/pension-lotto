import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();

const REQUIRED_FILES = [
  "index.html",
  "app.js",
  "analytics.js",
  "style.css",
  "favicon.svg",
  "robots.txt",
  "sitemap.xml",
  "data/results.json",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readText(path) {
  return readFile(join(ROOT, path), "utf8");
}

async function validateRequiredFiles() {
  await Promise.all(
    REQUIRED_FILES.map(async (path) => {
      await readFile(join(ROOT, path));
    })
  );
}

function validateResultItem(item, index, previousRound) {
  assert(item && typeof item === "object", `results[${index}] must be an object.`);
  assert(Number.isInteger(item.round) && item.round > 0, `results[${index}].round must be a positive integer.`);
  assert(Number.isInteger(item.group) && item.group >= 1 && item.group <= 5, `results[${index}].group must be between 1 and 5.`);
  assert(typeof item.num === "string" && /^\d{6}$/.test(item.num), `results[${index}].num must be a 6-digit string.`);
  assert(typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date), `results[${index}].date must use YYYY-MM-DD.`);

  if (previousRound !== null) {
    assert(item.round < previousRound, "results.json must be sorted by round descending with no duplicates.");
  }
}

async function validateResultsJson() {
  const raw = await readText("data/results.json");
  const parsed = JSON.parse(raw);

  assert(Array.isArray(parsed), "results.json must contain an array.");
  assert(parsed.length > 0, "results.json must not be empty.");

  let previousRound = null;
  for (const [index, item] of parsed.entries()) {
    validateResultItem(item, index, previousRound);
    previousRound = item.round;
  }
}

async function validateHtmlReferences() {
  const html = await readText("index.html");
  const appJs = await readText("app.js");

  const requiredHtmlRefs = [
    './style.css',
    './analytics.js',
    './app.js',
    './favicon.svg',
  ];

  for (const ref of requiredHtmlRefs) {
    assert(html.includes(ref), `index.html is missing a reference to ${ref}.`);
  }

  assert(appJs.includes('./data/results.json'), "app.js must fetch ./data/results.json.");
}

async function main() {
  await validateRequiredFiles();
  await validateResultsJson();
  await validateHtmlReferences();
  console.log("Static site validation passed.");
}

await main();
