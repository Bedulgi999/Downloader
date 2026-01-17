// ============================
// Config
// ============================

// 1) 기본 BGM URL (원하는 mp3로 바꿔)
// - 같은 폴더에 bgm.mp3를 넣고 싶다면: "./bgm.mp3" 로 바꾸면 됨
// - 단, 이번 요청은 "파일 3개만"이라서 기본값은 외부 샘플 URL로 넣어둠
const BACKGROUND_MUSIC_URL =
  "https://youtu.be/wDqArJu1Rbs?si=_Te8hnzSL2Sc6Zw1";

// 다운로드를 "브라우저로 직접" 할 때, CORS 때문에 실패하는 URL이 많음.
// 가능한 "직접 파일 URL"로 쓰는 걸 권장.

// ============================
// Helpers
// ============================
const $ = (id) => document.getElementById(id);

const el = {
  gate: $("autoplayGate"),
  btnStartBgm: $("btnStartBgm"),
  btnMuteToggle: $("btnMuteToggle"),
  btnBgmToggle: $("btnBgmToggle"),
  btnCopyLog: $("btnCopyLog"),

  inputUrl: $("inputUrl"),
  inputFilename: $("inputFilename"),
  btnDownload: $("btnDownload"),
  btnHeadCheck: $("btnHeadCheck"),
  btnClear: $("btnClear"),

  progressFill: $("progressFill"),
  progressText: $("progressText"),
  sizeText: $("sizeText"),

  selectMode: $("selectMode"),
  inputOutDir: $("inputOutDir"),
  cmdBox: $("cmdBox"),
  btnCopyCmd: $("btnCopyCmd"),
  btnExplain: $("btnExplain"),

  log: $("log"),
  bgm: $("bgm"),
};

function now() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function log(msg, type = "info") {
  const div = document.createElement("div");
  div.className = `logline ${type}`;
  div.textContent = `[${now()}] ${msg}`;
  el.log.appendChild(div);
  el.log.scrollTop = el.log.scrollHeight;
}

function setProgress(pct, text, sizeText = "") {
  const clamped = Math.max(0, Math.min(100, pct));
  el.progressFill.style.width = `${clamped}%`;
  el.progressText.textContent = text ?? "";
  el.sizeText.textContent = sizeText ?? "";
}

function humanBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function safeFilename(name) {
  // 매우 단순한 정리
  return (name || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function guessFilenameFromUrl(url, fallbackExt = "") {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "download";
    // query로 파일명이 오는 경우도 있어서 일단 pathname 우선
    let base = last;
    // 확장자 없으면 fallback 붙이기
    if (!/\.[a-z0-9]{1,6}$/i.test(base) && fallbackExt) base += `.${fallbackExt}`;
    return base;
  } catch {
    return "download" + (fallbackExt ? `.${fallbackExt}` : "");
  }
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
  log("클립보드에 복사 완료", "ok");
}

// ============================
// BGM (Autoplay-safe)
// ============================
let bgmEnabled = true;

function updateBgmChip() {
  el.btnBgmToggle.textContent = `BGM: ${bgmEnabled ? "ON" : "OFF"}`;
  el.btnBgmToggle.classList.toggle("off", !bgmEnabled);
}

async function tryPlayBgm() {
  if (!bgmEnabled) return;

  try {
    // iOS/Chrome 정책: 음소거 상태로 autoplay는 가능할 때가 있음
    el.bgm.muted = false;
    await el.bgm.play();
    log("BGM 재생 시작", "ok");
    el.gate.classList.add("hidden");
  } catch (e1) {
    // 실패하면 게이트 띄우고, muted autoplay 한번 시도
    try {
      el.bgm.muted = true;
      await el.bgm.play();
      // 재생은 되지만 음소거 -> 첫 클릭 시 unmute 처리
      log("BGM 자동재생(음소거) 성공 — 클릭하면 소리 켜짐", "warn");
      el.gate.classList.remove("hidden");
    } catch (e2) {
      log("BGM 자동재생이 차단됨 — 버튼을 눌러 시작해줘", "warn");
      el.gate.classList.remove("hidden");
    }
  }
}

function stopBgm() {
  el.bgm.pause();
  el.bgm.currentTime = 0;
  log("BGM 정지", "info");
}

function toggleMute() {
  el.bgm.muted = !el.bgm.muted;
  log(`음소거: ${el.bgm.muted ? "ON" : "OFF"}`, "info");
}

// 게이트에서 확실히 재생
async function forceStartBgm() {
  if (!bgmEnabled) return;
  el.bgm.muted = false;
  try {
    await el.bgm.play();
    log("BGM 재생 시작(사용자 상호작용)", "ok");
    el.gate.classList.add("hidden");
  } catch (e) {
    log("BGM 재생 실패(브라우저 정책/오디오 URL 문제)", "bad");
  }
}

// ============================
// Browser Download (direct file URL)
// ============================
async function headCheck(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const ok = res.ok;
    const type = res.headers.get("content-type") || "";
    const len = Number(res.headers.get("content-length") || "0");
    log(`HEAD 응답: ${ok ? "OK" : "FAIL"} | type=${type} | size=${humanBytes(len)}`, ok ? "ok" : "bad");
    return { ok, type, len };
  } catch (e) {
    log("HEAD 검사 실패 (CORS/네트워크/서버 설정)", "warn");
    return { ok: false, type: "", len: 0 };
  }
}

