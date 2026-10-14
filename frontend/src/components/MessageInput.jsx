import React, { useRef, useEffect } from 'react';
import { Send, Paperclip, X } from './icons';

export default function MessageComposer({ input, setInput, onSendMessage, canSend, status, onFileSelect, attachmentPreview, onClearAttachment }) {
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      if (event.nativeEvent.isComposing) return; // Handle IME
      event.preventDefault();
      onSendMessage(event);
    }
  }

  return (
    <div className="composer-container">
      <form onSubmit={onSendMessage} className="composer-box">
        {attachmentPreview && (
          <div className="attachment-preview">
            <Paperclip size={16} />
            <span style={{ fontSize: '0.85rem', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attachmentPreview.fileName}
            </span>
            <button type="button" onClick={onClearAttachment} className="icon-btn" style={{ color: 'var(--danger)' }}>
              <X size={16} />
            </button>
          </div>
        )}
        
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="composer-input"
          placeholder="Message, @gemini analyze this... (Shift+Enter for new line)"
          maxLength={2000}
          rows={1}
        />
        
        <div className="composer-toolbar">
          <div className="composer-actions">
            <button 
              type="button" 
              className="icon-btn" 
              onClick={() => fileInputRef.current?.click()} 
              title="Attach File"
            >
              <Paperclip size={20} />
            </button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {input.length}/2000
            </span>
            <button 
              type="submit" 
              className="send-btn" 
              disabled={(!canSend && !attachmentPreview) || status !== "connected"}
              title={status !== "connected" ? "Disconnected" : "Send"}
            >
              <Send size={16} />
              <span>{status === "connected" ? "Send" : "Offline"}</span>
            </button>
          </div>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={onFileSelect}
          style={{ display: "none" }}
        />
      </form>
    </div>
  );
}
