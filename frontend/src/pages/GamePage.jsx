// src/pages/GamePage.jsx — Main game screen
import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import useAuthStore from '../store/authStore';
import useSocket from '../hooks/useSocket';
import GameCanvas from '../components/GameCanvas';
import MobileControls from '../components/MobileControls';
import toast from 'react-hot-toast';

export default function GamePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { player } = useAuthStore();
  const {
    matchStatus, myHp, myMaxHp, myScore, myKills, myAlive,
    myRespawning, myRespawnTimer, startTime, matchDuration,
    mapWidth, mapHeight, mapUrl, matchLeaderboard, killFeed, matchResults,
    players, currentRoom,
  } = useGameStore();

  const { joinRoom, leaveRoom, sendReady, sendMove, sendAttack } = useSocket();
  const hasJoined = useRef(false);
  const joystickRef = useRef({ dx: 0, dy: 0 });

  // Join room on mount
  useEffect(() => {
    if (!hasJoined.current && roomId) {
      hasJoined.current = true;
      const room = currentRoom;
      joinRoom(roomId, room?.code);
    }

    return () => {
      // Don't leave on re-render, only on unmount
    };
  }, [roomId]);

  // Handle match end
  useEffect(() => {
    if (matchStatus === 'finished') {
      // Show results after 2 seconds
      setTimeout(() => {
        navigate('/lobby');
      }, 8000);
    }
  }, [matchStatus]);

  // Timer logic
  const [timeLeft, setTimeLeft] = React.useState(0);
  useEffect(() => {
    if (matchStatus !== 'playing' || !startTime) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, matchDuration - (Date.now() - startTime));
      setTimeLeft(Math.floor(remaining / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [matchStatus, startTime, matchDuration]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleLeave = () => {
    leaveRoom();
    navigate('/lobby');
  };

  const hpPercent = myMaxHp > 0 ? (myHp / myMaxHp) * 100 : 100;
  const hpClass = hpPercent > 50 ? '' : hpPercent > 25 ? 'low' : 'critical';

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: 'var(--bg-primary)',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Top HUD ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'rgba(10,14,26,0.95)',
        borderBottom: '1px solid var(--border-color)',
        zIndex: 10, flexShrink: 0,
        flexWrap: 'wrap', gap: 8,
      }}>
        {/* Left: Brand + Back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="gradient-text" style={{ fontWeight: 800, fontSize: '1.1rem' }}>⚔️ ArenaBlast</span>
          <button className="btn btn-secondary btn-sm" onClick={handleLeave}>← Leave</button>
          <span style={{
            background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
            padding: '3px 10px', fontSize: '0.78rem',
            color: 'var(--accent-secondary)', fontFamily: 'var(--font-mono)', letterSpacing: 2,
          }}>
            {currentRoom?.code || '------'}
          </span>
        </div>

        {/* Center: HP bar + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          {/* Player avatar */}
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: player?.avatar_color || '#4A90D9',
            border: '2px solid rgba(255,255,255,0.3)',
          }} />
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 3 }}>
              {player?.nickname || 'You'} — HP
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="hp-bar-bg" style={{ width: 120 }}>
                <div className={`hp-bar-fill ${hpClass}`} style={{ width: `${hpPercent}%` }} />
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', minWidth: 36 }}>
                {myHp}/{myMaxHp}
              </span>
            </div>
          </div>

          {!myAlive && !myRespawning && (
            <span className="badge badge-danger animate-pulse">💀 Dead</span>
          )}
          {myRespawning && (
            <span className="badge badge-warning animate-pulse">⏳ {myRespawnTimer}s</span>
          )}
        </div>

        {/* Center: Match Timer */}
        {matchStatus === 'playing' && (
          <div style={{ flexShrink: 0, textAlign: 'center', margin: '0 20px' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--accent-danger)', textTransform: 'uppercase', fontWeight: 'bold' }}>Death Match</div>
            <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', fontWeight: 800, color: timeLeft <= 10 ? '#FF4757' : '#FFF' }}>
              {formatTime(timeLeft)}
            </div>
          </div>
        )}

        {/* Right: Score + Kills + Controls hint */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Score</div>
            <div className="score-display" style={{ fontSize: '1.1rem' }}>{myScore}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Kills</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: 'var(--accent-danger)', fontWeight: 700 }}>
              {myKills}
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            WASD/↑↓←→ Move<br />SPACE Attack
          </div>
        </div>
      </div>

      {/* ── Main Game Area ────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Game Canvas */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 8, overflow: 'hidden',
        }}>
          <GameCanvas
            onMove={sendMove}
            onAttack={sendAttack}
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            mapUrl={mapUrl}
            joystickRef={joystickRef}
          />
          <MobileControls joystickRef={joystickRef} onAttack={sendAttack} />
        </div>

        {/* Right Sidebar: Leaderboard */}
        <div className="game-sidebar" style={{
          width: 200, flexShrink: 0,
          background: 'rgba(10,14,26,0.95)',
          borderLeft: '1px solid var(--border-color)',
          padding: 12,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {/* In-match leaderboard */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
              🏆 Live Rankings
            </div>
            {(matchLeaderboard.length > 0 ? matchLeaderboard : players.slice().sort((a, b) => b.score - a.score))
              .map((p, i) => (
                <div key={p.nickname || i} className="leaderboard-entry">
                  <span className={`rank-${i + 1}`} style={{ fontWeight: 800, minWidth: 18, fontSize: '0.82rem' }}>
                    {i === 0 ? '👑' : `#${i + 1}`}
                  </span>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: p.color || '#4A90D9',
                  }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{
                      fontSize: '0.8rem', fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.nickname}
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent-gold)' }}>
                    {p.score}
                  </span>
                </div>
              ))}
            {players.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>
                No players yet
              </div>
            )}
          </div>

          {/* Kill feed */}
          {killFeed.length > 0 && (
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                ⚔️ Kill Feed
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {killFeed.map((k) => (
                  <div key={k.id} className="animate-slide-in" style={{
                    background: 'rgba(255,71,87,0.1)',
                    border: '1px solid rgba(255,71,87,0.2)',
                    borderRadius: 4, padding: '4px 8px',
                    fontSize: '0.72rem', lineHeight: 1.5,
                  }}>
                    <span style={{ color: 'var(--accent-danger)' }}>{k.killer}</span>
                    <span style={{ color: 'var(--text-muted)' }}> ⚔ </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{k.victim}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Waiting/Ready overlay ────────────────────────── */}
      {matchStatus === 'waiting' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <div className="card animate-fade-in" style={{ textAlign: 'center', padding: 48, maxWidth: 420 }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎮</div>
            <h2 style={{ marginBottom: 8 }}>Waiting for players...</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              Room code: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-secondary)', letterSpacing: 3 }}>
                {currentRoom?.code}
              </strong>
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 24 }}>
              Share this code with friends or click Ready to start solo!
            </p>
            <button id="btn-ready" className="btn btn-primary btn-lg btn-full animate-glow" onClick={sendReady}>
              ✅ Ready to Battle!
            </button>
          </div>
        </div>
      )}

      {/* ── Respawning overlay ────────────────────────── */}
      {matchStatus === 'playing' && myRespawning && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(255,0,0,0.15)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <h1 style={{ fontSize: '4rem', color: '#FF4757', textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>YOU DIED</h1>
          <p style={{ fontSize: '1.5rem', color: '#FFF', textShadow: '0 2px 10px rgba(0,0,0,0.8)', marginTop: 20 }}>
            Respawning in <span style={{ fontSize: '2rem', fontWeight: 800 }}>{myRespawnTimer}</span>...
          </p>
        </div>
      )}

      {/* ── Match Results overlay ────────────────────────── */}
      {matchStatus === 'finished' && matchResults && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          <div className="card animate-fade-in" style={{ textAlign: 'center', padding: 48, maxWidth: 500, width: '90%' }}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>🏆</div>
            <h2 style={{ marginBottom: 4 }}>Match Over!</h2>
            {matchResults.winner && (
              <p style={{ color: 'var(--accent-gold)', fontSize: '1.1rem', marginBottom: 20 }}>
                Winner: <strong>{matchResults.winner.nickname}</strong>
              </p>
            )}

            <div style={{ marginBottom: 24 }}>
              {(matchResults.results || []).map((r, i) => (
                <div key={r.playerId || i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: '1px solid var(--border-color)',
                  justifyContent: 'space-between',
                }}>
                  <span className={`rank-${r.rank}`} style={{ fontWeight: 800 }}>
                    {r.rank === 1 ? '👑' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{r.nickname}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>{r.score} pts</span>
                  <span style={{ color: 'var(--accent-danger)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{r.kills}K</span>
                </div>
              ))}
            </div>

            <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: '0.88rem' }}>
              Returning to lobby in 8 seconds...
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/lobby')}>
              🏠 Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
