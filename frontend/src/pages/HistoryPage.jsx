// src/pages/HistoryPage.jsx — Match history
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMyHistory } from '../api/matches';
import useAuthStore from '../store/authStore';
import Navbar from '../components/Navbar';

const formatDuration = (s) => {
  if (!s) return '-';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

const formatDate = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export default function HistoryPage() {
  const { player } = useAuthStore();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyHistory()
      .then(({ data }) => setMatches(data.matches || []))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, []);

  const totalKills  = matches.reduce((s, m) => s + (m.myStats?.kills || 0), 0);
  const totalWins   = matches.filter((m) => m.winner?.nickname === player?.nickname).length;

  return (
    <div style={{ minHeight: '100vh', paddingTop: 64 }}>
      <Navbar />

      <div className="container" style={{ paddingTop: 28, paddingBottom: 40, maxWidth: 860 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 'clamp(1.6rem, 5vw, 2rem)', fontWeight: 800, marginBottom: 4 }}>
            📜 Match History
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Playing as <strong style={{ color: 'var(--accent-secondary)' }}>{player?.nickname}</strong>
          </p>
        </div>

        {/* Stats overview */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 10,
          marginBottom: 24,
        }}>
          {[
            { label: 'Matches', value: matches.length, color: 'var(--accent-primary)' },
            { label: 'Wins',    value: totalWins,       color: 'var(--accent-success)' },
            { label: 'Kills',   value: totalKills,      color: 'var(--accent-danger)' },
            { label: 'Win Rate', value: matches.length ? `${Math.round((totalWins / matches.length) * 100)}%` : '-', color: 'var(--accent-gold)' },
          ].map((s) => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: '14px 8px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)' }}>
                {s.value}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', fontWeight: 600 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Match list */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="spinner" />
          </div>
        ) : matches.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 50 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🎮</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>No matches yet! Head to the lobby to play.</p>
            <Link to="/lobby" className="btn btn-primary btn-sm" style={{ marginTop: 14, display: 'inline-flex' }}>
              Go to Lobby →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {matches.map((match, i) => {
              const myStats = match.myStats || {};
              const isWinner = match.winner?.nickname === player?.nickname;

              return (
                <div
                  key={match.id || i}
                  className="card animate-slide-in"
                  style={{
                    padding: '14px 16px',
                    borderLeft: `4px solid ${isWinner ? 'var(--accent-success)' : 'var(--accent-danger)'}`,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
                      <span style={{ fontSize: '1.25rem' }}>{isWinner ? '🏆' : '💀'}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                          {match.room?.name || 'Unknown Room'}
                          <span
                            className={`badge ${isWinner ? 'badge-success' : 'badge-danger'}`}
                            style={{ marginLeft: 8, fontSize: '0.68rem' }}
                          >
                            {isWinner ? 'WIN' : 'LOSS'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {formatDate(match.ended_at)} · {formatDuration(match.duration_seconds)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
                      {[
                        { label: 'Score', value: myStats.score || 0, color: 'var(--accent-gold)' },
                        { label: 'Kills', value: myStats.kills || 0, color: 'var(--accent-danger)' },
                        { label: 'Deaths', value: myStats.deaths || 0, color: 'var(--text-muted)' },
                        { label: 'Rank', value: myStats.rank ? `#${myStats.rank}` : '-', color: 'var(--accent-primary)' },
                      ].map((s) => (
                        <div key={s.label} style={{ textAlign: 'center', minWidth: 38 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.color, fontSize: '0.95rem' }}>
                            {s.value}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {s.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
