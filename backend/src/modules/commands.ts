import { WebSocket } from "ws";
import { clients, sendToClient, findSocketByName } from "../state";

export function handleCommand(socket: WebSocket, command: string, args: string[]) {
  const current = clients.get(socket);
  if (!current) return;

  if (command === "help") {
    sendToClient(socket, { 
      type: "system.notice", 
      content: "Commands:\n/name newName\n/who\n/dm user message\n/join code\n/create name\n/leave\n@gemini prompt" 
    });
  }
}