async function downloadDirect(url, filenameHint) {
  setProgress(0, "다운로드 준비 중...");
  log(`다운로드 시작: ${url}`, "info");

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    setProgress(0, "실패: 네트워크/CORS", "");
    log("fetch 실패 (CORS/네트워크). 직접 파일 링크가 맞는지 확인해줘.", "bad");
    throw e;
  }

  if (!res.ok) {
    setProgress(0, `실패: HTTP ${res.status}`, "");
    log(`다운로드 실패: HTTP ${res.status}`, "bad");
    throw new Error(`HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const total = Number(res.headers.get("content-length") || "0");

  // 확장자 추정
  let fallbackExt = "";
  if (/audio\/mpeg/i.test(contentType)) fallbackExt = "mp3";
  else if (/audio\/wav/i.test(contentType)) fallbackExt = "wav";
  else if (/audio\/ogg/i.test(contentType)) fallbackExt = "ogg";
  else if (/video\/mp4/i.test(contentType)) fallbackExt = "mp4";
  else if (/video\/webm/i.test(contentType)) fallbackExt = "webm";

  let filename = safeFilename(filenameHint);
  if (!filename) filename = guessFilenameFromUrl(url, fallbackExt);
  if (!/\.[a-z0-9]{1,6}$/i.test(filename) && fallbackExt) filename += `.${fallbackExt}`;

  // 스트리밍 진행률 표시 (가능한 브라우저/서버에서만)
  const reader = res.body?.getReader?.();
  if (!reader) {
    // body 스트림 접근 불가 => blob로 한번에
    const blob = await res.blob();
    triggerSave(blob, filename);
    setProgress(100, "완료!", total ? humanBytes(total) : humanBytes(blob.size));
    log(`완료: ${filename}`, "ok");
    return;
  }

  const chunks = [];
  let received = 0;

  setProgress(0, "다운로드 중...", total ? humanBytes(total) : "");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;

    if (total > 0) {
      const pct = (received / total) * 100;
      setProgress(pct, "다운로드 중...", `${humanBytes(received)} / ${humanBytes(total)}`);
    } else {
      // total 모르면 받은 용량만 표시
      const wiggle = Math.min(95, (received / (5 * 1024 * 1024)) * 100); // 5MB 기준 임시
      setProgress(wiggle, "다운로드 중...", humanBytes(received));
    }
  }

  const blob = new Blob(chunks, { type: contentType || "application/octet-stream" });
  triggerSave(blob, filename);
  setProgress(100, "완료!", `${humanBytes(blob.size)}`);
  log(`완료: ${filename} (${humanBytes(blob.size)})`, "ok");
}

function triggerSave(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ============================
// yt-dlp command builder
// ============================
function buildYtDlpCommand(url, mode, outDir) {
  const safeUrl = url?.trim() ? `"${url.trim()}"` : `"https://example.com/..."`;
  const dir = outDir?.trim() ? outDir.trim() : "";

  // output template
  const outTpl = dir
    ? `"${dir}/%(title)s.%(ext)s"`
    : `"%(title)s.%(ext)s"`;

  if (mode === "audio") {
    return [
      "pip install -U yt-dlp",
      `yt-dlp -x --audio-format mp3 -o ${outTpl} ${safeUrl}`
    ].join("\n");
  }

  if (mode === "video") {
    return [
      "pip install -U yt-dlp",
      `yt-dlp -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best" -o ${outTpl} ${safeUrl}`
    ].join("\n");
  }

  // best (video+audio)
  return [
    "pip install -U yt-dlp",
    `yt-dlp -f "bv*+ba/best" -o ${outTpl} ${safeUrl}`
  ].join("\n");
}

