// src/pages/LeaderboardPage.jsx — Global leaderboard
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard } from '../api/leaderboard';
import useAuthStore from '../store/authStore';

const PERIODS = [
  { key: 'all_time', label: '🌍 All Time' },
  { key: 'weekly',   label: '📅 This Week' },
  { key: 'daily',    label: '☀️ Today' },
];

const RankIcon = ({ rank }) => {
  if (rank === 1) return <span style={{ fontSize: '1.3rem' }}>👑</span>;
  if (rank === 2) return <span style={{ fontSize: '1.2rem' }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: '1.2rem' }}>🥉</span>;
  return <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700 }}>#{rank}</span>;
};

export default function LeaderboardPage() {
  const { player: myPlayer } = useAuthStore();
  const [period, setPeriod] = useState('all_time');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getLeaderboard(period, 20)
      .then(({ data }) => setData(data.leaderboard || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div style={{ minHeight: '100vh', paddingTop: 70 }}>
      <nav className="navbar">
        <span className="navbar-brand gradient-text">⚔️ ArenaBlast</span>
        <div className="navbar-links">
          <Link to="/lobby"       className="nav-link">🏠 Lobby</Link>
          <Link to="/leaderboard" className="nav-link active">🏆 Leaderboard</Link>
          <Link to="/history"     className="nav-link">📜 History</Link>
        </div>
      </nav>

      <div className="container" style={{ paddingTop: 40, paddingBottom: 40, maxWidth: 800 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏆</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900 }}>
            <span className="gradient-text">Leaderboard</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6 }}>Top warriors of the arena</p>
        </div>

        {/* Period tabs */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              id={`tab-${p.key}`}
              className={`btn ${period === p.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Leaderboard table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px 80px',
            padding: '12px 20px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <div>Rank</div>
            <div>Player</div>
            <div style={{ textAlign: 'right' }}>Score</div>
            <div style={{ textAlign: 'right' }}>Kills</div>
            <div style={{ textAlign: 'right' }}>Wins</div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div className="spinner" />
            </div>
          ) : data.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              No data yet. Play some matches!
            </div>
          ) : (
            data.map((entry, i) => {
              const isMe = entry.player?.nickname === myPlayer?.nickname;
              return (
                <div
                  key={entry.id || i}
                  className="animate-fade-in"
                  style={{
                    display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px 80px',
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border-color)',
                    background: isMe ? 'rgba(108,99,255,0.08)' : 'transparent',
                    alignItems: 'center',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RankIcon rank={entry.rank || i + 1} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: entry.player?.avatar_color || '#4A90D9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.85rem', fontWeight: 800, color: 'rgba(255,255,255,0.8)',
                      boxShadow: `0 0 12px ${entry.player?.avatar_color || '#4A90D9'}60`,
                    }}>
                      {(entry.player?.nickname || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        {entry.player?.nickname || 'Unknown'}
                        {isMe && <span className="badge badge-primary" style={{ marginLeft: 8, fontSize: '0.65rem' }}>You</span>}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {entry.player?.user?.username}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 700 }}>
                    {entry.score?.toLocaleString()}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-danger)' }}>
                    {entry.kills}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-success)' }}>
                    {entry.wins}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
