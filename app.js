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
      <td><b>${r.group}조 ${String(r.num).padStart(6,"0")}</b></td>
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
function drawGroupChart(groupFreq) {
  const ctx = document.getElementById("chartGroup");

  const labels = ["1조","2조","3조","4조","5조"];
  const values = [1,2,3,4,5].map(g => groupFreq[g] || 0);

  if (groupChart) groupChart.destroy();
  groupChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "출현 횟수", data: values }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function drawDigitChart(posFreq, posIndex) {
  const ctx = document.getElementById("chartDigit0");

  const labels = ["0","1","2","3","4","5","6","7","8","9"];
  const values = posFreq[posIndex];

  if (digitChart) digitChart.destroy();
  digitChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "출현 횟수", data: values }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

// ======================
// 이벤트
// ======================
$btnLoad.addEventListener("click", async () => {
  try {
    $status.textContent = "데이터 불러오는 중...";
    recent30 = await loadResults();

    // 분석
    const groupFreq = analyzeGroupFreq(recent30);
    const posFreq = analyzeDigitPosFreq(recent30);

    // 렌더
    renderRecentTable(recent30);
    renderGroupSummary(groupFreq);

    drawGroupChart(groupFreq);
    drawDigitChart(posFreq, Number($posSelect.value));

    $status.textContent = `✅ 최근 ${recent30.length}회 데이터 로딩 완료`;
    showToast("최근 30회 불러오기 완료!");
  } catch (e) {
    console.error(e);
    $status.textContent = "❌ 데이터 로딩 실패 (results.json 확인 필요)";
    showToast("불러오기 실패");
  }
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
