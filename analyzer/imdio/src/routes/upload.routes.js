const path = require("path");
const express = require("express");
const multer = require("multer");
const { maxFileSizeBytes } = require("../config");
const { incomingDir, compressAudio, getCompressedJob } = require("../services/compress.service");

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, incomingDir),
    filename: (_req, file, cb) => {
      const stamp = Date.now();
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${stamp}_${safe}`);
    },
  }),
  limits: {
    fileSize: maxFileSizeBytes,
  },
});

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.post(
  "/compress",
  upload.single("audio"),
  asyncHandler(async (req, res) => {
    const { profile, customBitrateKbps } = req.body || {};

    const result = await compressAudio({
      file: req.file,
      profile: String(profile || "balanced").toLowerCase(),
      customBitrateKbps: Number(customBitrateKbps || 0),
    });

    res.json(result);
  })
);

router.get(
  "/compress/:jobId/download",
  asyncHandler(async (req, res) => {
    const job = getCompressedJob(req.params.jobId);
    res.setHeader("Content-Type", job.mimeType);
    return res.download(job.outputPath, path.basename(job.outputName));
  })
);

module.exports = { uploadRouter: router };
