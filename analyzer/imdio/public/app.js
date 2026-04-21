const ACCEPTED_EXTS = new Set(["mp3", "wav", "ogg", "webm", "aac", "flac"]);

const el = {
  profile: document.getElementById("profile"),
  customBitrate: document.getElementById("customBitrate"),
  audioFile: document.getElementById("audioFile"),
  compressBtn: document.getElementById("compressBtn"),
  progress: document.getElementById("progress"),
  stats: document.getElementById("stats"),
  result: document.getElementById("result"),
  downloadLink: document.getElementById("downloadLink"),
};

function getExtension(name) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

function requireAudio(file) {
  if (!file) throw new Error("Select an audio file first");
  const ext = getExtension(file.name);
  if (!ACCEPTED_EXTS.has(ext)) {
    throw new Error("Allowed formats: mp3, wav, ogg, webm, aac, flac");
  }
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m}m ${s}s`;
}

function setStats({ percent, kbps, etaSeconds }) {
  el.progress.value = Math.max(0, Math.min(100, percent));
  el.stats.innerHTML = `
    <span>${percent.toFixed(2)}%</span>
    <span>${kbps.toFixed(2)} KB/s</span>
    <span>ETA ${formatEta(etaSeconds)}</span>
  `;
}

function compressRequestXHR({ file, profile, customBitrate }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = performance.now();

    xhr.open("POST", "/api/compress");

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;

      const elapsed = Math.max(0.2, (performance.now() - startedAt) / 1000);
      const percent = (evt.loaded / evt.total) * 100;
      const kbps = evt.loaded / elapsed / 1024;
      const etaSeconds = kbps > 0 ? (evt.total - evt.loaded) / (kbps * 1024) : Infinity;

      setStats({ percent, kbps, etaSeconds });
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onload = () => {
      let payload = {};
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch (_err) {
        reject(new Error("Server returned invalid response"));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(payload.error || `Compression failed (${xhr.status})`));
        return;
      }

      resolve(payload);
    };

    const form = new FormData();
    form.append("audio", file);
    form.append("profile", profile);
    if (customBitrate) {
      form.append("customBitrateKbps", String(customBitrate));
    }

    xhr.send(form);
  });
}

function showResult(data) {
  el.result.textContent = JSON.stringify(data, null, 2);

  el.downloadLink.hidden = false;
  el.downloadLink.href = data.downloadUrl;
  el.downloadLink.download = data.outputName || "compressed_audio.mp3";
}

async function onCompress() {
  try {
    el.result.textContent = "";
    el.downloadLink.hidden = true;
    setStats({ percent: 0, kbps: 0, etaSeconds: Infinity });

    const file = el.audioFile.files[0];
    requireAudio(file);

    const profile = el.profile.value;
    const customBitrate = Number(el.customBitrate.value || 0);

    const result = await compressRequestXHR({
      file,
      profile,
      customBitrate,
    });

    setStats({ percent: 100, kbps: 0, etaSeconds: 0 });
    showResult(result);
  } catch (err) {
    el.result.textContent = `Error: ${err.message}`;
  }
}

el.compressBtn.addEventListener("click", onCompress);
