import React from 'react';
import { User, Bot, FileText } from './icons';

// Simple markdown formatter since we cannot install react-markdown
function formatMarkdown(text) {
  // Bold
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Code block
  formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Newlines
  formatted = formatted.replace(/\n/g, '<br/>');
  return { __html: formatted };
}

export default function MessageItem({ message, isMine, onReply, onEdit, onDelete }) {
  // Try to parse out the sender if it follows "Sender: content" pattern (legacy)
  let sender = message.sender || 'System';
  let content = message.content || message.text || '';
  
  // If the message is a pure string with a colon from older code
  if (message.type === 'user' && !message.content && message.text) {
    const separatorIndex = message.text.indexOf(': ');
    if (separatorIndex > 0) {
      sender = message.text.slice(0, separatorIndex);
      content = message.text.slice(separatorIndex + 2);
    }
  }

  if (message.isDeleted) {
    content = '[deleted]';
  }

  const isAi = message.isAi || sender.toLowerCase() === 'gemini';

  const timeString = message.createdAt 
    ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (message.type === 'system' || message.type === 'error') {
    return (
      <div className={`system-message ${message.type === 'error' ? 'error-text' : ''}`} style={message.type === 'error' ? { color: 'var(--danger)'} : {}}>
        {content}
      </div>
    );
  }

  return (
    <div className={`message-group ${isMine ? 'mine' : ''} ${isAi ? 'ai' : ''}`} style={{ opacity: message.status === 'pending' ? 0.6 : 1 }}>
      <div className="message-avatar" aria-hidden="true">
        {isAi ? <Bot size={20} /> : <User size={20} />}
      </div>
      
      <div className="message-content">
        <div className="message-header">
          <span className="message-sender">{sender}</span>
          <span className="message-time">{timeString}</span>
          {message.editedAt && !message.isDeleted && <span className="message-time" style={{marginLeft: '4px'}}>(edited)</span>}
        </div>
        
        {message.replyToId && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', paddingLeft: '8px', borderLeft: '2px solid var(--border-glass)' }}>
            Replying to #{message.replyToId}
          </div>
        )}

        <div className="message-bubble">
          {isAi ? (
            <div className="markdown-body" dangerouslySetInnerHTML={formatMarkdown(content)} />
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', fontStyle: message.isDeleted ? 'italic' : 'normal' }}>
              {content}
            </div>
          )}

          {message.attachmentUrl && (
            <div className="message-attachment">
              {message.attachmentType?.startsWith('image/') ? (
                <img src={message.attachmentUrl} alt="Attachment" loading="lazy" />
              ) : (
                <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="message-file">
                  <FileText size={18} />
                  <span>Download {message.attachmentType === 'application/pdf' ? 'PDF' : 'File'}</span>
                </a>
              )}
            </div>
          )}
        </div>

        <div className="msg-actions" style={{ marginTop: '6px', display: 'flex', gap: '12px', fontSize: '0.8rem', opacity: 0.7 }}>
          <button onClick={() => onReply(message)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Reply</button>
          {isMine && !message.isDeleted && (
            <>
              <button onClick={() => {
                const newContent = prompt("Edit message:", content);
                if (newContent && newContent !== content) onEdit(message.id, newContent);
              }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Edit</button>
              <button onClick={() => {
                if (confirm("Delete this message?")) onDelete(message.id);
              }} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>Delete</button>
            </>
          )}
        </div>
        
        {message.status === 'failed' && (
          <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--danger)' }}>
            Failed to send. <button onClick={() => {/* Handle Retry */}} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}
