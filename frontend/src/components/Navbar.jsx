// src/components/Navbar.jsx — Responsive Top Navigation Bar
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { logout as apiLogout } from '../api/auth';

export default function Navbar({ onOpenProfile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, player, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try { await apiLogout(); } catch (e) { /* ignore */ }
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/lobby', label: 'Lobby', icon: '🏠' },
    { path: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
    { path: '/history', label: 'History', icon: '📜' },
  ];

  return (
    <>
      <nav className="navbar">
        {/* Brand */}
        <Link 
          to="/lobby" 
          className="navbar-brand gradient-text" 
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <span>⚔️</span>
          <span>ArenaBlast</span>
        </Link>

        {/* Desktop Links */}
        <div className="navbar-links desktop-only">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <span>{item.icon}</span> {item.label}
              </Link>
            );
          })}

          {/* User Profile Pill */}
          <div
            onClick={() => onOpenProfile?.()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginLeft: 8,
              padding: '6px 14px',
              background: 'var(--bg-card)',
              cursor: onOpenProfile ? 'pointer' : 'default',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              transition: 'border-color var(--transition)',
            }}
            className="nav-user-pill"
          >
            {player?.avatar_url ? (
              <img
                src={player.avatar_url}
                alt="avatar"
                style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: player?.avatar_color || '#4A90D9',
                  boxShadow: `0 0 6px ${player?.avatar_color || '#4A90D9'}`,
                }}
              />
            )}
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {player?.nickname || user?.username}
            </span>
          </div>

          {/* Logout Button */}
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 8 }}
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>

        {/* Mobile Right Bar: Mini User Pill + Hamburger */}
        <div className="mobile-only" style={{ display: 'none', alignItems: 'center', gap: 10 }}>
          <div
            onClick={() => onOpenProfile?.()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
            }}
          >
            {player?.avatar_url ? (
              <img
                src={player.avatar_url}
                alt="avatar"
                style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: player?.avatar_color || '#4A90D9',
                }}
              />
            )}
            <span
              style={{
                fontSize: '0.82rem',
                color: 'var(--text-primary)',
                fontWeight: 600,
                maxWidth: 90,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {player?.nickname || user?.username}
            </span>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '8px 12px', fontSize: '1.1rem', minWidth: 42, minHeight: 40 }}
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer / Overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-drawer-overlay animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="mobile-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Profile info */}
            <div className="mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {player?.avatar_url ? (
                  <img
                    src={player.avatar_url}
                    alt="avatar"
                    style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: player?.avatar_color || '#4A90D9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.2rem',
                      fontWeight: 800,
                    }}
                  >
                    {(player?.nickname || user?.username || '?')[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                    {player?.nickname || user?.username}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    @{user?.username}
                  </div>
                </div>
              </div>

              {onOpenProfile && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 12, width: '100%' }}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenProfile();
                  }}
                >
                  ⚙️ Profile Settings
                </button>
              )}
            </div>

            {/* Navigation links */}
            <div className="mobile-drawer-links">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`mobile-drawer-item ${isActive ? 'active' : ''}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                    <span style={{ fontWeight: 600 }}>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Footer / Logout */}
            <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
              <button
                className="btn btn-danger btn-full"
                onClick={handleLogout}
              >
                🚪 Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
