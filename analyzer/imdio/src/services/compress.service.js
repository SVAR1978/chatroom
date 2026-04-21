const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const { randomUUID } = require("crypto");
const { tempDir, cleanupAfterMinutes } = require("../config");
const { HttpError } = require("../utils/httpError");
const {
  sanitizeFilename,
  getExtension,
  assertSupportedExtension,
  assertMimeAllowedForExtension,
  validateFirstChunkHeader,
} = require("./validate");

const jobs = new Map();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const incomingDir = path.join(tempDir, "incoming");
const compressedDir = path.join(tempDir, "compressed");
ensureDir(incomingDir);
ensureDir(compressedDir);

function profileToBitrate(profile, customBitrateKbps) {
  const custom = Number(customBitrateKbps || 0);
  if (custom >= 32 && custom <= 320) {
    return custom;
  }

  if (profile === "voice") return 64;
  if (profile === "high") return 192;
  return 96;
}

async function readHeader(filePath, bytes = 8192) {
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.slice(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function runFfmpegCompress({ inputPath, outputPath, bitrateKbps }) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-map_metadata",
      "-1",
      "-acodec",
      "libmp3lame",
      "-b:a",
      `${bitrateKbps}k`,
      outputPath,
    ];

    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      reject(new HttpError(500, `FFmpeg execution failed: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new HttpError(500, `Compression failed. FFmpeg exited with code ${code}`, stderr.slice(-2000)));
        return;
      }
      resolve();
    });
  });
}

function scheduleCleanup(jobId) {
  const minutes = Math.max(1, Number(cleanupAfterMinutes || 30));
  setTimeout(async () => {
    const job = jobs.get(jobId);
    if (!job) return;

    jobs.delete(jobId);
    await Promise.allSettled([
      fsp.unlink(job.inputPath),
      fsp.unlink(job.outputPath),
    ]);
  }, minutes * 60 * 1000);
}

async function compressAudio({ file, profile, customBitrateKbps }) {
  if (!file) {
    throw new HttpError(400, "audio file is required");
  }

  const safeName = sanitizeFilename(file.originalname || "audio");
  const ext = getExtension(safeName);

  assertSupportedExtension(ext);
  assertMimeAllowedForExtension(ext, file.mimetype || "");

  const header = await readHeader(file.path);
  validateFirstChunkHeader({ ext, declaredMime: file.mimetype || "", firstChunkBuffer: header });

  const bitrateKbps = profileToBitrate(profile, customBitrateKbps);
  const jobId = randomUUID();
  const outputName = `${path.parse(safeName).name}_compressed_${bitrateKbps}k.mp3`;
  const outputPath = path.join(compressedDir, `${jobId}_${outputName}`);

  await runFfmpegCompress({
    inputPath: file.path,
    outputPath,
    bitrateKbps,
  });

  const [inStat, outStat] = await Promise.all([fsp.stat(file.path), fsp.stat(outputPath)]);

  const savedBytes = Math.max(0, inStat.size - outStat.size);
  const savedPercent = inStat.size > 0 ? (savedBytes / inStat.size) * 100 : 0;

  jobs.set(jobId, {
    jobId,
    inputPath: file.path,
    outputPath,
    originalName: safeName,
    outputName,
    mimeType: "audio/mpeg",
    createdAt: new Date().toISOString(),
  });

  scheduleCleanup(jobId);

  return {
    jobId,
    originalName: safeName,
    outputName,
    bitrateKbps,
    originalSizeMB: Number((inStat.size / (1024 * 1024)).toFixed(2)),
    compressedSizeMB: Number((outStat.size / (1024 * 1024)).toFixed(2)),
    savedPercent: Number(savedPercent.toFixed(2)),
    downloadUrl: `/api/compress/${jobId}/download`,
  };
}

function getCompressedJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    throw new HttpError(404, "Compressed file not found or expired");
  }
  return job;
}

module.exports = {
  incomingDir,
  compressAudio,
  getCompressedJob,
};
