import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";

import { prisma } from "./db";
import { clients, broadcast } from "./state";
import { handleAuth, broadcastOnlineUsers } from "./modules/auth";
import { handleRoomJoin, handleRoomLeave } from "./modules/rooms";
import { handleMessage, handleEditMessage, handleDeleteMessage } from "./modules/messages";
import { handleCommand } from "./modules/commands";
import { handleImageAttachment } from "./modules/attachments";
import { ClientEvent } from "./types";
import { handleAuthRoutes } from "./authAPI";
import { logger } from "./logger";
import { handleRoomRoutes } from "./roomAPI";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";
const LISTEN_HOST = HOST === "0.0.0.0" ? "0.0.0.0" : HOST;
const PUBLIC_HOST = process.env.PUBLIC_HOST ?? "localhost";
const HTTP_PROTOCOL = process.env.HTTP_PROTOCOL ?? "http";
const WS_PROTOCOL = process.env.WS_PROTOCOL ?? "ws";
const FRONTEND_DIST_ROOT = path.resolve(process.cwd(), "frontend", "dist");
const WEB_URL = `${HTTP_PROTOCOL}://${PUBLIC_HOST}:${PORT}`;
const SERVER_URL = `${WS_PROTOCOL}://${PUBLIC_HOST}:${PORT}`;
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const server = createServer((req, res) => void handleHttpRequest(req, res));
const wss = new WebSocketServer({ server });

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function getSafePath(root: string, route: string): string | null {
  const cleaned = route.replace(/^\/+/, "");
  const resolved = path.resolve(root, cleaned);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

async function serveStaticFile(filePath: string, res: ServerResponse): Promise<boolean> {
  if (!(await fileExists(filePath))) return false;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const body = await readFile(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(body);
  return true;
}

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS for API (simple open CORS for dev)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  logger.info(`HTTP ${req.method} ${req.url}`);

  if (req.method === "POST" && req.url === "/api/logs") {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    await new Promise(resolve => req.on("end", resolve));
    try {
      const logData = JSON.parse(body);
      logger.frontendError(logData.message, { url: logData.url, userAgent: logData.userAgent });
    } catch (e) {
      // Ignore invalid JSON from frontend logs
    }
    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (await handleAuthRoutes(req, res)) return;

  const authHeader = req.headers.authorization;
  let userId = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const session = await prisma.session.findUnique({ where: { id: token } });
    if (session && session.expiresAt > new Date()) {
      userId = session.userId;
    }
  }

  if (userId && await handleRoomRoutes(req, res, userId)) return;

  const route = req.url?.split("?")[0] ?? "/";
  if (route === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (route === "/" || route === "/index.html") {
    try {
      const frontendIndex = path.join(FRONTEND_DIST_ROOT, "index.html");
      if (await serveStaticFile(frontendIndex, res)) return;
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("No frontend found. Run npm run build:client.");
      return;
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Failed to load chat page.");
      return;
    }
  }
  const frontendFile = getSafePath(FRONTEND_DIST_ROOT, route);
  if (frontendFile && (await serveStaticFile(frontendFile, res))) return;
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
}

wss.on("connection", async (socket, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    socket.send(JSON.stringify({ type: "error", message: "Unauthorized: Missing token" }));
    socket.close(1008, "Unauthorized");
    return;
  }

  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true }
  });

  if (!session || session.expiresAt < new Date()) {
    socket.send(JSON.stringify({ type: "error", message: "Unauthorized: Invalid or expired token" }));
    socket.close(1008, "Unauthorized");
    return;
  }

  const userRooms = await prisma.roomMember.findMany({ where: { userId: session.user.id } });
  const roomIds = new Set(userRooms.map(r => r.roomId));
  
  let generalRoom = await prisma.room.findFirst({ where: { name: "general" } });
  if (!generalRoom) {
    generalRoom = await prisma.room.create({ data: { name: "general", isPrivate: false } });
  }
  
  if (!roomIds.has(generalRoom.id)) {
    await prisma.roomMember.create({ data: { roomId: generalRoom.id, userId: session.user.id } });
    roomIds.add(generalRoom.id);
  }

  clients.set(socket, { userId: session.user.id, username: session.user.username, name: session.user.displayName, rooms: roomIds });

  socket.send(JSON.stringify({ type: "auth.success", name: session.user.displayName }));
  socket.send(JSON.stringify({ type: "system.notice", content: "Connected to chat. Join a room or use /help" }));
  
  broadcastOnlineUsers();

  socket.on("message", (raw) => {
    try {
      const str = raw.toString().trim();
      if (!str) return;

      const event = JSON.parse(str) as ClientEvent;

      switch (event.type) {
        case "ping":
          socket.send(JSON.stringify({ type: "pong" }));
          break;
        case "message.send":
          handleMessage(socket, event.roomId, event.content, event.clientMessageId, event.replyToId, event.attachmentId);
          break;
        case "message.edit":
          handleEditMessage(socket, event.messageId, event.content);
          break;
        case "message.delete":
          handleDeleteMessage(socket, event.messageId);
          break;
        case "ai.ask":
          import("./modules/ai").then(m => m.handleAIAsk(socket, event.roomId, event.prompt, event.isPrivate, event.attachmentId));
          break;
        case "room.join":
          handleRoomJoin(socket, event.roomId);
          break;
        case "room.leave":
          handleRoomLeave(socket, event.roomId);
          break;
        case "auth.rename":
          handleAuth(socket, event.name);
          break;
        case "command.execute":
          handleCommand(socket, event.command, event.args);
          if (event.command === "who") {
            broadcastOnlineUsers();
          }
          break;
        case "attachment.image":
          handleImageAttachment(socket, event.roomId, event.base64, event.mimeType);
          break;
        default:
          socket.send(JSON.stringify({ type: "error", message: "Unknown event type" }));
      }
    } catch (err) {
      console.error("Invalid WS message format", err);
    }
  });

  socket.on("close", () => {
    const data = clients.get(socket);
    clients.delete(socket);
    if (data) {
      for (const roomId of data.rooms) {
        broadcast({ type: "system.notice", roomId, content: `${data.name} left.` }, undefined, roomId);
      }
      broadcastOnlineUsers();
    }
  });
});

server.listen(PORT, LISTEN_HOST, () => {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`Chatroom Server Running`);
  console.log(`${"═".repeat(70)}`);
  console.log(`Web: ${WEB_URL}`);
  console.log(`WebSocket: ${SERVER_URL}`);
  console.log(`${"═".repeat(70)}\n`);
});

process.on("SIGINT", () => {
  void prisma.$disconnect().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void prisma.$disconnect().finally(() => process.exit(0));
});
