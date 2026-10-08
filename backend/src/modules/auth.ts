import { WebSocket } from "ws";
import { clients, broadcast, sendToClient } from "../state";
import { prisma } from "../db";

export async function handleAuth(socket: WebSocket, name: string) {
  const current = clients.get(socket);
  if (!current) return;
  
  if (!name.trim()) {
    sendToClient(socket, { type: "error", message: "Name cannot be empty." });
    return;
  }
  
  const oldName = current.name;
  current.name = name.trim();
  
  try {
    await prisma.user.update({
      where: { id: current.userId },
      data: { displayName: current.name }
    });
  } catch (err) {
    console.error("Failed to update displayName", err);
  }

  sendToClient(socket, { type: "auth.success", name: current.name });
  
  // Broadcast to all rooms they are in
  for (const roomId of current.rooms) {
    broadcast({ type: "system.notice", roomId, content: `${oldName} is now known as ${current.name}` }, socket, roomId);
  }
  broadcastOnlineUsers();
}

export function broadcastOnlineUsers() {
  const users = Array.from(clients.values()).map(c => ({ username: c.username, name: c.name }));
  broadcast({ type: "online.users", users });
}
