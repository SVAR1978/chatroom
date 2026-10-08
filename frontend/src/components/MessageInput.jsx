import { useRef } from "react";

export default function MessageInput({ input, setInput, onSendMessage, canSend, status, onFileSelect, attachmentPreview, onClearAttachment }) {
  const fileInputRef = useRef(null);

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSendMessage(event);
    }
  }

  return (
    <form className="composer" onSubmit={onSendMessage}>
      {attachmentPreview && (
        <div style={{ background: '#222', padding: '10px', borderRadius: '4px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.8rem' }}>📎 {attachmentPreview.fileName}</span>
          <button type="button" onClick={onClearAttachment} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '0.8rem' }}>Remove</button>
        </div>
      )}
      <div className="composer-input-wrap">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          className="field"
          placeholder="Message, @gemini explain this image... Enter to send"
          maxLength={2000}
        />
        <p className="counter">{input.length}/2000</p>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button type="button" className="ghost image-action" onClick={() => fileInputRef.current?.click()} title="Attach File">
          📎
        </button>
        <button type="submit" className="button mint" disabled={!canSend && !attachmentPreview}>
          {status === "connected" ? "Send" : "Waiting..."}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={onFileSelect}
        style={{ display: "none" }}
      />
    </form>
  );
}
