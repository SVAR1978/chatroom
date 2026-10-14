import React from 'react';
import { MessageSquare, Hash, Users, Sparkles, LogOut } from './icons';

export default function ConversationSidebar({ 
  rooms, 
  currentRoom, 
  unreadCounts, 
  onJoinRoom, 
  onlineUsers, 
  onMessageUser,
  currentUser,
  onLogout,
  isOpen
}) {
  const publicRooms = rooms.filter(r => !r.isDirect);
  const directMessages = rooms.filter(r => r.isDirect);

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="brand-header">
        <Sparkles size={24} color="var(--accent-cyan)" />
        <h1>TeamRoom</h1>
      </div>

      <div className="nav-section">
        <h2>Channels</h2>
        {publicRooms.map(r => (
          <div 
            key={r.id}
            className={`nav-item ${currentRoom === r.id ? 'active' : ''}`}
            onClick={() => onJoinRoom(r.id)}
          >
            <div className="name-content">
              <Hash size={16} opacity={0.7} />
              <span>{r.name}</span>
            </div>
            {unreadCounts && unreadCounts[r.id] > 0 && (
              <span className="badge">{unreadCounts[r.id]}</span>
            )}
          </div>
        ))}

        {directMessages.length > 0 && (
          <>
            <h2 style={{ marginTop: '24px' }}>Direct Messages</h2>
            {directMessages.map(r => (
              <div 
                key={r.id}
                className={`nav-item ${currentRoom === r.id ? 'active' : ''}`}
                onClick={() => onJoinRoom(r.id)}
              >
                <div className="name-content">
                  <MessageSquare size={16} opacity={0.7} />
                  <span>{r.name}</span>
                </div>
                {unreadCounts && unreadCounts[r.id] > 0 && (
                  <span className="badge">{unreadCounts[r.id]}</span>
                )}
              </div>
            ))}
          </>
        )}

        {onlineUsers && onlineUsers.length > 0 && (
          <>
            <h2 style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={14} /> Online
            </h2>
            {onlineUsers.map(u => (
              <div 
                key={u.username}
                className="nav-item"
                onClick={() => onMessageUser(u.username)}
              >
                <div className="name-content">
                  <div className="status-dot connected" style={{ width: '6px', height: '6px' }}></div>
                  <span>{u.name}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="user-profile">
        <div className="avatar">
          {currentUser?.displayName?.charAt(0).toUpperCase() || '?'}
        </div>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentUser?.displayName}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            @{currentUser?.username}
          </div>
        </div>
        <button onClick={onLogout} className="icon-btn" title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
