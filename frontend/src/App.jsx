import { useEffect, useMemo, useRef, useState } from "react";

function getSocketUrl() {
  const env = import.meta.env.VITE_WS_URL;
  if (env) {
    return env;
  }

  const wsPort = Number(import.meta.env.VITE_WS_PORT ?? 8080);

  if (typeof window === "undefined") {
    return `ws://localhost:${wsPort}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";

  // In dev, frontend can run on a different port than backend.
  if (import.meta.env.DEV) {
    return `${protocol}://${window.location.hostname}:${wsPort}`;
  }

  return `${protocol}://${window.location.host}`;
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("connecting");
  const socketRef = useRef(null);
  const viewportRef = useRef(null);
  const fileInputRef = useRef(null);

  const socketUrl = useMemo(() => getSocketUrl(), []);

  useEffect(() => {
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStatus("connected");
      setMessages((prev) => [...prev, { text: "Connected to server", type: "system" }]);
    });

    socket.addEventListener("close", () => {
      setStatus("disconnected");
      setMessages((prev) => [...prev, { text: "Connection closed", type: "error" }]);
    });

    socket.addEventListener("error", () => {
      setStatus("error");
      setMessages((prev) => [...prev, { text: "Socket error", type: "error" }]);
    });

    socket.addEventListener("message", (event) => {
      const text = String(event.data ?? "").trim();
      if (!text) {
        return;
      }
      const chatLine = text.includes(": ");
      setMessages((prev) => [...prev, { text, type: chatLine ? "user" : "system" }]);
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [socketUrl]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [messages]);

  function sendMessage(event) {
    event.preventDefault();
    const socket = socketRef.current;
    const text = input.trim();
    if (!socket || socket.readyState !== WebSocket.OPEN || !text) {
      return;
    }

    socket.send(text);
    setInput("");
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(event);
    }
  }

  function applyName() {
    const socket = socketRef.current;
    const trimmed = name.trim();
    if (!socket || socket.readyState !== WebSocket.OPEN || !trimmed) {
      return;
    }

    socket.send(`/name ${trimmed}`);
  }

  function handleImageSelect(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert("Not connected to server");
        return;
      }

      const base64String = reader.result;
      socket.send(`IMAGE:${base64String}`);
    };
    reader.onerror = () => {
      alert("Failed to read image file");
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const connectionLabel =
    status === "connected" ? "Connected" : status === "connecting" ? "Connecting" : "Offline";

  const chatCount = messages.filter((message) => message.type === "user").length;
  const canSend = status === "connected" && input.trim().length > 0;

  function renderMessage(message) {
    if (message.type !== "user") {
      return <span>{message.text}</span>;
    }

    const separatorIndex = message.text.indexOf(": ");
    if (separatorIndex <= 0) {
      return <span>{message.text}</span>;
    }

    const sender = message.text.slice(0, separatorIndex);
    const content = message.text.slice(separatorIndex + 2);

    return (
      <>
        <strong>{sender}</strong>
        <span>{content}</span>
      </>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <h1>Chatroom</h1>
        </div>
        <div className="meta">
          <p className="pill">Messages: {chatCount}</p>
          <p className={`status ${status}`}>{connectionLabel}</p>
        </div>
      </header>

      <section className="layout">
        <aside className="panel side">
          <h2>Identity</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
            placeholder="your-name"
            maxLength={24}
          />
          <button type="button" onClick={applyName} className="button accent">
            Set Name
          </button>

          <div className="quick-actions">
            <button type="button" className="ghost" onClick={() => setInput("@gemini give me one motivational line")}>Ask Gemini</button>
            <button type="button" className="ghost" onClick={() => setInput("/name ")}>Rename</button>
            <button type="button" className="ghost" onClick={() => setInput("/who")}>Who is online</button>
            <button type="button" className="ghost" onClick={() => setInput("/help")}>Show help</button>
            <button type="button" className="ghost image-action" onClick={() => fileInputRef.current?.click()}>Analyze Image</button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            style={{ display: "none" }}
          />
        </aside>

        <section className="panel chat">
          <div className="chat-head">
            <h2>Live Conversation</h2>
            <p>Synced over WebSocket</p>
          </div>

          <div ref={viewportRef} className="messages" aria-live="polite">
            {messages.length === 0 && (
              <div className="empty-state">
                <p>No messages yet.</p>
                <span>Start the conversation or ask Gemini with @gemini.</span>
              </div>
            )}

            {messages.map((message, index) => (
              <p key={`${message.text}-${index}`} className={`message ${message.type}`}>
                {renderMessage(message)}
              </p>
            ))}
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <div className="composer-input-wrap">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                className="field"
                placeholder="Message, /dm user text, /ask prompt... Enter to send"
                maxLength={2000}
                required
              />
              <p className="counter">{input.length}/2000</p>
            </div>
            <button type="submit" className="button mint" disabled={!canSend}>
              {status === "connected" ? "Send" : "Waiting..."}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