function refreshCmd() {
  const url = el.inputUrl.value.trim();
  const mode = el.selectMode.value;
  const outDir = el.inputOutDir.value;
  el.cmdBox.textContent = buildYtDlpCommand(url, mode, outDir);
}

// ============================
// Events
// ============================
function bindAutoplayUnlock() {
  // 사용자 상호작용이 생기면 BGM을 확실히 켜기
  const unlock = async () => {
    if (!bgmEnabled) return;
    // muted로 자동재생 중이었다면, 여기서 unmute + play
    el.bgm.muted = false;
    try {
      await el.bgm.play();
      el.gate.classList.add("hidden");
      log("사용자 상호작용으로 BGM 재생 확정", "ok");
    } catch {
      // 무시
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function init() {
  // bgm set
  el.bgm.src = BACKGROUND_MUSIC_URL;

  updateBgmChip();
  log("페이지 로드됨", "info");
  log("브라우저 다운로드는 '직접 파일 URL'에서 가장 잘 동작함", "warn");

  // try autoplay
  tryPlayBgm();
  bindAutoplayUnlock();

  // cmd
  refreshCmd();

  // UI
  el.btnStartBgm.addEventListener("click", forceStartBgm);
  el.btnMuteToggle.addEventListener("click", toggleMute);

  el.btnBgmToggle.addEventListener("click", async () => {
    bgmEnabled = !bgmEnabled;
    updateBgmChip();
    if (!bgmEnabled) {
      stopBgm();
      el.gate.classList.add("hidden");
    } else {
      await tryPlayBgm();
      bindAutoplayUnlock();
    }
  });

  el.btnCopyLog.addEventListener("click", async () => {
    const lines = [...el.log.querySelectorAll(".logline")].map((x) => x.textContent).join("\n");
    await copyToClipboard(lines || "(로그 없음)");
  });

  el.inputUrl.addEventListener("input", refreshCmd);
  el.selectMode.addEventListener("change", refreshCmd);
  el.inputOutDir.addEventListener("input", refreshCmd);

  el.btnCopyCmd.addEventListener("click", async () => {
    await copyToClipboard(el.cmdBox.textContent);
  });

  el.btnExplain.addEventListener("click", () => {
    log("yt-dlp는 사이트 정책이 허용하는 범위 내에서 사용해야 해. 개인 소유/권한 있는 콘텐츠만 다운로드해줘.", "warn");
  });

  el.btnClear.addEventListener("click", () => {
    el.inputUrl.value = "";
    el.inputFilename.value = "";
    el.inputOutDir.value = "";
    el.selectMode.value = "best";
    refreshCmd();
    setProgress(0, "대기 중", "");
    log("입력값 초기화", "info");
  });

  el.btnHeadCheck.addEventListener("click", async () => {
    const url = el.inputUrl.value.trim();
    if (!url) return log("URL을 먼저 입력해줘", "warn");
    await headCheck(url);
  });

  el.btnDownload.addEventListener("click", async () => {
    const url = el.inputUrl.value.trim();
    const filename = el.inputFilename.value.trim();
    if (!url) return log("URL을 먼저 입력해줘", "warn");

    el.btnDownload.disabled = true;
    el.btnHeadCheck.disabled = true;

    try {
      // 먼저 head 시도(가능하면)
      await headCheck(url);
      await downloadDirect(url, filename);
    } catch (e) {
      log("다운로드 실패. (CORS/정책/직접파일링크 여부 확인)", "bad");
    } finally {
      el.btnDownload.disabled = false;
      el.btnHeadCheck.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", init);

