# Run This Chatroom From a Mobile Phone (Browser)

This project now serves a browser chat page at the same port as the WebSocket server.

You can open it directly from your phone using either:

- local network URL (same Wi-Fi)
- forwarded port URL (works outside your local network if your port-forwarding tool supports it)

## 1. Start the Server

```bash
cd /Users/vikashadivasi/Desktop/chatroom
npm install
npm run build
npm run start:server
```

The server listens on one port (default `8080`) for both:

- web page: `http://<host>:8080`
- websocket: `ws://<host>:8080`

## 2. Open on Phone (Same Wi-Fi)

Find your Mac local IP:

```bash
ipconfig getifaddr en0
```

If the IP is `192.168.137.111`, open this on your phone browser:

```text
http://192.168.137.111:8080
```

## 3. Open on Phone (Forwarded Port URL)

If you are using a forwarded port from VS Code, Codespaces, or a tunnel tool:

1. Forward port `8080`
2. Copy the public forwarded URL
3. Open that URL on your phone browser

The page auto-selects `ws://` or `wss://` from the browser URL, so chat connects dynamically without manual URL edits.

## 4. Suggested `.env` Settings

```env
PORT=8080
HOST=0.0.0.0
PUBLIC_HOST=localhost
HTTP_PROTOCOL=http
WS_PROTOCOL=ws
```

Notes:

- Keep `HOST=0.0.0.0` so the server is reachable from network/forwarded ports.
- For HTTPS forwarded URLs, the browser will use secure WebSocket (`wss`) automatically.

## 5. Troubleshooting

### Phone cannot load the page

- Confirm server is running
- Confirm `HOST=0.0.0.0`
- Confirm firewall allows the port
- Confirm forwarded port is public and active

### Page opens but chat does not connect

- Open browser dev tools on desktop and check websocket errors
- Ensure forwarded URL protocol is correct (`https` forwarded URL should use `wss`)

### Build errors

```bash
npm install
npm run build
```
