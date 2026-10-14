import { WebSocket } from "ws";
import { clients, broadcast, sendToClient } from "../state";
// @ts-check (force IDE refresh)
import { prisma } from "../db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const GEMINI_NAME = "gemini";

export async function processAIPrompt(prompt: string, username: string, roomId: string, imagePart?: any) {
  handleAIAsk(null, roomId, prompt, false, imagePart ? "image" : undefined, username, imagePart);
}

export async function handleAIAsk(socket: WebSocket | null, roomId: string, prompt: string, isPrivate: boolean, attachmentId?: string, fallbackUsername?: string, passedImagePart?: any) {
  const current = socket ? clients.get(socket) : { userId: "system", username: fallbackUsername || "User" };
  if (!current) return;
  
  const notify = (msg: string, isError = false) => {
    if (socket && isPrivate) {
      sendToClient(socket, { type: isError ? "error" : "system.notice", message: msg, content: msg });
    } else {
      broadcast({ type: isError ? "error" : "system.notice", content: msg, message: msg }, undefined, roomId);
    }
  };

  if (!GEMINI_API_KEY) {
    notify("Gemini is not configured yet.", true);
    return;
  }

  try {
    // Check usage limits
    if (current.userId !== "system") {
      const user = await prisma.user.findUnique({ where: { id: current.userId } });
      if (user) {
        let usage = user.aiUsageCount;
        let lastReset = user.aiUsageReset;
        const now = new Date();
        
        if (now.getTime() - lastReset.getTime() > 24 * 60 * 60 * 1000) {
          usage = 0;
          lastReset = now;
        }
        
        if (usage >= 100) { // Limit to 100 AI requests per day
          notify("You have reached your daily AI usage limit.", true);
          return;
        }
        
        await prisma.user.update({
          where: { id: current.userId },
          data: { aiUsageCount: usage + 1, aiUsageReset: lastReset }
        });
      }
    }

    // Fetch room context (limit to last 20 messages)
    const contextMsgs = await prisma.message.findMany({
      where: { roomId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    
    // Sort chronological
    contextMsgs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    let contextStr = "Recent conversation history:\n";
    for (const m of contextMsgs) {
      contextStr += `[${m.createdAt.toISOString()}] ${m.senderName}: ${m.content}\n`;
    }

    let imagePart = passedImagePart;
    if (attachmentId && attachmentId !== "image") {
      const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
      if (attachment && attachment.mimeType.startsWith("image/")) {
        const fs = require('fs');
        if (fs.existsSync(attachment.path)) {
          const base64 = fs.readFileSync(attachment.path).toString("base64");
          imagePart = { inlineData: { data: base64, mimeType: attachment.mimeType } };
        }
      }
    }

    const parts: any[] = [
      { text: `You are '${GEMINI_NAME}' in a chat room. Keep responses short and helpful. Here is the recent context from this room:\n\n${contextStr}\n\nThe user '${current.username}' asks: ${prompt}` }
    ];
    if (imagePart) {
      parts.push(imagePart);
    }
    
    // Implement timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    let text = "";
    try {
      // NOTE: Using native fetch since the official SDK does not properly support abort signal universally.
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts }] }),
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errText}`);
      }
      const json = await response.json() as any;
      text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("").trim();
    } catch (e: any) {
      if (e.name === 'AbortError') throw new Error("AI request timed out.");
      throw e;
    }
    
    if (text) {
      if (isPrivate && socket) {
        // Send privately without saving
        sendToClient(socket, { type: "message.new", roomId, sender: GEMINI_NAME, content: `[Private] ${text}`, createdAt: new Date().toISOString(), isAi: true });
      } else {
        // Save and broadcast
        const dbMsg = await prisma.message.create({
          data: { senderName: GEMINI_NAME, content: text, roomId, isAi: true },
        });
        broadcast({ type: "message.new", roomId, sender: GEMINI_NAME, content: text, createdAt: dbMsg.createdAt.toISOString(), id: dbMsg.id, isAi: true }, undefined, roomId);
      }
    }
  } catch (err: any) {
    console.error("Gemini error:", err);
    notify(`AI Error: ${err.message || "Failed to process request"}`, true);
  }
}
