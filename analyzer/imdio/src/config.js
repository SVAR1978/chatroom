const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

function num(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

module.exports = {
  env: process.env.NODE_ENV || "development",
  port: num("PORT", 8080),
  maxFileSizeBytes: num("MAX_FILE_SIZE_MB", 500) * 1024 * 1024,
  tempDir: process.env.TEMP_DIR || path.join(process.cwd(), "tmp"),
  cleanupAfterMinutes: num("CLEANUP_AFTER_MINUTES", 30),
};
