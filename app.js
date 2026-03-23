// ======================
// 전역 상태
// ======================
let recent30 = [];          // 최근 30회 데이터
let groupChart = null;      // Chart.js 인스턴스
let digitChart = null;
let lastRecommendations = [];

// ======================
// DOM
// ======================
const $btnLoad = document.getElementById("btnLoad");
const $btnRecommend = document.getElementById("btnRecommend");
const $btnCopyReco = document.getElementById("btnCopyReco");
const $status = document.getElementById("status");
const $toast = document.getElementById("toast");

const $recentTbody = document.querySelector("#recentTable tbody");
const $groupSummary = document.getElementById("groupSummary");

const $recoList = document.getElementById("recoList");
const $recoEmpty = document.getElementById("recoEmpty");

const $posSelect = document.getElementById("posSelect");
const $btnUpdatePos = document.getElementById("btnUpdatePos");
const $themeToggle = document.getElementById("themeToggle");
const $themeToggleLabel = document.getElementById("themeToggleLabel");

const THEME_STORAGE_KEY = "pension-lotto-theme";

// ======================
// 유틸
// ======================
function showToast(msg) {
  $toast.textContent = msg;
  $toast.classList.add("show");
  setTimeout(() => $toast.classList.remove("show"), 900);
}

// 더 좋은 랜덤(crypto)
function randInt(min, max) {
  const range = max - min + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % range);
}

function pad6(n) {
  return String(n).padStart(6, "0");
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readThemePreference() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function writeThemePreference(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 저장을 못 하더라도 기본 테마 동작은 유지
  }
}

function updateThemeToggle(theme) {
  if (!$themeToggle) return;

  const isDark = theme === "dark";
  $themeToggle.setAttribute("aria-pressed", String(isDark));
  $themeToggle.setAttribute("aria-label", isDark ? "라이트 모드로 전환" : "다크 모드로 전환");
  $themeToggleLabel.textContent = isDark ? "다크 모드" : "라이트 모드";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  updateThemeToggle(theme);
  refreshCharts();
}

// 가중치 배열에서 1개 뽑기 (weights: [w0,w1,...])
function weightedPick(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return randInt(0, weights.length - 1);

  // 랜덤 포인트
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ======================
// 데이터 로딩
// ======================
async function loadResults() {
  // results.json은 “최신 회차가 앞에 오는 정렬”을 권장
  const res = await fetch("./data/results.json", { cache: "no-store" });
  if (!res.ok) throw new Error("results.json을 불러오지 못했습니다.");
  const data = await res.json();

  // 최신순 정렬 보정 (round 내림차순)
  data.sort((a, b) => b.round - a.round);

  // 최근 30개
  return data.slice(0, 30);
}

function renderDashboard(list) {
  const groupFreq = analyzeGroupFreq(list);
  const posFreq = analyzeDigitPosFreq(list);

  renderRecentTable(list);
  renderGroupSummary(groupFreq);
  drawGroupChart(groupFreq);
  drawDigitChart(posFreq, Number($posSelect.value));
}

function buildStatusMessage(list, prefix = "로딩 완료") {
  if (!list.length) return `데이터 ${prefix}`;

  const latest = list[0];
  const latestDate = latest.date ? `, 최신 ${latest.round}회차 ${latest.date}` : `, 최신 ${latest.round}회차`;
  return `✅ 최근 ${list.length}회 데이터 ${prefix}${latestDate}`;
}

async function loadAndRenderResults({ showSuccessToast = false } = {}) {
  try {
    $status.textContent = showSuccessToast ? "데이터 불러오는 중..." : "최신 데이터를 자동으로 불러오는 중...";
    recent30 = await loadResults();
    renderDashboard(recent30);
    $status.textContent = buildStatusMessage(recent30, "반영 완료");

    if (showSuccessToast) {
      showToast("최근 30회 불러오기 완료!");
    }
  } catch (e) {
    console.error(e);
    $status.textContent = showSuccessToast
      ? "❌ 데이터 로딩 실패 (results.json 확인 필요)"
      : "❌ 자동 로딩 실패 (results.json 확인 필요)";

    if (showSuccessToast) {
      showToast("불러오기 실패");
    }
  }
}

// ======================
// 분석 로직
// ======================
function analyzeGroupFreq(list) {
  // group: 1~5
  const freq = [0, 0, 0, 0, 0, 0]; // index 1~5 사용
  for (const r of list) freq[r.group] = (freq[r.group] || 0) + 1;
  return freq;
}

function analyzeDigitPosFreq(list) {
  // posFreq[pos][digit]
  const posFreq = Array.from({ length: 6 }, () => Array(10).fill(0));
  for (const r of list) {
    const digits = String(r.num).padStart(6, "0").split("").map(Number);
    digits.forEach((d, pos) => posFreq[pos][d]++);
  }
  return posFreq;
}

// ======================
// 추천번호 생성 (최근 30회 분포 기반 가중 랜덤)
// ======================
function recommendNumbers(list, count = 5) {
  const groupFreq = analyzeGroupFreq(list);      // [0, ..., 5]
  const posFreq = analyzeDigitPosFreq(list);     // [6][10]

  // 가중치에 “+1 smoothing”을 넣으면 0이 아예 안 나오는 문제 완화됨
  const groupWeights = groupFreq.slice(1).map(x => x + 1); // 1~5
  const digitWeights = posFreq.map(arr => arr.map(x => x + 1));

  const out = [];
  for (let i = 0; i < count; i++) {
    const group = weightedPick(groupWeights) + 1;

    const digits = digitWeights.map(w => weightedPick(w));
    const num = digits.join("");

    out.push(`${group}조 ${num}`);
  }
  return out;
}

// ======================
// 렌더링
// ======================
function renderRecentTable(list) {
  $recentTbody.innerHTML = "";
  for (const r of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.round}</td>
      <td>${r.date || "-"}</td>
      <td><b>${r.group}조 ${pad6(r.num)}</b></td>
    `;
    $recentTbody.appendChild(tr);
  }
}

function renderReco(list) {
  $recoList.innerHTML = "";
  if (!list.length) {
    $recoEmpty.style.display = "block";
    return;
  }
  $recoEmpty.style.display = "none";

  list.forEach((v, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${v}</strong>
      <span class="badge">추천 #${idx + 1}</span>
    `;
    li.addEventListener("click", async () => {
      await navigator.clipboard.writeText(v);
      showToast(`복사됨: ${v}`);
    });
    $recoList.appendChild(li);
  });
}

