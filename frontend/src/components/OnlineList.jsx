import React from 'react';

export default function OnlineList({ users, onMessage }) {
  if (!users || users.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3 style={{ fontSize: '0.9rem', opacity: 0.8, textTransform: 'uppercase', marginBottom: '0.5rem', padding: '0 1rem' }}>
        Online
      </h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {users.map(u => (
          <li 
            key={u.username} 
            style={{ 
              padding: '0.5rem 1rem', 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '4px'
            }}
          >
            <span>{u.name}</span>
            <button 
              className="button ghost" 
              style={{ padding: '2px 8px', fontSize: '0.8rem' }}
              onClick={() => onMessage(u.username)}
            >
              Message
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
