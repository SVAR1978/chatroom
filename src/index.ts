import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";
const LISTEN_HOST = HOST === "0.0.0.0" ? "0.0.0.0" : HOST;
const PUBLIC_HOST = process.env.PUBLIC_HOST ?? "localhost";
const HTTP_PROTOCOL = process.env.HTTP_PROTOCOL ?? "http";
const WS_PROTOCOL = process.env.WS_PROTOCOL ?? "ws";
const STATIC_ROOT = path.resolve(process.cwd(), "public");
const WEB_URL = `${HTTP_PROTOCOL}://${PUBLIC_HOST}:${PORT}`;
const SERVER_URL = `${WS_PROTOCOL}://${PUBLIC_HOST}:${PORT}`;

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const GEMINI_NAME = "gemini";

type ClientData = {
	name: string;
};

type ChatPayload = {
	type: "chat";
	text: string;
};

const server = createServer((req, res) => {
	void handleHttpRequest(req, res);
});

const wss = new WebSocketServer({ server });
const clients = new Map<WebSocket, ClientData>();

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const route = req.url?.split("?")[0] ?? "/";

	if (route === "/" || route === "/index.html") {
		try {
			const html = await readFile(path.join(STATIC_ROOT, "index.html"), "utf8");
			res.writeHead(200, {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
			});
			res.end(html);
			return;
		} catch (error) {
			console.error("Failed to serve HTML page:", error);
			res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
			res.end("Failed to load chat page.");
			return;
		}
	}

	if (route === "/health") {
		res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
		res.end(JSON.stringify({ status: "ok" }));
		return;
	}

	res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
	res.end("Not Found");
}

async function saveMessage(sender: string, content: string): Promise<void> {
	await prisma.message.create({
		data: {
			sender,
			content,
		},
	});
}

function extractChatText(rawText: string): string {
	let payload: ChatPayload | null = null;
	try {
		payload = JSON.parse(rawText) as ChatPayload;
	} catch {
		payload = null;
	}

	if (payload && payload.type === "chat" && payload.text.trim()) {
		return payload.text.trim();
	}

	return rawText;
}

function getGeminiPrompt(content: string): string | null {
	const trimmed = content.trim();
	if (/^@gemini\b/i.test(trimmed)) {
		return trimmed.replace(/^@gemini\b\s*/i, "").trim() || null;
	}

	if (/^\/gemini\b/i.test(trimmed)) {
		return trimmed.replace(/^\/gemini\b\s*/i, "").trim() || null;
	}

	return null;
}

async function getGeminiReply(prompt: string, username: string): Promise<string> {
	if (!GEMINI_API_KEY) {
		return "Gemini is not configured yet. Set GEMINI_API_KEY in your .env file.";
	}

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				contents: [
					{
						role: "user",
						parts: [
							{
								text: `You are '${GEMINI_NAME}' in a chat room. Keep responses short and friendly. User ${username} says: ${prompt}`,
							},
						],
					},
				],
			}),
		}
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Gemini API error ${response.status}: ${errorText}`);
	}

	const json = (await response.json()) as {
		candidates?: Array<{
			content?: {
				parts?: Array<{ text?: string }>;
			};
		}>;
	};

	const reply = json.candidates?.[0]?.content?.parts
		?.map((part) => part.text ?? "")
		.join("")
		.trim();

	if (!reply) {
		return "I did not get a response from Gemini this time.";
	}

	return reply;
}

function broadcast(message: string, except?: WebSocket): void {
	for (const client of wss.clients) {
		if (client.readyState !== WebSocket.OPEN) {
			continue;
		}
		if (client === except) {
			continue;
		}
		client.send(message);
	}
}

wss.on("connection", (socket) => {
	const generatedName = `user-${Math.floor(Math.random() * 10000)}`;
	clients.set(socket, { name: generatedName });

	socket.send(`Connected to chat room as ${generatedName}`);
	socket.send("Use command /name yourName to rename yourself.");
	socket.send("Talk to Gemini with @gemini your message or /gemini your message.");
	broadcast(`${generatedName} joined the room.`, socket);

	socket.on("message", (raw) => {
		const text = raw.toString().trim();
		const current = clients.get(socket);
		if (!current || !text) {
			return;
		}

		if (text.startsWith("/name ")) {
			const next = text.slice(6).trim();
			if (!next) {
				socket.send("Name cannot be empty.");
				return;
			}
			const oldName = current.name;
			current.name = next;
			socket.send(`You are now known as ${next}`);
			broadcast(`${oldName} is now known as ${next}`, socket);
			return;
		}

		const content = extractChatText(text);

		void saveMessage(current.name, content).catch((error: unknown) => {
			console.error("Failed to store message:", error);
		});
		broadcast(`${current.name}: ${content}`, socket);

		const geminiPrompt = getGeminiPrompt(content);
		if (!geminiPrompt) {
			return;
		}

		void getGeminiReply(geminiPrompt, current.name)
			.then(async (reply) => {
				broadcast(`${GEMINI_NAME}: ${reply}`);
				await saveMessage(GEMINI_NAME, reply);
			})
			.catch((error: unknown) => {
				console.error("Gemini response failed:", error);
				socket.send("gemini: Sorry, I could not respond right now.");
			});
	});

	socket.on("close", () => {
		const data = clients.get(socket);
		clients.delete(socket);
		if (data) {
			broadcast(`${data.name} left the room.`);
		}
	});
});

server.listen(PORT, LISTEN_HOST, () => {
	console.log(`\n${"═".repeat(70)}`);
	console.log(`Chatroom Server Running`);
	console.log(`${"═".repeat(70)}`);
	console.log(`Web: ${WEB_URL}`);
	console.log(`WebSocket: ${SERVER_URL}`);
	console.log(`Local web: http://localhost:${PORT}`);
	console.log(`Local ws: ws://localhost:${PORT}`);
	console.log(`${"═".repeat(70)}\n`);
});

process.on("SIGINT", () => {
	void prisma.$disconnect().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
	void prisma.$disconnect().finally(() => process.exit(0));
});
