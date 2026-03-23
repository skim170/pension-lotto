import { readFile, writeFile } from "node:fs/promises";

const RESULTS_PATH = new URL("../data/results.json", import.meta.url);
const RESULTS_LIST_URL =
  process.env.PENSION_RESULTS_LIST_URL ||
  "https://www.dhlottery.co.kr/pt720/selectPstPt720WnList.do";
const USER_AGENT =
  process.env.PENSION_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
const DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
  Referer: "https://www.dhlottery.co.kr/pt720/result",
  "X-Requested-With": "XMLHttpRequest",
};

function normalizeDate(value) {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (digits.length >= 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return String(value).slice(0, 10);
}

function pad6(value) {
  return String(value).replace(/\D/g, "").padStart(6, "0").slice(-6);
}

function parseRound(value) {
  const round = Number(value);
  if (!Number.isFinite(round) || round <= 0) return null;
  return round;
}

function parseGroup(value) {
  const group = Number(value);
  if (!Number.isFinite(group) || group < 1 || group > 5) return null;
  return group;
}

function normalizeItem(item) {
  const round = parseRound(item.psltEpsd ?? item.ltEpsd ?? item.round);
  const group = parseGroup(item.wnBndNo ?? item.group);
  const num = pad6(item.wnRnkVl ?? item.num ?? item.winNumber);
  const date = normalizeDate(item.psltRflYmd ?? item.date ?? item.drawDate);

  if (!round || !group || num.length !== 6 || !/^\d{6}$/.test(num)) {
    throw new Error(`Unexpected result payload: ${JSON.stringify(item)}`);
  }

  return { round, group, num, date };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!res.ok) {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(`HTTP ${res.status} for ${url}: ${preview}`);
  }

  if (!contentType.includes("json")) {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(
      `Expected JSON from ${url}, got ${contentType || "unknown content type"}. Preview: ${preview}`
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const preview = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(`Failed to parse JSON from ${url}. Preview: ${preview}`);
  }
}

async function readExistingResults() {
  try {
    const raw = await readFile(RESULTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function dedupeAndSort(list) {
  const byRound = new Map();
  for (const item of list) {
    byRound.set(item.round, item);
  }
  return Array.from(byRound.values()).sort((a, b) => b.round - a.round);
}

async function main() {
  const existing = await readExistingResults();
  const payload = await fetchJson(RESULTS_LIST_URL);
  const rawResults = payload?.data?.result;

  if (!Array.isArray(rawResults) || rawResults.length === 0) {
    throw new Error("Lottery endpoint returned no results.");
  }

  const nextResults = dedupeAndSort(rawResults.map(normalizeItem));
  const nextLatestRound = nextResults[0]?.round || 0;
  const existingRounds = new Set(
    existing.map((item) => Number(item.round)).filter((round) => Number.isFinite(round))
  );
  const nextRounds = new Set(nextResults.map((item) => item.round));
  const addedRounds = nextResults.filter((item) => !existingRounds.has(item.round)).length;
  const removedRounds = [...existingRounds].filter((round) => !nextRounds.has(round)).length;

  await writeFile(
    RESULTS_PATH,
    JSON.stringify(nextResults, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `Synced ${nextResults.length} rounds. Latest round: ${nextLatestRound}. Added: ${addedRounds}. Removed: ${removedRounds}.`
  );
}

await main();