function renderGroupSummary(freq) {
  // freq index 1~5
  const total = recent30.length || 1;
  const items = [1,2,3,4,5].map(g => {
    const c = freq[g] || 0;
    const pct = Math.round((c / total) * 100);
    return `${g}조: ${c}회 (${pct}%)`;
  }).join(" / ");

  // 최빈 조
  let bestG = 1, bestC = -1;
  for (let g = 1; g <= 5; g++) {
    if ((freq[g] || 0) > bestC) {
      bestC = freq[g];
      bestG = g;
    }
  }

  $groupSummary.innerHTML = `
    <div>최근 30회 기준 → ${items}</div>
    <div style="margin-top:6px;">가장 많이 나온 조: <b>${bestG}조</b> (${bestC}회)</div>
  `;
}

// ======================
// 차트
// ======================
function getChartPalette() {
  return {
    tickColor: getCssVar("--chart-tick"),
    gridColor: getCssVar("--chart-grid"),
    barColor: getCssVar("--chart-bar"),
    barBorderColor: getCssVar("--chart-bar-border")
  };
}

function createBarChartOptions() {
  const { tickColor, gridColor } = getChartPalette();

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: tickColor },
        grid: { display: false },
        border: { color: gridColor }
      },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, color: tickColor },
        grid: { color: gridColor },
        border: { color: gridColor }
      }
    }
  };
}

function drawGroupChart(groupFreq) {
  const ctx = document.getElementById("chartGroup");
  const labels = ["1조","2조","3조","4조","5조"];
  const values = [1,2,3,4,5].map(g => groupFreq[g] || 0);
  const { barColor, barBorderColor } = getChartPalette();

  if (groupChart) groupChart.destroy();
  groupChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "출현 횟수",
        data: values,
        backgroundColor: barColor,
        borderColor: barBorderColor,
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 40
      }]
    },
    options: createBarChartOptions()
  });
}

function drawDigitChart(posFreq, posIndex) {
  const ctx = document.getElementById("chartDigit0");
  const labels = ["0","1","2","3","4","5","6","7","8","9"];
  const values = posFreq[posIndex];
  const { barColor, barBorderColor } = getChartPalette();

  if (digitChart) digitChart.destroy();
  digitChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "출현 횟수",
        data: values,
        backgroundColor: barColor,
        borderColor: barBorderColor,
        borderWidth: 1,
        borderRadius: 8,
        maxBarThickness: 32
      }]
    },
    options: createBarChartOptions()
  });
}

function refreshCharts() {
  if (!recent30.length) return;

  const groupFreq = analyzeGroupFreq(recent30);
  const posFreq = analyzeDigitPosFreq(recent30);

  drawGroupChart(groupFreq);
  drawDigitChart(posFreq, Number($posSelect.value));
}

// ======================
// 이벤트
// ======================
applyTheme(readThemePreference());

$themeToggle?.addEventListener("click", () => {
  const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";

  applyTheme(nextTheme);
  writeThemePreference(nextTheme);
  showToast(nextTheme === "dark" ? "다크 모드로 전환했습니다." : "라이트 모드로 전환했습니다.");
});

$btnLoad.addEventListener("click", async () => {
  await loadAndRenderResults({ showSuccessToast: true });
});

$btnUpdatePos.addEventListener("click", () => {
  if (!recent30.length) {
    showToast("먼저 최근 30회를 불러오세요!");
    return;
  }
  const posFreq = analyzeDigitPosFreq(recent30);
  drawDigitChart(posFreq, Number($posSelect.value));
  showToast("자리 변경 완료!");
});

$btnRecommend.addEventListener("click", () => {
  if (!recent30.length) {
    showToast("먼저 최근 30회를 불러오세요!");
    return;
  }
  lastRecommendations = recommendNumbers(recent30, 5);
  renderReco(lastRecommendations);
  showToast("추천번호 생성 완료!");
});

$btnCopyReco.addEventListener("click", async () => {
  if (!lastRecommendations.length) {
    showToast("추천번호가 없습니다!");
    return;
  }
  await navigator.clipboard.writeText(lastRecommendations.join("\n"));
  showToast("추천번호 전체 복사 완료!");
});

void loadAndRenderResults();
