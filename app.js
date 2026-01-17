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
// ✅ WebAudio BGM (외부 mp3 없음 → 403/CORS 없음)
// =======================================================
let bgmEnabled = true;
let isMuted = false;

let audioCtx = null;
let master = null;
let clockTimer = null;
let step = 0;

function updateBgmChip() {
  el.btnBgmToggle.textContent = `BGM: ${bgmEnabled ? "ON" : "OFF"}`;
  el.btnBgmToggle.classList.toggle("off", !bgmEnabled);
}

function setMuteState(mute) {
  isMuted = !!mute;
  if (master) master.gain.value = isMuted ? 0 : 0.22;
  log(`음소거: ${isMuted ? "ON" : "OFF"}`, "info");
}

function ensureAudio() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  master = audioCtx.createGain();
  master.gain.value = 0.22;
  master.connect(audioCtx.destination);
}

function stopBgmSynth() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
  step = 0;
  log("BGM 정지", "info");
}

function playNote(freq, durMs = 120) {
  if (!audioCtx || !master) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = "sawtooth";
  osc.frequency.value = freq;

  filter.type = "lowpass";
  filter.frequency.value = 1200;
  filter.Q.value = 0.8;

  // ADSR 느낌
  const t = audioCtx.currentTime;
  const dur = durMs / 1000;

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function startBgmSynth() {
  if (!bgmEnabled) return;

  ensureAudio();

  if (audioCtx.state === "suspended") audioCtx.resume();

  if (clockTimer) return; // already playing

  // 간단한 레트로 아르페지오 (C minor-ish)
  const scale = [261.63, 311.13, 392.0, 466.16, 523.25, 622.25]; // C, Eb, G, Bb, C, Eb (Hz)
  const bass = [130.81, 155.56, 196.0, 233.08]; // C, Eb, G, Bb (한 옥타브 아래)

  const bpm = 120;
  const intervalMs = (60_000 / bpm) / 2; // 8th note

  log("BGM 재생 시작(WebAudio)", "ok");
  el.gate.classList.add("hidden");

  // mute 적용
  setMuteState(isMuted);

  clockTimer = setInterval(() => {
    if (!audioCtx) return;

    // 베이스: 4스텝마다
    if (step % 4 === 0) {
      const b = bass[(step / 4) % bass.length];
      playNote(b, 220);
    }

    // 리드: 매 스텝
    const n = scale[step % scale.length];
    // 약간의 변주
    const octave = (step % 8 < 4) ? 1 : 2;
    playNote(n * octave, 110);

    step++;
  }, intervalMs);
}

// autoplay 정책 대응: 사용자 상호작용 시 시작
function showGate() {
  el.gate.classList.remove("hidden");
}

function tryAutoStartBgm() {
  if (!bgmEnabled) return;

  // WebAudio는 대부분 "사용자 제스처" 필요 → 게이트 띄움
  showGate();
}

function bindAutoplayUnlock() {
  const unlock = async () => {
    if (!bgmEnabled) return;
    try {
      startBgmSynth();
    } catch {}
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
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
  log("페이지 로드됨", "info");
  log("BGM: 외부 mp3 없이 WebAudio로 생성(403/CORS 없음)", "ok");
  log("브라우저 다운로드는 '직접 파일 URL'에서 가장 잘 동작함", "warn");

  tryAutoStartBgm();
  bindAutoplayUnlock();

  refreshCmd();

  el.btnStartBgm.addEventListener("click", () => {
    startBgmSynth();
  });

  el.btnMuteToggle.addEventListener("click", () => {
    setMuteState(!isMuted);
  });

  el.btnBgmToggle.addEventListener("click", () => {
    bgmEnabled = !bgmEnabled;
    updateBgmChip();
    if (!bgmEnabled) {
      stopBgmSynth();
      el.gate.classList.add("hidden");
    } else {
      tryAutoStartBgm();
      bindAutoplayUnlock();
    }
  });

  el.btnCopyLog.addEventListener("click", async () => {
    const lines = [...el.log.querySelectorAll(".logline")]
      .map((x) => x.textContent)
      .join("\n");
    await copyToClipboard(lines || "(로그 없음)");
  });

  el.inputUrl.addEventListener("input", refreshCmd);
  el.selectMode.addEventListener("change", refreshCmd);
  el.inputOutDir.addEventListener("input", refreshCmd);

  el.btnCopyCmd.addEventListener("click", async () => {
    await copyToClipboard(el.cmdBox.textContent);
  });

  el.btnExplain.addEventListener("click", () => {
    log("yt-dlp는 사이트 정책이 허용하는 범위 내에서 사용해야 해. 권한 있는 콘텐츠만 다운로드해줘.", "warn");
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
