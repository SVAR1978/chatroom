import { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "./db";

export async function handleRoomRoutes(req: IncomingMessage, res: ServerResponse, userId: string): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "/";
  const method = req.method;

  if (method === "GET" && url === "/api/rooms") {
    const memberships = await prisma.roomMember.findMany({
      where: { userId },
      include: { 
        room: {
          include: { members: { include: { user: true } } }
        } 
      }
    });
    const rooms = memberships.map(m => {
      const r = m.room;
      if (r.isDirect) {
        const other = r.members.find(mb => mb.userId !== userId);
        if (other) {
          return { ...r, name: `@${other.user.username}`, members: undefined };
        }
      }
      return { ...r, members: undefined };
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ rooms }));
    return true;
  }

  if (method === "POST" && url === "/api/rooms") {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    await new Promise((resolve) => req.on("end", resolve));

    try {
      const { name, isPrivate } = JSON.parse(body);
      const room = await prisma.room.create({
        data: {
          name,
          isPrivate: !!isPrivate,
          members: {
            create: { userId, role: "OWNER" }
          }
        }
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ room }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to create room" }));
    }
    return true;
  }

  const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = urlObj.pathname;

  const roomMsgMatch = pathname.match(/^\/api\/rooms\/([^\/]+)\/messages$/);
  if (method === "GET" && roomMsgMatch) {
    const roomId = roomMsgMatch[1];
    const afterId = urlObj.searchParams.get("after");
    const beforeId = urlObj.searchParams.get("before");
    const search = urlObj.searchParams.get("search");

    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } }
    });
    if (!membership) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not a member" }));
      return true;
    }
    
    const query: any = {
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: 50
    };

    if (search) {
      query.where.content = { contains: search, mode: "insensitive" };
    }

    if (afterId && !isNaN(Number(afterId))) {
      query.cursor = { id: Number(afterId) };
      query.skip = 1;
      query.orderBy = { createdAt: 'asc' }; // Load newer
    } else if (beforeId && !isNaN(Number(beforeId))) {
      query.cursor = { id: Number(beforeId) };
      query.skip = 1;
      query.orderBy = { createdAt: 'desc' }; // Load older
    }

    let messages = await prisma.message.findMany(query);
    
    // Always return sorted chronological
    messages = messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messages }));
    return true;
  }

  const attachMatch = pathname.match(/^\/api\/rooms\/([^\/]+)\/attachments$/);
  if (method === "POST" && attachMatch) {
    const roomId = attachMatch[1];
    const membership = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (!membership) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not a member" }));
      return true;
    }

    const contentType = req.headers["content-type"] || "";
    if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Only images and PDFs are allowed" }));
      return true;
    }

    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > 5 * 1024 * 1024) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "File too large (max 5MB)" }));
      return true;
    }

    const fileName = Array.isArray(req.headers["x-file-name"]) ? req.headers["x-file-name"][0] : (req.headers["x-file-name"] || "upload");
    
    // Create uploads dir if not exists
    const fs = require('fs');
    const path = require('path');
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileId = require('crypto').randomUUID();
    const filePath = path.join(uploadDir, fileId);
    const writeStream = fs.createWriteStream(filePath);
    
    let receivedBytes = 0;
    req.on("data", chunk => {
      receivedBytes += chunk.length;
      if (receivedBytes > 5 * 1024 * 1024) {
        req.destroy();
        writeStream.destroy();
        fs.unlinkSync(filePath);
      } else {
        writeStream.write(chunk);
      }
    });

    req.on("end", async () => {
      writeStream.end();
      const attachment = await prisma.attachment.create({
        data: {
          id: fileId,
          roomId,
          uploaderId: userId,
          fileName,
          mimeType: contentType,
          size: receivedBytes,
          path: filePath
        }
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ attachmentId: attachment.id, url: `/api/rooms/${roomId}/attachments/${attachment.id}`, mimeType: attachment.mimeType, fileName: attachment.fileName }));
    });
    
    req.on("error", () => {
      writeStream.destroy();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.writeHead(500);
      res.end();
    });

    return true;
  }

  const getAttachMatch = pathname.match(/^\/api\/rooms\/([^\/]+)\/attachments\/([^\/]+)$/);
  if (method === "GET" && getAttachMatch) {
    const roomId = getAttachMatch[1];
    const attachmentId = getAttachMatch[2];
    
    const membership = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (!membership) {
      res.writeHead(403);
      res.end();
      return true;
    }

    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId, roomId } });
    if (!attachment) {
      res.writeHead(404);
      res.end();
      return true;
    }

    const fs = require('fs');
    if (!fs.existsSync(attachment.path)) {
      res.writeHead(404);
      res.end();
      return true;
    }

    res.writeHead(200, {
      "Content-Type": attachment.mimeType,
      "Content-Length": attachment.size,
      "Content-Disposition": `inline; filename="${attachment.fileName}"`
    });
    
    const readStream = fs.createReadStream(attachment.path);
    readStream.pipe(res);
    return true;
  }

  const inviteMatch = url.match(/^\/api\/rooms\/([^\/]+)\/invites$/);
  if (method === "POST" && inviteMatch) {
    const roomId = inviteMatch[1];
    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } }
    });
    if (!membership || (membership.role !== "OWNER" && membership.role !== "MODERATOR")) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not authorized to create invites" }));
      return true;
    }
    
    const invite = await prisma.roomInvite.create({
      data: {
        roomId,
        creatorId: userId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) // 24 hours
      }
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ inviteId: invite.id }));
    return true;
  }

  const joinMatch = url.match(/^\/api\/invites\/([^\/]+)\/join$/);
  if (method === "POST" && joinMatch) {
    const inviteId = joinMatch[1];
    const invite = await prisma.roomInvite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.expiresAt < new Date()) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid or expired invite" }));
      return true;
    }
    
    // Check if already in room
    const existing = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: invite.roomId, userId } }
    });
    
    if (!existing) {
      await prisma.roomMember.create({
        data: { roomId: invite.roomId, userId }
      });
    }
    
    const room = await prisma.room.findUnique({ where: { id: invite.roomId } });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ room }));
    return true;
  }

  const leaveMatch = url.match(/^\/api\/rooms\/([^\/]+)\/leave$/);
  if (method === "POST" && leaveMatch) {
    const roomId = leaveMatch[1];
    await prisma.roomMember.delete({
      where: { roomId_userId: { roomId, userId } }
    }).catch(() => {});
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  const dmMatch = url.match(/^\/api\/dms$/);
  if (method === "POST" && dmMatch) {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    await new Promise((resolve) => req.on("end", resolve));

    try {
      const { targetUsername } = JSON.parse(body);
      
      const targetUser = await prisma.user.findUnique({ where: { username: targetUsername } });
      if (!targetUser) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "User not found" }));
        return true;
      }

      if (targetUser.id === userId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Cannot DM yourself" }));
        return true;
      }
      
      const block = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: targetUser.id },
            { blockerId: targetUser.id, blockedId: userId }
          ]
        }
      });
      if (block) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Conversation is blocked" }));
        return true;
      }

      const existingRooms = await prisma.room.findMany({
        where: {
          isDirect: true,
          AND: [
            { members: { some: { userId: userId } } },
            { members: { some: { userId: targetUser.id } } }
          ]
        },
        include: { members: true }
      });
      
      let dmRoom = existingRooms[0];
      
      if (!dmRoom) {
        dmRoom = await prisma.room.create({
          data: {
            name: "DM",
            isDirect: true,
            isPrivate: true,
            members: {
              create: [
                { userId, role: "OWNER" },
                { userId: targetUser.id, role: "OWNER" }
              ]
            }
          },
          include: { members: true }
        });
      }
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ room: dmRoom }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to create DM" }));
    }
    return true;
  }

  const blockMatch = url.match(/^\/api\/users\/([^\/]+)\/block$/);
  if (method === "POST" && blockMatch) {
    const targetUsername = blockMatch[1];
    const targetUser = await prisma.user.findUnique({ where: { username: targetUsername } });
    if (targetUser) {
      await prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUser.id } },
        create: { blockerId: userId, blockedId: targetUser.id },
        update: {}
      });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  if (method === "DELETE" && blockMatch) {
    const targetUsername = blockMatch[1];
    const targetUser = await prisma.user.findUnique({ where: { username: targetUsername } });
    if (targetUser) {
      await prisma.block.delete({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUser.id } }
      }).catch(() => {});
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  return false;
}
