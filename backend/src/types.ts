import { WebSocket } from "ws";

export type ClientEvent =
  | { type: "message.send"; roomId: string; clientMessageId?: string; content: string; replyToId?: number; attachmentId?: string }
  | { type: "message.edit"; messageId: number; content: string }
  | { type: "message.delete"; messageId: number }
  | { type: "room.join"; roomId: string }
  | { type: "room.leave"; roomId: string }
  | { type: "auth.rename"; name: string }
  | { type: "command.execute"; command: string; args: string[] }
  | { type: "attachment.image"; roomId: string; base64: string; mimeType: string } // Deprecated?
  | { type: "ai.ask"; roomId: string; prompt: string; isPrivate: boolean; attachmentId?: string }
  | { type: "ping" };

export type ServerEvent =
  | { type: "message.new"; roomId: string; sender: string; content: string; createdAt: string; id?: number; clientMessageId?: string; replyToId?: number; isDeleted?: boolean; editedAt?: string; attachmentId?: string; attachmentUrl?: string; attachmentType?: string; isAi?: boolean }
  | { type: "message.update"; roomId: string; id: number; content: string; isDeleted: boolean; editedAt?: string }
  | { type: "message.ack"; clientMessageId: string; id: number }
  | { type: "system.notice"; roomId?: string; content: string }
  | { type: "auth.success"; name: string }
  | { type: "room.joined"; roomId: string }
  | { type: "room.left"; roomId: string }
  | { type: "error"; message: string }
  | { type: "online.users"; users: { username: string; name: string }[] };


