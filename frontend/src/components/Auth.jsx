import { useState } from "react";

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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <form onSubmit={handleSubmit} style={{ background: '#1e1e1e', padding: '2rem', borderRadius: '8px', width: '300px' }}>
        <h2>{isLogin ? "Login" : "Register"}</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        
        <div style={{ marginBottom: '1rem' }}>
          <label>Username</label>
          <input 
            type="text" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            className="field" 
            required 
            style={{ width: '100%', marginTop: '0.5rem' }} 
          />
        </div>
        
        <div style={{ marginBottom: '1rem' }}>
          <label>Password</label>
          <input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            className="field" 
            required 
            style={{ width: '100%', marginTop: '0.5rem' }} 
          />
        </div>

        <button type="submit" className="button mint" disabled={loading} style={{ width: '100%' }}>
          {loading ? "..." : (isLogin ? "Login" : "Register")}
        </button>

        <p style={{ marginTop: '1rem', textAlign: 'center' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span 
            style={{ color: '#00d2ff', cursor: 'pointer' }} 
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? "Register" : "Login"}
          </span>
        </p>
      </form>
    </div>
  );
}
