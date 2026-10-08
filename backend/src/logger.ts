import fs from "node:fs";
import path from "node:path";

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const backendLog = path.join(logDir, "backend.log");
const frontendLog = path.join(logDir, "frontend.log");

function writeLog(filePath: string, level: string, message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : "";
  const logLine = `[${timestamp}] [${level}] ${message}${metaStr}\n`;
  
  // Also log to console in dev mode
  if (level === "ERROR") {
    console.error(logLine.trim());
  } else {
    console.log(logLine.trim());
  }

  fs.appendFileSync(filePath, logLine);
}

export const logger = {
  info: (msg: string, meta?: any) => writeLog(backendLog, "INFO", msg, meta),
  warn: (msg: string, meta?: any) => writeLog(backendLog, "WARN", msg, meta),
  error: (msg: string, meta?: any) => writeLog(backendLog, "ERROR", msg, meta),
  
  // Specifically for saving frontend errors
  frontendError: (msg: string, meta?: any) => writeLog(frontendLog, "FRONTEND_ERROR", msg, meta),
};
