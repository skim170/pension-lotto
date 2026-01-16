import { readFile, writeFile } from "node:fs/promises";

const RESULTS_PATH = new URL("../data/results.json", import.meta.url);
const API_TEMPLATE =
  process.env.PENSION_API_URL_TEMPLATE ||
  "https://www.dhlottery.co.kr/common.do?method=get720Number&drwNo={round}";
const MAX_LOOKAHEAD = Number.parseInt(
  process.env.PENSION_MAX_LOOKAHEAD || "5",
  10
);
const USER_AGENT =
  process.env.PENSION_USER_AGENT || "pension-lotto-updater/1.0";

function normalizeDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function pad6(value) {
  return String(value).padStart(6, "0");
}

function findFirstValue(obj, keys) {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val !== null && val !== undefined) return val;
    }
  }
  return null;
}

function parseGroupNumFromString(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 7) return null;
  for (let i = 0; i + 7 <= digits.length; i++) {
    const group = Number(digits[i]);
    const num = digits.slice(i + 1, i + 7);
    if (group >= 1 && group <= 5) {
      return { group, num };
    }
  }
  return null;
}

function pickGroupNum(data) {
  const groupField = process.env.PENSION_GROUP_FIELD;
  const numField = process.env.PENSION_NUM_FIELD;
  if (groupField && numField) {
    const groupVal = data[groupField];
    const numVal = data[numField];
    if (groupVal !== undefined && numVal !== undefined) {
      const group = Number(groupVal);
      const digits = String(numVal).replace(/\D/g, "");
      if (group >= 1 && group <= 5 && digits.length >= 6) {
        return { group, num: digits.slice(-6) };
      }
    }
  }

  const resultField = process.env.PENSION_RESULT_FIELD;
  const preferredStringFields = [
    resultField,
    "win720",
    "win720No",
    "win720Num",
    "win720Number",
    "winNo",
    "winNumber",
    "firstWinNo",
    "firstWinNum",
    "firstWinNumber",
  ].filter(Boolean);

  for (const key of preferredStringFields) {
    if (typeof data[key] === "string") {
      const parsed = parseGroupNumFromString(data[key]);
      if (parsed) return parsed;
    }
  }

  const groupKeys = ["group", "groupNo", "grpNo", "groupNumber"];
  const numKeys = ["num", "numNo", "numNumber", "winNum", "winNumber", "winNo"];
  const groupVal = findFirstValue(data, groupKeys);
  const numVal = findFirstValue(data, numKeys);
  if (groupVal !== null && numVal !== null) {
    const group = Number(groupVal);
    const digits = String(numVal).replace(/\D/g, "");
    if (group >= 1 && group <= 5 && digits.length >= 6) {
      return { group, num: digits.slice(-6) };
    }
  }

  return null;
}

function isSuccessResponse(data) {
  if (Object.prototype.hasOwnProperty.call(data, "returnValue")) {
    return data.returnValue === "success";
  }
  return true;
}

function parseRound(data) {
  const round = Number(
    data.drwNo ?? data.round ?? data.roundNo ?? data.drwno ?? data.drw_no
  );
  if (!Number.isFinite(round) || round <= 0) return null;
  return round;
}

function parseResult(data) {
  if (!isSuccessResponse(data)) return null;
  const round = parseRound(data);
  if (!round) return null;
  const date = normalizeDate(
    data.drwNoDate ?? data.date ?? data.drawDate ?? data.drwDate
  );
  const parsed = pickGroupNum(data);
  if (!parsed) {
    throw new Error(
      "Could not parse group/num from API response. Set PENSION_RESULT_FIELD or PENSION_GROUP_FIELD/PENSION_NUM_FIELD."
    );
  }
  return {
    round,
    group: parsed.group,
    num: pad6(parsed.num),
    date,
  };
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function main() {
  let existing = [];
  try {
    const raw = await readFile(RESULTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    existing = Array.isArray(parsed) ? parsed : [];
  } catch {
    existing = [];
  }

  const latestRound = existing.reduce(
    (max, item) => Math.max(max, Number(item.round) || 0),
    0
  );

  const newItems = [];
  for (let round = latestRound + 1; round <= latestRound + MAX_LOOKAHEAD; round++) {
    const url = API_TEMPLATE.replace("{round}", String(round));
    const data = await fetchJson(url);

    if (!isSuccessResponse(data)) {
      break;
    }

    const parsed = parseResult(data);
    if (!parsed) break;

    newItems.push(parsed);
  }

  if (!newItems.length) {
    console.log("No new rounds found.");
    return;
  }

  const byRound = new Map();
  for (const item of existing) byRound.set(item.round, item);
  for (const item of newItems) byRound.set(item.round, item);

  const merged = Array.from(byRound.values()).sort(
    (a, b) => b.round - a.round
  );

  await writeFile(RESULTS_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(`Updated results.json with ${newItems.length} round(s).`);
}

await main();
