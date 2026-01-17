const $ = (id) => document.getElementById(id);

const el = {
  inputUrl: $("inputUrl"),
  inputFilename: $("inputFilename"),
  hint: $("hint"),

  btnDownload: $("btnDownload"),
  btnOpen: $("btnOpen"),
  btnClear: $("btnClear"),

  progressFill: $("progressFill"),
  progressText: $("progressText"),
  sizeText: $("sizeText"),

  selectMode: $("selectMode"),
  inputOutDir: $("inputOutDir"),
  cmdBox: $("cmdBox"),
  btnCopyCmd: $("btnCopyCmd"),

  btnCopyLog: $("btnCopyLog"),
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
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function safeFilename(name) {
  return (name || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
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

function isDirectFileUrl(url) {
  // 확장자로 빠른 판별 (쿼리/해시 제거)
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    return (
      path.endsWith(".mp3") || path.endsWith(".mp4") || path.endsWith(".webm") ||
      path.endsWith(".wav") || path.endsWith(".ogg") || path.endsWith(".m4a") ||
      path.endsWith(".mov") || path.endsWith(".mkv") || path.endsWith(".aac")
    );
  } catch {
    return false;
  }
}

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

function refreshCmdAndHint() {
  const url = el.inputUrl.value.trim();
  const mode = el.selectMode.value;
  const outDir = el.inputOutDir.value;

  el.cmdBox.textContent = buildYtDlpCommand(url, mode, outDir);

  if (!url) {
    el.hint.textContent = "URL을 입력하면 자동으로 판별해줄게.";
    el.btnDownload.disabled = true;
    return;
  }

  if (isDirectFileUrl(url)) {
    el.hint.textContent = "✅ 직접 파일 URL로 보임: 브라우저 다운로드 가능(단, 서버가 CORS 막으면 실패할 수 있음)";
    el.btnDownload.disabled = false;
  } else {
    el.hint.textContent = "❌ 페이지 URL로 보임(유튜브/사이트 등): 브라우저 다운로드 불가 → 아래 yt-dlp 명령어 사용";
    el.btnDownload.disabled = true; // CORS 에러 유발하는 fetch 시도 자체를 막음
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

  let filename = safeFilename(filenameHint);
  if (!filename) filename = "download";
  // 확장자 없으면 content-type 보고 최소한 붙여줌
  if (!/\.[a-z0-9]{1,6}$/i.test(filename)) {
    const ct = contentType.toLowerCase();
    if (ct.includes("audio/mpeg")) filename += ".mp3";
    else if (ct.includes("video/mp4")) filename += ".mp4";
    else if (ct.includes("video/webm")) filename += ".webm";
    else if (ct.includes("audio/wav")) filename += ".wav";
  }

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

async function copyLog() {
  const lines = [...el.log.querySelectorAll(".logline")]
    .map((x) => x.textContent)
    .join("\n");
  await navigator.clipboard.writeText(lines || "(로그 없음)");
  log("로그 복사 완료", "ok");
}

async function copyCmd() {
  await navigator.clipboard.writeText(el.cmdBox.textContent || "");
  log("명령어 복사 완료", "ok");
}

function init() {
  log("준비 완료", "ok");
  setProgress(0, "대기 중", "");

  el.btnDownload.disabled = true;

  el.inputUrl.addEventListener("input", refreshCmdAndHint);
  el.selectMode.addEventListener("change", refreshCmdAndHint);
  el.inputOutDir.addEventListener("input", refreshCmdAndHint);

  refreshCmdAndHint();

  el.btnOpen.addEventListener("click", () => {
    const url = el.inputUrl.value.trim();
    if (!url) return log("URL을 먼저 입력해줘", "warn");
    window.open(url, "_blank", "noopener,noreferrer");
    log("새 탭으로 열기", "info");
  });

  el.btnClear.addEventListener("click", () => {
    el.inputUrl.value = "";
    el.inputFilename.value = "";
    el.inputOutDir.value = "";
    el.selectMode.value = "best";
    setProgress(0, "대기 중", "");
    log("초기화 완료", "info");
    refreshCmdAndHint();
  });

  el.btnCopyLog.addEventListener("click", () => {
    copyLog().catch(() => log("로그 복사 실패(권한 문제)", "warn"));
  });

  el.btnCopyCmd.addEventListener("click", () => {
    copyCmd().catch(() => log("명령어 복사 실패(권한 문제)", "warn"));
  });

  el.btnDownload.addEventListener("click", async () => {
    const url = el.inputUrl.value.trim();
    const filename = el.inputFilename.value.trim();

    if (!url) return log("URL을 먼저 입력해줘", "warn");
    if (!isDirectFileUrl(url)) {
      log("이 URL은 직접 파일 링크가 아니라서 브라우저 다운로드 불가. 아래 yt-dlp 명령어를 사용해줘.", "warn");
      return;
    }

    el.btnDownload.disabled = true;

    try {
      await downloadDirect(url, filename);
    } catch {
      setProgress(0, "실패", "");
      log("다운로드 실패: 서버 CORS/권한/직접 파일 링크 여부 확인", "bad");
    } finally {
      // URL이 직접 파일일 때만 다시 활성화
      el.btnDownload.disabled = !isDirectFileUrl(el.inputUrl.value.trim());
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
