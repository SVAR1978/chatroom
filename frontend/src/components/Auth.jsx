import React, { useState } from "react";
import OrbitalScene from "./OrbitalScene";
import { Sparkles, ArrowRight } from "./icons";

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = isLogin ? "/api/login" : "/api/register";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <React.Suspense fallback={null}>
        <OrbitalScene />
      </React.Suspense>
      <div className="auth-overlay">
        <div className="auth-card glass-panel">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
            <Sparkles size={48} color="var(--accent-cyan)" style={{ marginBottom: '16px' }} />
            <h1 className="auth-title" style={{ margin: 0 }}>TeamRoom</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '8px' }}>
              {isLogin ? "Welcome back to the workspace" : "Create your workspace account"}
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="auth-form">
            {error && (
              <div style={{ padding: '12px', background: 'var(--danger-glass)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', border: '1px solid rgba(251, 113, 133, 0.3)' }}>
                {error}
              </div>
            )}
            
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Username</label>
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                className="input-field" 
                required 
                autoFocus
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="input-field" 
                required 
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              {loading ? "..." : (isLogin ? "Login to Workspace" : "Create Account")}
              {!loading && <ArrowRight size={16} />}
            </button>

            <div 
              className="toggle-link"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Need an account? Register" : "Already have an account? Login"}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
