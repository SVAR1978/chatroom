const path = require("path");
const { HttpError } = require("../utils/httpError");

const AUDIO_MIME_MAP = {
  ".mp3": ["audio/mpeg", "audio/mp3"],
  ".wav": ["audio/wav", "audio/x-wav", "audio/wave"],
  ".ogg": ["audio/ogg"],
  ".webm": ["audio/webm", "video/webm"],
  ".aac": ["audio/aac", "audio/x-aac"],
  ".flac": ["audio/flac", "audio/x-flac"],
};

const CANONICAL_MIME = {
  "audio/mp3": "audio/mpeg",
  "audio/mpeg": "audio/mpeg",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/ogg": "audio/ogg",
  "audio/webm": "audio/webm",
  "video/webm": "audio/webm",
  "audio/aac": "audio/aac",
  "audio/x-aac": "audio/aac",
  "audio/flac": "audio/flac",
  "audio/x-flac": "audio/flac",
};

function sanitizeFilename(name) {
  const base = path.basename(name || "audio");
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 128);

  if (!cleaned) {
    return "audio_file";
  }
  return cleaned;
}

function getExtension(fileName) {
  return path.extname(fileName || "").toLowerCase();
}

function assertSupportedExtension(ext) {
  if (!AUDIO_MIME_MAP[ext]) {
    throw new HttpError(400, `Unsupported extension: ${ext || "unknown"}`);
  }
}

function canonicalMime(mime) {
  return CANONICAL_MIME[(mime || "").toLowerCase()] || "";
}

function sniffAudioMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return "";
  }

  const ascii4 = buffer.slice(0, 4).toString("ascii");
  if (ascii4 === "fLaC") return "audio/flac";
  if (ascii4 === "OggS") return "audio/ogg";
  if (ascii4 === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return "audio/mpeg"; // ID3

  // AAC ADTS header (syncword 0xFFF)
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0) {
    return "audio/aac";
  }

  // WebM (EBML header)
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "audio/webm";
  }

  // MP3 frame sync fallback
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }

  return "";
}

function assertNotMalformedHeader(buffer, detectedMime) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new HttpError(400, "Malformed audio header: file is too short");
  }

  if (detectedMime === "audio/wav") {
    if (buffer.length < 44 || buffer.slice(0, 4).toString("ascii") !== "RIFF") {
      throw new HttpError(400, "Malformed WAV header");
    }
  }

  if (detectedMime === "audio/flac") {
    if (buffer.slice(0, 4).toString("ascii") !== "fLaC") {
      throw new HttpError(400, "Malformed FLAC header");
    }
  }

  if (detectedMime === "audio/ogg") {
    if (buffer.slice(0, 4).toString("ascii") !== "OggS") {
      throw new HttpError(400, "Malformed OGG header");
    }
  }
}

function assertMimeAllowedForExtension(ext, declaredMime) {
  const canonical = canonicalMime(declaredMime);
  const allowed = (AUDIO_MIME_MAP[ext] || []).map(canonicalMime);
  if (!allowed.includes(canonical)) {
    throw new HttpError(400, `MIME ${declaredMime} does not match extension ${ext}`);
  }
}

function validateFirstChunkHeader({ ext, declaredMime, firstChunkBuffer }) {
  const detectedMime = sniffAudioMime(firstChunkBuffer);
  if (!detectedMime) {
    throw new HttpError(400, "Unable to detect audio MIME from file header");
  }

  const expectedByExt = (AUDIO_MIME_MAP[ext] || []).map(canonicalMime);
  const declaredCanonical = canonicalMime(declaredMime);

  if (declaredCanonical && !expectedByExt.includes(declaredCanonical)) {
    throw new HttpError(400, "Declared MIME does not match extension");
  }

  if (!expectedByExt.includes(canonicalMime(detectedMime))) {
    throw new HttpError(400, "Detected MIME does not match file extension");
  }

  assertNotMalformedHeader(firstChunkBuffer, canonicalMime(detectedMime));

  return canonicalMime(detectedMime);
}

function validateAudioPolicy({
  category,
  ext,
  sizeBytes,
  durationSeconds,
  chunkThresholdBytes,
  maxDefaultSizeBytes,
}) {
  const c = (category || "podcast").toLowerCase();
  const duration = Number(durationSeconds || 0);

  if (c === "voice") {
    if (sizeBytes > 5 * 1024 * 1024) {
      throw new HttpError(400, "Voice message max size is 5 MB");
    }
    if (duration > 5 * 60) {
      throw new HttpError(400, "Voice message max duration is 5 minutes");
    }
  } else if (c === "podcast") {
    if (sizeBytes > 500 * 1024 * 1024) {
      throw new HttpError(400, "Podcast max size is 500 MB");
    }
    if (duration > 3 * 60 * 60) {
      throw new HttpError(400, "Podcast max duration is 3 hours");
    }
  } else if (c === "studio") {
    if (![".wav", ".flac"].includes(ext)) {
      throw new HttpError(400, "Studio category only supports WAV or FLAC");
    }
    if (sizeBytes > 2 * 1024 * 1024 * 1024) {
      throw new HttpError(400, "Studio files max size is 2 GB");
    }
  } else {
    if (sizeBytes > maxDefaultSizeBytes) {
      throw new HttpError(400, "File exceeds max configured size");
    }
  }

  return {
    requiresChunked: sizeBytes > chunkThresholdBytes,
  };
}

module.exports = {
  sanitizeFilename,
  getExtension,
  assertSupportedExtension,
  assertMimeAllowedForExtension,
  validateFirstChunkHeader,
  validateAudioPolicy,
  canonicalMime,
};
