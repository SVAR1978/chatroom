import { useEffect, useRef, useState } from "react";

export default function MessageList({ messages, onRetry, onLoadOlder, hasMore, currentUser, onReply, onEdit, onDelete }) {
  const viewportRef = useRef(null);
  const [showLatestBtn, setShowLatestBtn] = useState(false);

  // Scroll preservation
  const previousScrollHeight = useRef(0);
  const previousMessageCount = useRef(0);

  useEffect(() => {
    if (!viewportRef.current) return;
    const el = viewportRef.current;
    
    // If messages were added to the front (loaded older)
    if (messages.length > previousMessageCount.current && previousScrollHeight.current > 0 && el.scrollTop === 0) {
      el.scrollTop = el.scrollHeight - previousScrollHeight.current;
    } 
    // If new messages came in at the bottom and we're near bottom
    else if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) {
      el.scrollTop = el.scrollHeight;
    }

    previousScrollHeight.current = el.scrollHeight;
    previousMessageCount.current = messages.length;
  }, [messages]);

  function handleScroll() {
    if (!viewportRef.current) return;
    const el = viewportRef.current;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 200) {
      setShowLatestBtn(true);
    } else {
      setShowLatestBtn(false);
    }
  }

  function renderMessage(message) {
    if (message.type !== "user") {
      return <span>{message.text}</span>;
    }
    const separatorIndex = message.text.indexOf(": ");
    if (separatorIndex <= 0) return <span>{message.text}</span>;
    const sender = message.text.slice(0, separatorIndex);
    
    // Use message.content directly if available (we will map it in App.jsx)
    const content = message.isDeleted ? "[deleted]" : (message.content || message.text.slice(separatorIndex + 2));
    
    const isMine = currentUser && sender === currentUser.displayName;

    return (
      <>
        <strong>{sender}</strong>
        {message.isAi && <span style={{ marginLeft: '8px', fontSize: '0.7rem', background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: '10px', verticalAlign: 'middle' }}>AI</span>}
        
        {message.replyToId && <div style={{ fontSize: '0.75rem', opacity: 0.7, borderLeft: '2px solid #ccc', paddingLeft: '4px', marginBottom: '4px', marginTop: '4px' }}>Replying to #{message.replyToId}</div>}
        
        {message.attachmentUrl && (
          <div style={{ marginTop: '5px', marginBottom: '5px' }}>
            {message.attachmentType?.startsWith('image/') ? (
              <img src={message.attachmentUrl} alt="Attachment" style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '4px', objectFit: 'contain' }} />
            ) : (
              <a href={message.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '5px 10px', background: '#333', color: '#fff', borderRadius: '4px', textDecoration: 'none' }}>
                📎 Download {message.attachmentType === 'application/pdf' ? 'PDF' : 'Attachment'}
              </a>
            )}
          </div>
        )}

        <span style={{ fontStyle: message.isDeleted ? 'italic' : 'normal' }}>
          {content}
          {message.editedAt && !message.isDeleted && <small style={{ opacity: 0.5, marginLeft: '5px' }}>(edited)</small>}
        </span>
        <div className="msg-actions" style={{ marginTop: '5px', display: 'flex', gap: '10px', fontSize: '0.75rem' }}>
          <button onClick={() => onReply(message)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>Reply</button>
          {isMine && !message.isDeleted && (
            <>
              <button onClick={() => {
                const newContent = prompt("Edit message:", content);
                if (newContent && newContent !== content) onEdit(message.id, newContent);
              }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>Edit</button>
              <button onClick={() => {
                if (confirm("Delete this message?")) onDelete(message.id);
              }} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer' }}>Delete</button>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={viewportRef} className="messages" aria-live="polite" onScroll={handleScroll} style={{ overflowY: 'auto', flex: 1 }}>
        {hasMore && (
          <button className="button ghost" style={{ width: '100%', marginBottom: '10px' }} onClick={onLoadOlder}>
            Load older messages
          </button>
        )}
        {messages.length === 0 && (
          <div className="empty-state">
            <p>No messages yet.</p>
            <span>Start the conversation or ask Gemini with @gemini.</span>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={message.clientMessageId || message.id || index} className={`message ${message.type}`} style={{ opacity: message.status === 'pending' ? 0.6 : 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            {renderMessage(message)}
            {message.status === 'pending' && <span style={{ marginLeft: '10px', fontSize: '0.8rem', opacity: 0.7 }}>...</span>}
            {message.status === 'failed' && (
              <button 
                onClick={() => onRetry && onRetry(message)}
                style={{ marginLeft: '10px', fontSize: '0.8rem', color: '#ff6b6b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Retry
              </button>
            )}
          </div>
        ))}
      </div>
      {showLatestBtn && (
        <button 
          onClick={() => {
             viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
             setShowLatestBtn(false);
          }}
          style={{ position: 'absolute', bottom: '10px', right: '10px', background: '#333', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '20px', cursor: 'pointer' }}
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  );
}
