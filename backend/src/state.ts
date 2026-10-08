import { WebSocket } from "ws";
import { ServerEvent } from "./types";

export type ClientData = {
  userId: string;
  username: string;
  name: string;
  rooms: Set<string>;
};

export const clients = new Map<WebSocket, ClientData>();

export function broadcast(message: ServerEvent, except?: WebSocket, roomId?: string) {
  const json = JSON.stringify(message);
  for (const [client, data] of clients.entries()) {
    if (client.readyState !== WebSocket.OPEN) {
      continue;
    }
    if (client === except) {
      continue;
    }
    if (roomId && !data.rooms.has(roomId)) {
      continue;
    }
    client.send(json);
  }
}

export function sendToClient(client: WebSocket, message: ServerEvent) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

export function findSocketByName(targetName: string): WebSocket | null {
  const normalized = targetName.trim().toLowerCase();
  if (!normalized) return null;

  for (const [socket, data] of clients.entries()) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (data.name.toLowerCase() === normalized) {
      return socket;
    }
  }
  return null;
}
