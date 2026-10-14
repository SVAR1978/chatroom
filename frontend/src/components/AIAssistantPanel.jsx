import React, { useState } from 'react';
import { Bot, UserCog, HelpCircle, X } from './icons';

export default function AIAssistantPanel({ 
  setInput, 
  name, 
  setName, 
  onRename, 
  onWho, 
  onHelp, 
  onAskAI,
  isOpen,
  onClose
}) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <aside className={`context-panel ${isOpen ? 'open' : ''}`}>
      <div className="context-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={18} color="var(--accent-cyan)" />
          <h3>Context & AI</h3>
        </div>
        <button className="icon-btn mobile-context-toggle" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="context-section">
        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <UserCog size={14} /> Identity
        </h4>
        <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            placeholder="Display Name"
            maxLength={24}
          />
          <button type="button" onClick={onRename} className="btn-outline" style={{ fontSize: '0.85rem', padding: '8px' }}>
            Update Name
          </button>
        </div>
      </div>

      <div className="context-section" style={{ flexGrow: 1 }}>
        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Bot size={14} /> Ask Gemini
        </h4>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Gemini will read the last 20 messages in this room to answer your question.
        </p>
        
        <textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          className="input-field"
          placeholder="Ask something about the chat..."
          rows={4}
          style={{ resize: 'none', marginBottom: '12px' }}
        />
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={isPrivate} 
            onChange={e => setIsPrivate(e.target.checked)} 
            style={{ accentColor: 'var(--accent-cyan)' }}
          />
          Private reply (only you will see it)
        </label>
        
        <button 
          type="button" 
          className="btn-primary" 
          onClick={() => {
            if (!aiPrompt.trim()) return;
            onAskAI(aiPrompt, isPrivate);
            setAiPrompt("");
          }}
        >
          Ask Gemini
        </button>

        <div style={{ marginTop: '24px' }}>
          <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Quick Actions</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button className="btn-outline" style={{ textAlign: 'left', fontSize: '0.85rem' }} onClick={() => setInput("@gemini summarize this conversation")}>
              Summarize Conversation
            </button>
            <button className="btn-outline" style={{ textAlign: 'left', fontSize: '0.85rem' }} onClick={onWho}>
              Who is online
            </button>
            <button className="btn-outline" style={{ textAlign: 'left', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={onHelp}>
              <HelpCircle size={14} /> Show Help
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
