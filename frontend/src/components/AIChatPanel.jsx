import { useState } from "react";

export default function AIChatPanel({ setInput, name, setName, onRename, onWho, onHelp, onAskAI }) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <aside className="panel side" style={{ width: '300px', display: 'flex', flexDirection: 'column' }}>
      <h2>Identity</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="field"
        placeholder="your-name"
        maxLength={24}
      />
      <button type="button" onClick={onRename} className="button accent" style={{ marginTop: '10px' }}>
        Set Name
      </button>

      <h2 style={{ marginTop: '2rem' }}>Ask Gemini</h2>
      <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Gemini will read the last 20 messages in this room to answer your question.</p>
      <textarea
        value={aiPrompt}
        onChange={(e) => setAiPrompt(e.target.value)}
        className="field"
        placeholder="Ask something about the chat..."
        rows={3}
        style={{ marginTop: '10px' }}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px', fontSize: '0.9rem' }}>
        <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
        Private reply (only you will see it)
      </label>
      <button 
        type="button" 
        className="button mint" 
        style={{ marginTop: '10px' }} 
        onClick={() => {
          if (!aiPrompt.trim()) return;
          onAskAI(aiPrompt, isPrivate);
          setAiPrompt("");
        }}
      >
        Ask Gemini
      </button>

      <div className="quick-actions" style={{ marginTop: '2rem' }}>
        <button type="button" className="ghost" onClick={() => setInput("@gemini summarize this conversation")}>Quick Summarize</button>
        <button type="button" className="ghost" onClick={onWho}>Who is online</button>
        <button type="button" className="ghost" onClick={onHelp}>Show help</button>
      </div>
    </aside>
  );
}
