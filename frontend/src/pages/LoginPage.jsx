// src/pages/LoginPage.jsx — Login screen
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { login } from '../api/auth';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await login(form);
      setAuth(data);
      toast.success(`Welcome back, ${data.user.username}!`);
      navigate('/lobby');
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ background: 'var(--bg-primary)' }}>
      {/* Background decoration */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden',
        background: 'radial-gradient(ellipse at 30% 40%, rgba(108,99,255,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(0,212,255,0.06) 0%, transparent 50%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: '3rem', marginBottom: 8 }}>⚔️</div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-1px' }}>
            <span className="gradient-text">ArenaBlast</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6 }}>
            Multiplayer 2D Arena — Sign in to battle
          </p>
        </div>

        <div className="card animate-fade-in" style={{ padding: 36 }}>
          <h2 style={{ marginBottom: 24, fontSize: '1.3rem' }}>Sign In</h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                id="username"
                className="form-input"
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder="Enter your username"
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                id="password"
                className="form-input"
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="form-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>
            )}

            <button
              id="btn-login"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Signing in...</> : '⚔️ Enter Arena'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            No account?{' '}
            <Link to="/register" style={{ color: 'var(--accent-primary)', fontWeight: 600, textDecoration: 'none' }}>
              Create one →
            </Link>
          </div>

          {/* Demo credentials */}
          <div style={{
            marginTop: 20,
            padding: '12px 16px',
            background: 'rgba(108,99,255,0.08)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(108,99,255,0.2)',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
          }}>
            <strong style={{ color: 'var(--accent-primary)' }}>Demo accounts:</strong>
            <br />admin / admin123 · demo / demo123 · player1 / player123
          </div>
        </div>
      </div>
    </div>
  );
}
