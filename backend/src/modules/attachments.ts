import { WebSocket } from "ws";
import { clients, broadcast, sendToClient } from "../state";
import { prisma } from "../db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export async function handleImageAttachment(socket: WebSocket, roomId: string, base64: string, mimeType: string) {
  const current = clients.get(socket);
  if (!current) return;
  
  if (!GEMINI_API_KEY) {
    sendToClient(socket, { type: "error", message: "Gemini is not configured for image analysis." });
    return;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: "Analyze this image and provide a concise summary." },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) throw new Error("API error");
    const json = await response.json() as any;
    const reply = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("").trim();
    
    if (reply) {
      const content = `[IMAGE ANALYSIS] ${reply}`;
      const dbMsg = await prisma.message.create({
        data: { senderId: current.userId, senderName: current.name, content, roomId },
      });
      broadcast({ type: "message.new", roomId, sender: current.name, content, createdAt: dbMsg.createdAt.toISOString(), id: dbMsg.id }, undefined, roomId);
    }
  } catch (err) {
    console.error("Image analysis failed:", err);
    sendToClient(socket, { type: "error", message: "Failed to analyze image" });
  }
}
