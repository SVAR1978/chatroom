import { WebSocket } from "ws";
import { clients, broadcast, sendToClient } from "../state";
import { prisma } from "../db";

export async function handleRoomJoin(socket: WebSocket, roomId: string) {
  const current = clients.get(socket);
  if (!current) return;

  if (current.rooms.has(roomId)) {
    return;
  }

  // Verify membership in DB
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: current.userId } }
  });

  if (!membership) {
    sendToClient(socket, { type: "error", message: "Not a member of this room" });
    return;
  }

  current.rooms.add(roomId);
  sendToClient(socket, { type: "room.joined", roomId });
  broadcast({ type: "system.notice", roomId, content: `${current.name} joined the room.` }, socket, roomId);
}

export function handleRoomLeave(socket: WebSocket, roomId: string) {
  const current = clients.get(socket);
  if (!current) return;

  if (current.rooms.has(roomId)) {
    current.rooms.delete(roomId);
    sendToClient(socket, { type: "room.left", roomId });
    broadcast({ type: "system.notice", roomId, content: `${current.name} left the room.` }, socket, roomId);
  }
}
