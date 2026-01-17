const $ = (id) => document.getElementById(id);

const el = {
  inputUrl: $("inputUrl"),
  inputFilename: $("inputFilename"),
  btnDownload: $("btnDownload"),
  btnOpen: $("btnOpen"),
  btnHeadCheck: $("btnHeadCheck"),
  btnClear: $("btnClear"),
  btnCopyLog: $("btnCopyLog"),

  progressFill: $("progressFill"),
  progressText: $("progressText"),
  sizeText: $("sizeText"),

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

function extFromContentType(ct) {
  const c = (ct || "").toLowerCase();
  if (c.includes("audio/mpeg")) return "mp3";
  if (c.includes("audio/wav")) return "wav";
  if (c.includes("audio/ogg")) return "ogg";
  if (c.includes("video/mp4")) return "mp4";
  if (c.includes("video/webm")) return "webm";
  return "";
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

async function headCheck(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const ok = res.ok;
    const type = res.headers.get("content-type") || "";
    const len = Number(res.headers.get("content-length") || "0");
    log(`HEAD: ${ok ? "OK" : "FAIL"} | type=${type || "unknown"} | size=${humanBytes(len)}`, ok ? "ok" : "bad");
    return { ok, type, len, status: res.status };
  } catch {
    log("HEAD 검사 실패 (CORS/서버에서 HEAD 차단/네트워크)", "warn");
    return { ok: false, type: "", len: 0, status: 0 };
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
  const fallbackExt = extFromContentType(contentType);

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

async function copyLog() {
  const lines = [...el.log.querySelectorAll(".logline")]
    .map((x) => x.textContent)
    .join("\n");
  await navigator.clipboard.writeText(lines || "(로그 없음)");
  log("로그 복사 완료", "ok");
}

function init() {
  log("준비 완료", "ok");
  setProgress(0, "대기 중", "");

  el.btnOpen.addEventListener("click", () => {
    const url = el.inputUrl.value.trim();
    if (!url) return log("URL을 먼저 입력해줘", "warn");
    window.open(url, "_blank", "noopener,noreferrer");
    log("새 탭으로 열기", "info");
  });

  el.btnHeadCheck.addEventListener("click", async () => {
    const url = el.inputUrl.value.trim();
    if (!url) return log("URL을 먼저 입력해줘", "warn");
    await headCheck(url);
  });

  el.btnClear.addEventListener("click", () => {
    el.inputUrl.value = "";
    el.inputFilename.value = "";
    setProgress(0, "대기 중", "");
    log("초기화 완료", "info");
  });

  el.btnCopyLog.addEventListener("click", () => {
    copyLog().catch(() => log("로그 복사 실패(권한 문제)", "warn"));
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
      setProgress(0, "실패", "");
      log("다운로드 실패: 직접 파일 링크인지 / CORS / 서버 차단 여부 확인", "bad");
    } finally {
      el.btnDownload.disabled = false;
      el.btnHeadCheck.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
