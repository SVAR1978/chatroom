import { WebSocket } from "ws";
import { clients, broadcast, sendToClient } from "../state";
import { prisma } from "../db";
import { processAIPrompt } from "./ai";

export async function handleMessage(socket: WebSocket, roomId: string, content: string, clientMessageId?: string, replyToId?: number, attachmentId?: string) {
  const current = clients.get(socket);
  if (!current || (!content.trim() && !attachmentId)) return;

  const text = content.trim();

  // Save and broadcast message
  try {
    let dbMsg;
    if (clientMessageId) {
      // Check if message already exists
      const existing = await prisma.message.findUnique({
        where: { senderId_clientMessageId: { senderId: current.userId, clientMessageId } }
      });
      if (existing) {
        sendToClient(socket, { type: "message.ack", clientMessageId, id: existing.id });
        return;
      }
    }

    dbMsg = await prisma.message.create({
      data: { senderId: current.userId, senderName: current.name, content: text, roomId, clientMessageId, replyToId, attachmentId },
      include: { attachment: true }
    });
    
    if (clientMessageId) {
      sendToClient(socket, { type: "message.ack", clientMessageId, id: dbMsg.id });
    }

    broadcast(
      { 
        type: "message.new", 
        roomId, 
        sender: current.name, 
        content: text, 
        createdAt: dbMsg.createdAt.toISOString(), 
        id: dbMsg.id, 
        clientMessageId, 
        replyToId,
        attachmentId: dbMsg.attachmentId || undefined,
        attachmentUrl: dbMsg.attachment ? `/api/rooms/${roomId}/attachments/${dbMsg.attachmentId}` : undefined,
        attachmentType: dbMsg.attachment?.mimeType
      },
      undefined, 
      roomId
    );

    // AI Check
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (room && !room.isDirect) {
      const isAiPrompt = /^(?:@gemini|@ai|\/gemini|\/ai|\/ask)\b/i;
      if (isAiPrompt.test(text) || (attachmentId && text.toLowerCase().includes("@gemini"))) {
        const prompt = text.replace(isAiPrompt, "").trim();
        let imagePart;
        
        if (dbMsg.attachment && dbMsg.attachment.mimeType.startsWith("image/")) {
           const fs = require('fs');
           if (fs.existsSync(dbMsg.attachment.path)) {
             const base64 = fs.readFileSync(dbMsg.attachment.path).toString("base64");
             imagePart = { inlineData: { data: base64, mimeType: dbMsg.attachment.mimeType } };
           }
        }
        
        processAIPrompt(prompt || "Analyze this image", current.name, roomId, imagePart);
      }
    }
  } catch (err: any) {
    console.error("Failed to process message:", err);
    if (err.code === "P2002" && clientMessageId) { // Prisma Unique constraint failed
       const existing = await prisma.message.findUnique({
         where: { senderId_clientMessageId: { senderId: current.userId, clientMessageId } }
       });
       if (existing) {
         sendToClient(socket, { type: "message.ack", clientMessageId, id: existing.id });
       }
    }
  }
}

export async function handleEditMessage(socket: WebSocket, messageId: number, content: string) {
  const current = clients.get(socket);
  if (!current || !content.trim()) return;
  
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.senderId !== current.userId || msg.isDeleted) return;
  
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content: content.trim(), editedAt: new Date() }
  });
  
  broadcast({ type: "message.update", roomId: msg.roomId, id: msg.id, content: updated.content, isDeleted: false, editedAt: updated.editedAt?.toISOString() }, undefined, msg.roomId);
}

export async function handleDeleteMessage(socket: WebSocket, messageId: number) {
  const current = clients.get(socket);
  if (!current) return;
  
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.senderId !== current.userId) return;
  
  await prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true, content: "[deleted]" }
  });
  
  broadcast({ type: "message.update", roomId: msg.roomId, id: msg.id, content: "[deleted]", isDeleted: true }, undefined, msg.roomId);
}
