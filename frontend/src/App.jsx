import React, { useEffect, useMemo, useRef, useState } from "react";
import ConversationSidebar from "./components/ConversationSidebar";
import MessageList from "./components/MessageList";
import MessageComposer from "./components/MessageInput";
import AIAssistantPanel from "./components/AIAssistantPanel";
import Auth from "./components/Auth";
import OrbitalScene from "./components/OrbitalScene";
import { Menu, Search, Users, X } from './components/icons';

function getSocketUrl(token) {
  const env = import.meta.env.VITE_WS_URL;
  let url = env;
  if (!url) {
    const wsPort = Number(import.meta.env.VITE_WS_PORT ?? 8080);
    if (typeof window === "undefined") {
      url = `ws://localhost:${wsPort}`;
    } else {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      if (import.meta.env.DEV) {
        url = `${protocol}://${window.location.hostname}:${wsPort}`;
      } else {
        url = `${protocol}://${window.location.host}`;
      }
    }
  }
  return `${url}?token=${token}`;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("connecting");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [reconnectCount, setReconnectCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [replyToMsg, setReplyToMsg] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);
  
  const socketRef = useRef(null);

  const socketUrl = useMemo(() => token ? getSocketUrl(token) : null, [token]);

  useEffect(() => {
    if (token) {
      fetch("/api/me", { headers: { "Authorization": `Bearer ${token}` } })
        .then(res => {
          if (!res.ok) throw new Error("Invalid session");
          return res.json();
        })
        .then(data => {
          setUser(data.user);
          setName(data.user.displayName);
          return fetch("/api/rooms", { headers: { "Authorization": `Bearer ${token}` } });
        })
        .then(res => res.json())
        .then(data => {
          setRooms(data.rooms || []);
          if (data.rooms && data.rooms.length > 0 && !currentRoom) {
            const general = data.rooms.find(r => r.name === "general") || data.rooms[0];
            setCurrentRoom(general.id);
          }
          setLoading(false);
        })
        .catch(() => {
          setToken(null);
          localStorage.removeItem("token");
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token && currentRoom) {
      setUnreadCounts(prev => ({ ...prev, [currentRoom]: 0 }));
      const url = `/api/rooms/${currentRoom}/messages` + (searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : "");
      fetch(url, { headers: { "Authorization": `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          if (data.messages) {
            setHasMoreMessages(data.messages.length === 50);
            setMessages(data.messages.map(m => ({ 
              id: m.id, clientMessageId: m.clientMessageId, text: `${m.senderName}: ${m.content}`, sender: m.senderName, 
              type: "user", status: "saved", content: m.content, isDeleted: m.isDeleted, editedAt: m.editedAt, replyToId: m.replyToId,
              attachmentId: m.attachmentId, attachmentUrl: m.attachmentId ? `/api/rooms/${currentRoom}/attachments/${m.attachmentId}` : undefined,
              attachmentType: m.attachment?.mimeType, isAi: m.isAi, createdAt: m.createdAt
            })));
          }
        });
    }
  }, [currentRoom, token, searchQuery]);

  function loadOlderMessages() {
    const firstMsg = messages.find(m => m.id);
    if (!firstMsg) return;
    const url = `/api/rooms/${currentRoom}/messages?before=${firstMsg.id}` + (searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : "");
    fetch(url, { headers: { "Authorization": `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.messages) {
          setHasMoreMessages(data.messages.length === 50);
          const older = data.messages.map(m => ({ 
            id: m.id, clientMessageId: m.clientMessageId, text: `${m.senderName}: ${m.content}`, sender: m.senderName,
            type: "user", status: "saved", content: m.content, isDeleted: m.isDeleted, editedAt: m.editedAt, replyToId: m.replyToId,
            attachmentId: m.attachmentId, attachmentUrl: m.attachmentId ? `/api/rooms/${currentRoom}/attachments/${m.attachmentId}` : undefined,
            attachmentType: m.attachment?.mimeType, isAi: m.isAi, createdAt: m.createdAt
          }));
          setMessages(prev => [...older, ...prev]);
        }
      });
  }

  useEffect(() => {
    if (!socketUrl || !user) return;
    
    let isMounted = true;
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;
    let pingInterval;
    let pongTimeout;

    socket.addEventListener("open", () => {
      if (!isMounted) return;
      setStatus("connected");
      setReconnectCount(0);
      setMessages((prev) => {
        const lastId = prev.reduce((max, m) => m.id && typeof m.id === "number" && m.id > max ? m.id : max, 0);
        if (lastId > 0 && currentRoom) {
          fetch(`/api/rooms/${currentRoom}/messages?after=${lastId}`, { headers: { "Authorization": `Bearer ${token}` } })
            .then(res => res.json())
            .then(data => {
              if (data.messages && data.messages.length > 0 && isMounted) {
                setMessages(curr => {
                  const newMsgs = data.messages.map(m => ({ 
                    id: m.id, clientMessageId: m.clientMessageId, text: `${m.senderName}: ${m.content}`, sender: m.senderName,
                    type: "user", status: "saved", content: m.content, isDeleted: m.isDeleted, editedAt: m.editedAt, replyToId: m.replyToId,
                    attachmentId: m.attachmentId, attachmentUrl: m.attachmentId ? `/api/rooms/${currentRoom}/attachments/${m.attachmentId}` : undefined,
                    attachmentType: m.attachment?.mimeType, isAi: m.isAi, createdAt: m.createdAt
                  }));
                  const filtered = newMsgs.filter(nm => !curr.find(c => c.id === nm.id));
                  return [...curr, ...filtered];
                });
              }
            });
        }
        return [...prev, { text: "Connected to TeamRoom Server", type: "system" }];
      });
      
      pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
          pongTimeout = setTimeout(() => {
            console.log("Dead connection detected");
            socket.close();
          }, 5000);
        }
      }, 15000);
    });

    socket.addEventListener("close", (e) => {
      if (!isMounted) return;
      setStatus("disconnected");
      clearInterval(pingInterval);
      clearTimeout(pongTimeout);
      setMessages((prev) => [...prev, { text: `Connection closed: ${e.reason || 'Unknown'}`, type: "error" }]);
      if (e.code === 1008) {
        handleLogout();
      } else {
        const timeout = Math.min(1000 * Math.pow(2, reconnectCount), 30000);
        setTimeout(() => {
          if (isMounted) setReconnectCount(rc => rc + 1);
        }, timeout);
      }
    });

    socket.addEventListener("error", () => {
      if (isMounted) setStatus("error");
    });

    socket.addEventListener("message", (event) => {
      if (!isMounted) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "pong") {
          clearTimeout(pongTimeout);
        } else if (data.type === "message.ack") {
          setMessages(prev => prev.map(m => m.clientMessageId === data.clientMessageId ? { ...m, status: "saved", id: data.id } : m));
        } else if (data.type === "message.update") {
          setMessages(prev => prev.map(m => m.id === data.id ? { ...m, content: data.content, isDeleted: data.isDeleted, editedAt: data.editedAt } : m));
        } else if (data.type === "message.new") {
          if (data.roomId === currentRoom) {
            setMessages((prev) => {
              if (data.clientMessageId && prev.find(m => m.clientMessageId === data.clientMessageId)) {
                return prev.map(m => m.clientMessageId === data.clientMessageId ? { ...m, status: "saved", id: data.id } : m);
              }
              if (data.id && prev.find(m => m.id === data.id)) return prev;
              return [...prev, { 
                id: data.id, clientMessageId: data.clientMessageId, text: `${data.sender}: ${data.content}`, sender: data.sender,
                content: data.content, replyToId: data.replyToId, isDeleted: data.isDeleted, editedAt: data.editedAt, 
                attachmentId: data.attachmentId, attachmentUrl: data.attachmentUrl, attachmentType: data.attachmentType,
                isAi: data.isAi, createdAt: data.createdAt,
                type: "user", status: "saved" 
              }];
            });
          } else {
            setUnreadCounts(prev => ({ ...prev, [data.roomId]: (prev[data.roomId] || 0) + 1 }));
          }
        } else if (data.type === "system.notice") {
          if (!data.roomId || data.roomId === currentRoom) {
            setMessages((prev) => [...prev, { text: data.content, type: "system" }]);
          }
        } else if (data.type === "auth.success") {
          setName(data.name);
        } else if (data.type === "online.users") {
          setOnlineUsers(data.users);
        } else if (data.type === "error") {
          setMessages((prev) => [...prev, { text: `Error: ${data.message}`, type: "error" }]);
        }
      } catch (err) {
        const text = String(event.data ?? "").trim();
        if (text) {
          const chatLine = text.includes(": ");
          setMessages((prev) => [...prev, { text, type: chatLine ? "user" : "system", status: "saved", sender: chatLine ? text.split(": ")[0] : undefined }]);
        }
      }
    });

    return () => {
      isMounted = false;
      clearInterval(pingInterval);
      clearTimeout(pongTimeout);
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [socketUrl, currentRoom, user, reconnectCount]);

  function handleLogin(newToken, newUser) {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(newUser);
    setName(newUser.displayName);
  }

  function handleLogout() {
    if (token) {
      fetch("/api/logout", { method: "POST", headers: { "Authorization": `Bearer ${token}` } }).catch(() => {});
    }
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setMessages([]);
  }

  function sendMessage(event) {
    if (event) event.preventDefault();
    const socket = socketRef.current;
    const text = input.trim();
    if (!socket || socket.readyState !== WebSocket.OPEN || !text) return;

    if (text.startsWith("/")) {
      const parts = text.split(" ");
      const command = parts[0].slice(1).toLowerCase();
      const args = parts.slice(1);
      
      if (command === "name" && args[0]) {
        socket.send(JSON.stringify({ type: "auth.rename", name: args.join(" ") }));
      } else if (command === "invite") {
        fetch(`/api/rooms/${currentRoom}/invites`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          if (data.inviteId) {
            setMessages(prev => [...prev, { text: `Invite code generated: ${data.inviteId} (use /join ${data.inviteId})`, type: "system" }]);
          } else {
            setMessages(prev => [...prev, { text: `Error: ${data.error}`, type: "error" }]);
          }
        });
      } else if (command === "join" && args[0]) {
        fetch(`/api/invites/${args[0]}/join`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          if (data.room) {
            setRooms(prev => [...prev, data.room]);
            setCurrentRoom(data.room.id);
            socket.send(JSON.stringify({ type: "room.join", roomId: data.room.id }));
            setMessages(prev => [...prev, { text: `Joined room ${data.room.name}`, type: "system" }]);
          } else {
            setMessages(prev => [...prev, { text: `Error: ${data.error}`, type: "error" }]);
          }
        });
      } else if (command === "create" && args[0]) {
        fetch(`/api/rooms`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: args[0], isPrivate: false })
        })
        .then(res => res.json())
        .then(data => {
          if (data.room) {
            setRooms(prev => [...prev, data.room]);
            setCurrentRoom(data.room.id);
            socket.send(JSON.stringify({ type: "room.join", roomId: data.room.id }));
            setMessages(prev => [...prev, { text: `Created room ${data.room.name}`, type: "system" }]);
          }
        });
      } else if (command === "leave") {
        fetch(`/api/rooms/${currentRoom}/leave`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        })
        .then(() => {
          socket.send(JSON.stringify({ type: "room.leave", roomId: currentRoom }));
          setRooms(prev => prev.filter(r => r.id !== currentRoom));
          setCurrentRoom(rooms.find(r => r.id !== currentRoom)?.id || null);
          setMessages([]);
        });
      } else if (command === "dm" && args.length > 0) {
        const targetUsername = args[0];
        const msg = args.slice(1).join(" ");
        fetch(`/api/dms`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ targetUsername })
        })
        .then(res => res.json())
        .then(data => {
          if (data.room) {
            const isNew = !rooms.find(r => r.id === data.room.id);
            if (isNew) {
              setRooms(prev => [...prev, data.room]);
            }
            setCurrentRoom(data.room.id);
            socket.send(JSON.stringify({ type: "room.join", roomId: data.room.id }));
            if (msg) {
              setTimeout(() => {
                socket.send(JSON.stringify({ type: "message.send", roomId: data.room.id, content: msg }));
              }, 100);
            }
          } else {
            setMessages(prev => [...prev, { text: `Error: ${data.error}`, type: "error" }]);
          }
        });
      } else if (command === "block" && args[0]) {
        fetch(`/api/users/${args[0]}/block`, { method: "POST", headers: { "Authorization": `Bearer ${token}` } })
        .then(() => setMessages(prev => [...prev, { text: `Blocked ${args[0]}`, type: "system" }]));
      } else if (command === "unblock" && args[0]) {
        fetch(`/api/users/${args[0]}/block`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } })
        .then(() => setMessages(prev => [...prev, { text: `Unblocked ${args[0]}`, type: "system" }]));
      } else {
        socket.send(JSON.stringify({ type: "command.execute", command, args }));
      }
    } else {
      const cid = crypto.randomUUID();
      const payload = { type: "message.send", roomId: currentRoom, content: text, clientMessageId: cid };
      if (replyToMsg) {
        payload.replyToId = replyToMsg.id;
      }
      if (attachmentPreview) {
        payload.attachmentId = attachmentPreview.attachmentId;
      }
      setMessages(prev => [...prev, { 
        clientMessageId: cid, text: `${name}: ${text}`, sender: name, content: text, rawContent: text, type: "user", status: "pending", 
        replyToId: replyToMsg?.id, attachmentId: attachmentPreview?.attachmentId, attachmentUrl: attachmentPreview?.url, attachmentType: attachmentPreview?.mimeType,
        createdAt: new Date().toISOString()
      }]);
      socket.send(JSON.stringify(payload));
      setTimeout(() => {
        setMessages(prev => prev.map(m => m.clientMessageId === cid && m.status === "pending" ? { ...m, status: "failed" } : m));
      }, 5000);
      setReplyToMsg(null);
      setAttachmentPreview(null);
    }
    
    setInput("");
  }

  function handleRetry(message) {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    setMessages(prev => prev.map(m => m.clientMessageId === message.clientMessageId ? { ...m, status: "pending" } : m));
    socketRef.current.send(JSON.stringify({ type: "message.send", roomId: currentRoom, content: message.rawContent, clientMessageId: message.clientMessageId }));
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.clientMessageId === message.clientMessageId && m.status === "pending" ? { ...m, status: "failed" } : m));
    }, 5000);
  }

  function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      alert("File too large (max 5MB)");
      return;
    }
    
    setMessages((prev) => [...prev, { text: `Uploading ${file.name}...`, type: "system", isTempUpload: true }]);

    fetch(`/api/rooms/${currentRoom}/attachments`, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": file.name,
        "Content-Length": file.size.toString()
      },
      body: file
    })
    .then(async res => {
      const data = await res.json();
      setMessages(prev => prev.filter(m => !m.isTempUpload));
      if (res.ok && data.attachmentId) {
        setAttachmentPreview(data);
      } else {
        alert(data.error || "Upload failed");
      }
    })
    .catch(err => {
      setMessages(prev => prev.filter(m => !m.isTempUpload));
      alert("Upload failed");
    });
    
    event.target.value = "";
  }

  function applyName() {
    const socket = socketRef.current;
    const trimmed = name.trim();
    if (!socket || socket.readyState !== WebSocket.OPEN || !trimmed) return;
    socket.send(JSON.stringify({ type: "auth.rename", name: trimmed }));
  }

  function handleJoinRoom(newRoomId) {
    if (newRoomId === currentRoom) return;
    setCurrentRoom(newRoomId);
    setMessages([]);
    setIsSidebarOpen(false); // Close sidebar on mobile
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>Loading...</div>;

  if (!token || !user) {
    return <Auth onLogin={handleLogin} />;
  }

  const canSend = status === "connected" && input.trim().length > 0;
  const currentRoomName = rooms.find(r => r.id === currentRoom)?.name || "Loading...";

  return (
    <div className="app-layout">
      <React.Suspense fallback={null}>
        <OrbitalScene />
      </React.Suspense>
      
      {/* Overlay for mobile menus */}
      {(isSidebarOpen || isContextOpen) && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 15 }} 
          onClick={() => { setIsSidebarOpen(false); setIsContextOpen(false); }}
        />
      )}

      <ConversationSidebar 
        rooms={rooms}
        currentRoom={currentRoom}
        unreadCounts={unreadCounts}
        onJoinRoom={handleJoinRoom}
        onlineUsers={onlineUsers.filter(u => u.username !== user.username)}
        onMessageUser={(username) => {
          setInput(`/dm ${username} `);
          document.querySelector('textarea.composer-input')?.focus();
          setIsSidebarOpen(false);
        }}
        currentUser={user}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
      />

      <main className="main-content">
        <header className="chat-header">
          <div className="chat-title-info">
            <button className="icon-btn mobile-nav-toggle" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <h2>{rooms.find(r => r.id === currentRoom)?.isDirect ? currentRoomName : `# ${currentRoomName}`}</h2>
              <div className="status-indicator">
                <div className={`status-dot ${status}`} />
                <span>{status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', display: 'none' /* Enable when supported globally */ }} className="search-wrap">
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input-field"
                style={{ paddingLeft: '32px', width: '200px' }}
              />
            </div>
            
            <button className="icon-btn mobile-context-toggle" onClick={() => setIsContextOpen(true)}>
              <Users size={20} />
            </button>
          </div>
        </header>

        <MessageList 
          messages={messages} 
          onRetry={handleRetry} 
          onLoadOlder={loadOlderMessages} 
          hasMore={hasMoreMessages}
          currentUser={user}
          onReply={msg => setReplyToMsg(msg)}
          onEdit={(id, content) => socketRef.current?.send(JSON.stringify({ type: "message.edit", messageId: id, content }))}
          onDelete={id => socketRef.current?.send(JSON.stringify({ type: "message.delete", messageId: id }))}
        />

        {replyToMsg && (
          <div style={{ background: 'var(--surface-solid)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-glass)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Replying to <strong>{replyToMsg.sender || 'Unknown'}</strong>: 
              <span style={{ opacity: 0.7, marginLeft: '8px' }}>{replyToMsg.content ? replyToMsg.content.substring(0, 50) + '...' : 'Message'}</span>
            </span>
            <button onClick={() => setReplyToMsg(null)} className="icon-btn" style={{ color: 'var(--danger)' }}>
              <X size={16} />
            </button>
          </div>
        )}

        <MessageComposer 
          input={input} 
          setInput={setInput} 
          onSendMessage={sendMessage} 
          canSend={canSend} 
          status={status} 
          onFileSelect={handleFileSelect}
          attachmentPreview={attachmentPreview}
          onClearAttachment={() => setAttachmentPreview(null)}
        />
      </main>

      <AIAssistantPanel 
        setInput={setInput} 
        name={name} 
        setName={setName} 
        onRename={applyName}
        onWho={() => { setInput("/who"); sendMessage({ preventDefault: () => {} }); }}
        onHelp={() => { setInput("/help"); sendMessage({ preventDefault: () => {} }); }}
        onAskAI={(prompt, isPrivate) => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ 
              type: "ai.ask", 
              roomId: currentRoom, 
              prompt, 
              isPrivate,
              attachmentId: attachmentPreview?.attachmentId
            }));
            setIsContextOpen(false); // Close on mobile
          } else {
            alert("Not connected to server");
          }
        }}
        isOpen={isContextOpen}
        onClose={() => setIsContextOpen(false)}
      />
    </div>
  );
}
