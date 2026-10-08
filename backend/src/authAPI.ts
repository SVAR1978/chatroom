import { IncomingMessage, ServerResponse } from "node:http";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const buf = scryptSync(password, salt, 64);
  return `${salt}:${buf.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const hashedBuffer = scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, "hex");
  if (hashedBuffer.length !== keyBuffer.length) return false;
  return timingSafeEqual(hashedBuffer, keyBuffer);
}

export async function handleAuthRoutes(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "/";

  if (req.method === "POST" && (url === "/api/register" || url === "/api/login")) {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    
    await new Promise((resolve) => req.on("end", resolve));

    try {
      const { username, password, displayName } = JSON.parse(body);
      
      if (!username || !password) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Username and password required" }));
        return true;
      }

      if (url === "/api/register") {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Username taken" }));
          return true;
        }

        const user = await prisma.user.create({
          data: {
            username,
            passwordHash: hashPassword(password),
            displayName: displayName || username
          }
        });

        const session = await prisma.session.create({
          data: {
            userId: user.id,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 days
          }
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ token: session.id, user: { id: user.id, username: user.username, displayName: user.displayName } }));
        return true;
      }

      if (url === "/api/login") {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user || !verifyPassword(password, user.passwordHash)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid credentials" }));
          return true;
        }

        const session = await prisma.session.create({
          data: {
            userId: user.id,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
          }
        });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ token: session.id, user: { id: user.id, username: user.username, displayName: user.displayName } }));
        return true;
      }
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
      return true;
    }
  }

  if (req.method === "POST" && url === "/api/logout") {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      await prisma.session.deleteMany({ where: { id: token } });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  if (req.method === "GET" && url === "/api/me") {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const session = await prisma.session.findUnique({
        where: { id: token },
        include: { user: true }
      });

      if (session && session.expiresAt > new Date()) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ user: { id: session.user.id, username: session.user.username, displayName: session.user.displayName } }));
        return true;
      }
    }
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return true;
  }

  return false;
}
