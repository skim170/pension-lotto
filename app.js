// ===== 설정 =====
// 보통 뉴스/결과 표기에서 "1조~5조" 형태가 많이 사용됨 (예: 298회 3조 ...) 
// 필요하면 MAX_GROUP 값을 바꾸면 됨.
const MAX_GROUP = 5;

// ===== DOM =====
const $count = document.getElementById("count");
const $btnGenerate = document.getElementById("btnGenerate");
const $btnClear = document.getElementById("btnClear");
const $list = document.getElementById("list");
const $empty = document.getElementById("empty");
const $toast = document.getElementById("toast");

// ===== 유틸: 보안 랜덤 =====
function randInt(min, max) {
  // min ~ max (inclusive)
  const range = max - min + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % range);
}

function pad6(n) {
  return String(n).padStart(6, "0");
}

// "조 + 6자리" 생성
function generateOne() {
  const group = randInt(1, MAX_GROUP);
  const num = pad6(randInt(0, 999999));
  return `${group}조 ${num}`;
}

function showToast(text) {
  $toast.textContent = text;
  $toast.classList.add("show");
  setTimeout(() => $toast.classList.remove("show"), 800);
}

function render(items) {
  $list.innerHTML = "";

  if (!items.length) {
    $empty.style.display = "block";
    return;
  }
  $empty.style.display = "none";

  items.forEach((val, idx) => {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <span class="number">${val}</span>
      <span class="badge">#${idx + 1} 클릭해서 복사</span>
    `;

    li.addEventListener("click", async () => {
      await navigator.clipboard.writeText(val);
      showToast(`복사됨: ${val}`);
    });

    $list.appendChild(li);
  });
}

// ===== 이벤트 =====
$btnGenerate.addEventListener("click", () => {
  let n = Number($count.value);
  if (!Number.isFinite(n)) n = 5;

  n = Math.max(1, Math.min(20, n)); // 1~20 제한
  $count.value = n;

  const items = Array.from({ length: n }, () => generateOne());
  render(items);
});

$btnClear.addEventListener("click", () => {
  render([]);
  showToast("초기화 완료");
});

// 초기 상태
render([]);
