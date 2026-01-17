const $ = (id) => document.getElementById(id);

const el = {
  gate: $("autoplayGate"),
  btnStartBgm: $("btnStartBgm"),
  btnMuteToggle: $("btnMuteToggle"),
  btnBgmToggle: $("btnBgmToggle"),
  btnCopyLog: $("btnCopyLog"),

  inputBgmUrl: $("inputBgmUrl"),
  bgmStatus: $("bgmStatus"),
  btnApplyBgm: $("btnApplyBgm"),
  btnTestBgm: $("btnTestBgm"),
  btnClearBgm: $("btnClearBgm"),

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

const LS_BGM_KEY = "bgm_url_v1";

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

function setStatus(text, kind = "info") {
  el.bgmStatus.textContent = text;
  el.bgmStatus.className = `status ${kind}`;
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
    let base = last;
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

// =======================================================
// BGM (LINK BASED)
// =======================================================
let bgmEnabled = true;

function updateBgmChip() {
  el.btnBgmToggle.textContent = `BGM: ${bgmEnabled ? "ON" : "OFF"}`;
  el.btnBgmToggle.classList.toggle("off", !bgmEnabled);
}

function stopBgm() {
  try {
    el.bgm.pause();
    el.bgm.currentTime = 0;
  } catch {}
  log("BGM 정지", "info");
}

async function tryPlayBgm() {
  if (!bgmEnabled) return;

  // src가 없으면 게이트 띄우고 안내
  if (!el.bgm.src) {
    setStatus("BGM 링크가 없음", "warn");
    el.gate.classList.remove("hidden");
    return;
  }

  // autoplay 정책 때문에 실패하면 게이트 노출
  try {
    await el.bgm.play();
    el.gate.classList.add("hidden");
    setStatus("재생 중", "ok");
    log("BGM 재생 시작", "ok");
  } catch {
    setStatus("자동 재생 차단(클릭 필요)", "warn");
    el.gate.classList.remove("hidden");
    log("BGM 자동재생이 차단됨 — 버튼/클릭으로 시작해줘", "warn");
  }
}

async function forceStartBgm() {
  if (!bgmEnabled) return;

  if (!el.bgm.src) {
    setStatus("BGM 링크가 없음", "warn");
    log("BGM URL을 먼저 넣어줘", "warn");
    return;
  }

  try {
    await el.bgm.play();
    el.gate.classList.add("hidden");
    setStatus("재생 중", "ok");
    log("BGM 재생 시작(사용자 상호작용)", "ok");
  } catch (e) {
    // 여기서 실패하면 대부분 403/CORS/포맷 문제
    setStatus("재생 실패(403/CORS/포맷)", "bad");
    log("BGM 재생 실패: 링크가 403/CORS로 막혔거나 오디오 포맷 문제일 수 있어", "bad");
  }
}

function toggleMute() {
  el.bgm.muted = !el.bgm.muted;
  log(`음소거: ${el.bgm.muted ? "ON" : "OFF"}`, "info");
}

function saveBgmUrl(url) {
  localStorage.setItem(LS_BGM_KEY, url);
}

function loadBgmUrl() {
  return localStorage.getItem(LS_BGM_KEY) || "";
}

function setBgmUrl(url) {
  const u = (url || "").trim();
  el.bgm.src = u;
  el.bgm.load();

  if (u) {
    saveBgmUrl(u);
    setStatus("링크 적용됨(재생 시도 중...)", "info");
    log(`BGM 링크 적용: ${u}`, "info");
  } else {
    localStorage.removeItem(LS_BGM_KEY);
    setStatus("BGM 링크 없음", "warn");
    log("BGM 링크 초기화", "info");
  }
}

async function testBgmUrl(url) {
  const u = (url || "").trim();
  if (!u) {
    setStatus("테스트할 링크가 없음", "warn");
    return;
  }

  // HEAD로 테스트(가능할 때만). CORS 때문에 여기서 실패해도 실제 재생은 될 수 있음.
  try {
    const res = await fetch(u, { method: "HEAD" });
    if (!res.ok) {
      setStatus(`HEAD 실패: HTTP ${res.status}`, "warn");
      log(`BGM 링크 HEAD 실패: HTTP ${res.status} (재생도 막힐 가능성 큼)`, "warn");
      return;
    }
    const ct = res.headers.get("content-type") || "";
    setStatus(`HEAD OK (${ct || "content-type 없음"})`, "ok");
    log(`BGM 링크 HEAD OK | type=${ct || "unknown"}`, "ok");
  } catch {
    setStatus("HEAD 테스트 불가(CORS) — 재생으로 확인", "warn");
    log("BGM 링크 HEAD 테스트 실패(CORS). 재생 시도로 확인해야 함", "warn");
  }
}

// 오디오 이벤트로 403/에러 감지
function bindBgmEvents() {
  el.bgm.addEventListener("playing", () => setStatus("재생 중", "ok"));
  el.bgm.addEventListener("pause", () => {
    if (bgmEnabled) setStatus("일시정지", "warn");
  });
  el.bgm.addEventListener("error", () => {
    setStatus("로드 실패(403/CORS/링크 문제)", "bad");
    log("BGM 로드 실패: 403(Forbidden) 또는 CORS/핫링크 차단 가능성이 큼", "bad");
  });
}

// =======================================================
// Browser Download (direct file URL)
// =======================================================
async function headCheck(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const ok = res.ok;
    const type = res.headers.get("content-type") || "";
    const len = Number(res.headers.get("content-length") || "0");
    log(`HEAD: ${ok ? "OK" : "FAIL"} | type=${type} | size=${humanBytes(len)}`, ok ? "ok" : "bad");
    return { ok, type, len };
  } catch {
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
  } catch {
    setProgress(0, "실패: 네트워크/CORS", "");
    log("fetch 실패 (CORS/네트워크). 직접 파일 링크인지 확인해줘.", "bad");
    throw new Error("fetch failed");
  }

  if (!res.ok) {
    setProgress(0, `실패: HTTP ${res.status}`, "");
    log(`다운로드 실패: HTTP ${res.status}`, "bad");
    throw new Error(`HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const total = Number(res.headers.get("content-length") || "0");

  let fallbackExt = "";
  if (/audio\/mpeg/i.test(contentType)) fallbackExt = "mp3";
  else if (/audio\/wav/i.test(contentType)) fallbackExt = "wav";
  else if (/audio\/ogg/i.test(contentType)) fallbackExt = "ogg";
  else if (/video\/mp4/i.test(contentType)) fallbackExt = "mp4";
  else if (/video\/webm/i.test(contentType)) fallbackExt = "webm";

  let filename = safeFilename(filenameHint);
  if (!filename) filename = guessFilenameFromUrl(url, fallbackExt);
  if (!/\.[a-z0-9]{1,6}$/i.test(filename) && fallbackExt) filename += `.${fallbackExt}`;

  const reader = res.body?.getReader?.();
  if (!reader) {
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
      const wiggle = Math.min(95, (received / (5 * 1024 * 1024)) * 100);
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

// =======================================================
// yt-dlp command builder
// =======================================================
function buildYtDlpCommand(url, mode, outDir) {
  const safeUrl = url?.trim() ? `"${url.trim()}"` : `"https://example.com/..."`;
  const dir = outDir?.trim() ? outDir.trim() : "";
  const outTpl = dir ? `"${dir}/%(title)s.%(ext)s"` : `"%(title)s.%(ext)s"`;

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

// =======================================================
// Init
// =======================================================
function init() {
  updateBgmChip();
  bindBgmEvents();

  log("페이지 로드됨", "info");
  log("BGM은 링크 기반. 링크가 403/CORS로 막히면 재생 불가", "warn");

  // load saved BGM url
  const saved = loadBgmUrl();
  if (saved) {
    el.inputBgmUrl.value = saved;
    setBgmUrl(saved);
    setStatus("저장된 링크 로드됨(재생 시도는 클릭 필요할 수 있음)", "info");
  } else {
    setStatus("BGM 링크 없음", "warn");
  }

  // autoplay 정책 대응: 들어오면 재생 시도 -> 막히면 gate 표시
  tryPlayBgm();

  // 사용자 상호작용 발생하면 자동 재시도
  const unlock = () => {
    if (bgmEnabled) forceStartBgm();
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  // BGM UI
  el.btnStartBgm.addEventListener("click", forceStartBgm);
  el.btnMuteToggle.addEventListener("click", toggleMute);

  el.btnBgmToggle.addEventListener("click", () => {
    bgmEnabled = !bgmEnabled;
    updateBgmChip();
    if (!bgmEnabled) {
      stopBgm();
      el.gate.classList.add("hidden");
      setStatus("BGM OFF", "warn");
    } else {
      setStatus("BGM ON", "info");
      tryPlayBgm();
    }
  });

  el.btnApplyBgm.addEventListener("click", () => {
    const url = el.inputBgmUrl.value.trim();
    setBgmUrl(url);
    // 적용하면 바로 재생은 시도 (막히면 gate)
    tryPlayBgm();
  });

  el.btnTestBgm.addEventListener("click", async () => {
    await testBgmUrl(el.inputBgmUrl.value);
  });

  el.btnClearBgm.addEventListener("click", () => {
    el.inputBgmUrl.value = "";
    setBgmUrl("");
    stopBgm();
    el.gate.classList.add("hidden");
  });

  // log copy
  el.btnCopyLog.addEventListener("click", async () => {
    const lines = [...el.log.querySelectorAll(".logline")]
      .map((x) => x.textContent)
      .join("\n");
    await copyToClipboard(lines || "(로그 없음)");
  });

  // cmd
  refreshCmd();
  el.inputUrl.addEventListener("input", refreshCmd);
  el.selectMode.addEventListener("change", refreshCmd);
  el.inputOutDir.addEventListener("input", refreshCmd);

  el.btnCopyCmd.addEventListener("click", async () => {
    await copyToClipboard(el.cmdBox.textContent);
  });

  el.btnExplain.addEventListener("click", () => {
    log("yt-dlp는 사이트 정책이 허용하는 범위 내에서 사용해야 해. 권한 있는 콘텐츠만 다운로드해줘.", "warn");
  });

  // downloader
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
      await headCheck(url);
      await downloadDirect(url, filename);
    } catch {
      log("다운로드 실패 (CORS/정책/직접파일링크 여부 확인)", "bad");
      setProgress(0, "실패", "");
    } finally {
      el.btnDownload.disabled = false;
      el.btnHeadCheck.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
