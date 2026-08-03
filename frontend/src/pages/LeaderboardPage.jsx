// src/pages/LeaderboardPage.jsx — Global leaderboard
import React, { useState, useEffect } from 'react';
import { getLeaderboard } from '../api/leaderboard';
import useAuthStore from '../store/authStore';
import Navbar from '../components/Navbar';

const PERIODS = [
  { key: 'all_time', label: '🌍 All Time' },
  { key: 'weekly',   label: '📅 This Week' },
  { key: 'daily',    label: '☀️ Today' },
];

const RankIcon = ({ rank }) => {
  if (rank === 1) return <span style={{ fontSize: '1.25rem' }}>👑</span>;
  if (rank === 2) return <span style={{ fontSize: '1.15rem' }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: '1.15rem' }}>🥉</span>;
  return <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>#{rank}</span>;
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
    <div style={{ minHeight: '100vh', paddingTop: 64 }}>
      <Navbar />

      <div className="container" style={{ paddingTop: 28, paddingBottom: 40, maxWidth: 800 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>🏆</div>
          <h1 style={{ fontSize: 'clamp(1.8rem, 6vw, 2.2rem)', fontWeight: 900 }}>
            <span className="gradient-text">Leaderboard</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: '0.95rem' }}>
            Top warriors of the arena
          </p>
        </div>

        {/* Period tabs */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              id={`tab-${p.key}`}
              className={`btn ${period === p.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              style={{ flex: '1 1 auto', minWidth: 100, maxWidth: 140, justifyContent: 'center' }}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Leaderboard table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '44px 1fr 75px 55px 55px',
            padding: '12px 14px',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            <div style={{ textAlign: 'center' }}>Rank</div>
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
                    display: 'grid',
                    gridTemplateColumns: '44px 1fr 75px 55px 55px',
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--border-color)',
                    background: isMe ? 'rgba(108,99,255,0.12)' : 'transparent',
                    alignItems: 'center',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RankIcon rank={entry.rank || i + 1} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: entry.player?.avatar_color || '#4A90D9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 800, color: 'rgba(255,255,255,0.9)',
                      boxShadow: `0 0 10px ${entry.player?.avatar_color || '#4A90D9'}50`,
                    }}>
                      {(entry.player?.nickname || '?')[0].toUpperCase()}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {entry.player?.nickname || 'Unknown'}
                        {isMe && <span className="badge badge-primary" style={{ marginLeft: 6, fontSize: '0.62rem', padding: '1px 5px' }}>You</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.player?.user?.username}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.88rem' }}>
                    {entry.score?.toLocaleString()}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-danger)', fontSize: '0.85rem' }}>
                    {entry.kills}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--accent-success)', fontSize: '0.85rem' }}>
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
