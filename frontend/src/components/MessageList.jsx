import React, { useEffect, useRef, useState } from "react";
import MessageItem from "./MessageItem";
import { ArrowDown } from './icons';

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

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
      <div 
        ref={viewportRef} 
        className="messages-container" 
        aria-live="polite" 
        onScroll={handleScroll}
      >
        {hasMore && (
          <button className="btn-outline" style={{ margin: '0 auto', maxWidth: '300px' }} onClick={onLoadOlder}>
            Load older messages
          </button>
        )}
        
        {messages.length === 0 && (
          <div className="system-message" style={{ margin: 'auto' }}>
            <div className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
              <h3 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>It's quiet here.</h3>
              <p>Start the conversation or ask Gemini for help with @gemini.</p>
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const isMine = currentUser && (
            (message.sender && message.sender === currentUser.displayName) || 
            (message.text && message.text.startsWith(currentUser.displayName + ':'))
          );
          
          return (
            <MessageItem 
              key={message.clientMessageId || message.id || `sys-${index}`}
              message={message}
              isMine={!!isMine}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );
        })}
      </div>
      
      {showLatestBtn && (
        <button 
          className="jump-to-latest"
          onClick={() => {
             viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
             setShowLatestBtn(false);
          }}
        >
          <ArrowDown size={16} /> Jump to latest
        </button>
      )}
    </div>
  );
}
