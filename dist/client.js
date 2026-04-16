"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const node_readline_1 = __importDefault(require("node:readline"));
require("dotenv/config");
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
const URL = process.argv[2] ?? DEFAULT_URL;
let currentUsername = "You";
const socket = new ws_1.default(URL);
function clearScreen() {
    console.clear();
}
function printHeader() {
    console.log(`${colors.bgBlue}${colors.white}${colors.bright} 💬 CHATROOM ${colors.reset}`);
    console.log(`${colors.dim}${colors.cyan}Connected to: ${URL}${colors.reset}`);
    console.log(`${colors.dim}${colors.cyan}User: ${currentUsername}${colors.reset}`);
    console.log(`${colors.dim}${"─".repeat(60)}${colors.reset}\n`);
}
function printWelcome() {
    printHeader();
    console.log(`${colors.green}${colors.bright}✓ Connected to chat server${colors.reset}\n`);
    console.log(`${colors.bright}Available Commands:${colors.reset}`);
    console.log(`  ${colors.cyan}/name <name>${colors.reset}     - Change your display name`);
    console.log(`  ${colors.cyan}@gemini <prompt>${colors.reset}  - Ask Gemini AI`);
    console.log(`  ${colors.cyan}/quit${colors.reset}             - Exit chat\n`);
    console.log(`${colors.bright}Type a message and press Enter to chat${colors.reset}`);
    console.log(`${colors.dim}${"─".repeat(60)}${colors.reset}\n`);
}
function formatMessage(text) {
    try {
        const json = JSON.parse(text);
        if (json.sender && json.content) {
            const senderColor = json.sender === currentUsername ? colors.yellow : colors.green;
            const prefix = json.sender === currentUsername
                ? `${colors.yellow}► You${colors.reset}`
                : `${colors.green}◄ ${json.sender}${colors.reset}`;
            return `${prefix}: ${json.content}`;
        }
    }
    catch {
        // Not JSON, treat as system message
        return `${colors.cyan}${colors.dim}[System] ${text}${colors.reset}`;
    }
    return text;
}
socket.on("open", () => {
    clearScreen();
    printWelcome();
});
socket.on("message", (data) => {
    const message = formatMessage(data.toString());
    process.stdout.write(`\n${message}\n`);
    rl.prompt();
});
socket.on("close", () => {
    console.log(`\n${colors.red}${colors.bright}✗ Disconnected from server${colors.reset}`);
    process.exit(0);
});
socket.on("error", (err) => {
    console.error(`${colors.red}${colors.bright}✗ Connection error: ${err.message}${colors.reset}`);
});
const rl = node_readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.bright}${colors.magenta}> ${colors.reset}`,
});
rl.prompt();
rl.on("line", (line) => {
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
            currentUsername = newName;
            clearScreen();
            printHeader();
            console.log(`${colors.green}✓ Username changed to: ${newName}${colors.reset}\n`);
        }
        else {
            console.log(`${colors.red}✗ Please provide a username${colors.reset}`);
        }
        rl.prompt();
        return;
    }
    if (!text) {
        rl.prompt();
        return;
    }
    socket.send(text);
    rl.prompt();
});
rl.on("close", () => {
    socket.close();
});
