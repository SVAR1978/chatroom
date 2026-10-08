import WebSocket from "ws";
import readline from "node:readline";
import "dotenv/config";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
};

const HOST = process.env.HOST ?? "localhost";
const PORT = process.env.PORT ?? 8080;
const WS_PROTOCOL = process.env.WS_PROTOCOL ?? "ws";
const DEFAULT_URL = `${WS_PROTOCOL}://${HOST}:${PORT}`;

const WS_URL = process.argv[2] ?? DEFAULT_URL;
let currentUsername = "You";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let currentRoomId = "general";
let globalToken = "";

function connectWebSocket(token: string) {
  globalToken = token;
  const wsUrl = new URL(WS_URL);
  wsUrl.searchParams.set("token", token);
  const socket = new WebSocket(wsUrl.toString());

  socket.on("open", () => {
    console.clear();
    console.log(`${colors.bright}${colors.cyan}=== Welcome to Chatroom CLI ===${colors.reset}\n`);
  });

  socket.on("message", (data) => {
    try {
      const event = JSON.parse(data.toString());
      let message = "";
      if (event.type === "message.new") {
        if (event.roomId !== currentRoomId) return; // ignore other rooms
        const senderColor = event.sender === currentUsername ? colors.yellow : colors.green;
        const prefix = event.sender === currentUsername
          ? `${colors.yellow}► You${colors.reset}`
          : `${colors.green}◄ ${event.sender}${colors.reset}`;
        message = `${prefix}: ${event.content}`;
      } else if (event.type === "system.notice") {
        if (event.roomId && event.roomId !== currentRoomId) return;
        message = `${colors.cyan}${colors.dim}[System] ${event.content}${colors.reset}`;
      } else if (event.type === "auth.success") {
        currentUsername = event.name;
        message = `${colors.green}✓ Logged in as: ${event.name}${colors.reset}`;
      } else if (event.type === "error") {
        message = `${colors.red}✗ Error: ${event.message}${colors.reset}`;
      } else if (event.type === "online.users") {
        message = `${colors.cyan}Online (${event.users.length}): ${event.users.join(", ")}${colors.reset}`;
      } else {
        return; // Ignore other events like room.joined
      }
      
      process.stdout.write(`\n${message}\n`);
      rl.setPrompt(`${colors.bright}${colors.magenta}> ${colors.reset}`);
      rl.prompt();
    } catch (err) {
      // legacy text fallback
    }
  });

  socket.on("close", () => {
    console.log(`\n${colors.red}${colors.bright}✗ Disconnected from server${colors.reset}`);
    process.exit(0);
  });

  socket.on("error", (err) => {
    console.error(`${colors.red}${colors.bright}✗ Connection error: ${err.message}${colors.reset}`);
  });

  rl.setPrompt(`${colors.bright}${colors.magenta}> ${colors.reset}`);
  rl.prompt();

  rl.on("line", async (line) => {
    const text = line.trim();

    if (text === "/quit") {
      console.log(`${colors.cyan}Closing connection...${colors.reset}`);
      rl.close();
      socket.close();
      return;
    }

    if (text.toLowerCase().startsWith("/name ")) {
      const newName = text.slice(6).trim();
      if (newName) {
        socket.send(JSON.stringify({ type: "auth.rename", name: newName }));
      }
      rl.prompt();
      return;
    }

    if (text.toLowerCase().startsWith("/who")) {
      socket.send(JSON.stringify({ type: "command.execute", command: "who", args: [] }));
      rl.prompt();
      return;
    }
    
    if (text.toLowerCase().startsWith("/dm ")) {
      const args = text.slice(4).trim().split(" ");
      const targetUsername = args[0];
      const msg = args.slice(1).join(" ");
      
      const httpUrl = WS_URL.replace("ws://", "http://").replace("wss://", "https://") + `/api/dms`;
      const res = await fetch(httpUrl, { 
        method: "POST", 
        headers: { "Authorization": `Bearer ${globalToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetUsername })
      });
      const data = await res.json() as any;
      if (data.room) {
        currentRoomId = data.room.id;
        socket.send(JSON.stringify({ type: "room.join", roomId: currentRoomId }));
        console.log(`${colors.green}Joined DM with ${targetUsername}${colors.reset}`);
        if (msg) {
          setTimeout(() => {
            socket.send(JSON.stringify({ type: "message.send", roomId: currentRoomId, content: msg }));
          }, 100);
        }
      } else {
        console.log(`${colors.red}Error: ${data.error}${colors.reset}`);
      }
      rl.prompt();
      return;
    }

    if (text.toLowerCase().startsWith("/help")) {
      socket.send(JSON.stringify({ type: "command.execute", command: "help", args: [] }));
      rl.prompt();
      return;
    }

    if (text.toLowerCase().startsWith("/invite")) {
      const httpUrl = WS_URL.replace("ws://", "http://").replace("wss://", "https://") + `/api/rooms/${currentRoomId}/invites`;
      const res = await fetch(httpUrl, { method: "POST", headers: { "Authorization": `Bearer ${globalToken}` } });
      const data = await res.json() as any;
      if (data.inviteId) {
        console.log(`${colors.green}Invite code: ${data.inviteId}${colors.reset}`);
      } else {
        console.log(`${colors.red}Error: ${data.error}${colors.reset}`);
      }
      rl.prompt();
      return;
    }

    if (text.toLowerCase().startsWith("/join ")) {
      const inviteCode = text.slice(6).trim();
      const httpUrl = WS_URL.replace("ws://", "http://").replace("wss://", "https://") + `/api/invites/${inviteCode}/join`;
      const res = await fetch(httpUrl, { method: "POST", headers: { "Authorization": `Bearer ${globalToken}` } });
      const data = await res.json() as any;
      if (data.room) {
        currentRoomId = data.room.id;
        socket.send(JSON.stringify({ type: "room.join", roomId: currentRoomId }));
        console.log(`${colors.green}Joined room ${data.room.name}${colors.reset}`);
      } else {
        console.log(`${colors.red}Error: ${data.error}${colors.reset}`);
      }
      rl.prompt();
      return;
    }

    if (text.toLowerCase().startsWith("/create ")) {
      const roomName = text.slice(8).trim();
      const httpUrl = WS_URL.replace("ws://", "http://").replace("wss://", "https://") + `/api/rooms`;
      const res = await fetch(httpUrl, { 
        method: "POST", 
        headers: { "Authorization": `Bearer ${globalToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName, isPrivate: false })
      });
      const data = await res.json() as any;
      if (data.room) {
        currentRoomId = data.room.id;
        socket.send(JSON.stringify({ type: "room.join", roomId: currentRoomId }));
        console.log(`${colors.green}Created room ${data.room.name}${colors.reset}`);
      } else {
        console.log(`${colors.red}Error: ${data.error}${colors.reset}`);
      }
      rl.prompt();
      return;
    }

    if (!text) {
      rl.prompt();
      return;
    }

    socket.send(JSON.stringify({ type: "message.send", roomId: currentRoomId, content: text }));
    rl.prompt();
  });
}

async function authenticate() {
  console.clear();
  console.log(`${colors.bgBlue}${colors.white}${colors.bright} 💬 CHATROOM LOGIN ${colors.reset}\n`);
  
  rl.question("Username: ", (username) => {
    rl.question("Password: ", async (password) => {
      try {
        const httpUrl = WS_URL.replace("ws://", "http://").replace("wss://", "https://") + "/api/login";
        const res = await fetch(httpUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json() as any;
        
        if (!res.ok) {
          console.log(`${colors.red}Login failed: ${data.error}${colors.reset}`);
          process.exit(1);
        }
        
        console.log(`${colors.green}Login successful! Connecting...${colors.reset}`);
        currentUsername = data.user.displayName;
        connectWebSocket(data.token);
      } catch (err) {
        console.error("Failed to connect to server:", err);
        process.exit(1);
      }
    });
  });
}

authenticate();


