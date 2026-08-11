// src/pages/GamePage.jsx — Main game screen with responsive HUD and mobile support
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';
import useAuthStore from '../store/authStore';
import useSocket from '../hooks/useSocket';
import GameCanvas from '../components/GameCanvas';
import MobileControls from '../components/MobileControls';

function samePlayerRoster(previous = [], next = []) {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;

  return previous.every((player, index) => {
    const other = next[index];

    return (
      player.socketId === other.socketId &&
      player.nickname === other.nickname &&
      player.color === other.color
    );
  });
}

export default function GamePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { player } = useAuthStore();
  const matchStatus = useGameStore((s) => s.matchStatus);
  const matchCountdown = useGameStore((s) => s.matchCountdown);
  const myLevel = useGameStore((s) => s.myLevel);
  const myXp = useGameStore((s) => s.myXp);
  const myMaxXp = useGameStore((s) => s.myMaxXp);
  const myScore = useGameStore((s) => s.myScore);
  const myKills = useGameStore((s) => s.myKills);
  const myAlive = useGameStore((s) => s.myAlive);
  const myRespawning = useGameStore((s) => s.myRespawning);
  const myRespawnTimer = useGameStore((s) => s.myRespawnTimer);
  const startTime = useGameStore((s) => s.startTime);
  const matchDuration = useGameStore((s) => s.matchDuration);
  const timeLeft = useGameStore((s) => s.timeLeft);
  const mapWidth = useGameStore((s) => s.mapWidth);
  const mapHeight = useGameStore((s) => s.mapHeight);
  const mapUrl = useGameStore((s) => s.mapUrl);
  const matchLeaderboard = useGameStore((s) => s.matchLeaderboard);
  const killFeed = useGameStore((s) => s.killFeed);
  const matchResults = useGameStore((s) => s.matchResults);
  const players = useGameStore(
    (state) => state.players,
    samePlayerRoster
  );
  const currentRoom = useGameStore((s) => s.currentRoom);
  const isHost = useGameStore((s) => s.isHost);

  const { joinRoom, leaveRoom, sendReady, sendMove, sendAttack } = useSocket();
  const hasJoined = useRef(false);
  const joystickRef = useRef({ dx: 0, dy: 0 });
  const [showMobileRankings, setShowMobileRankings] = useState(false);

  // Join room on mount
  useEffect(() => {
    if (!hasJoined.current && roomId) {
      hasJoined.current = true;
      const room = currentRoom;
      joinRoom(roomId, room?.code);
    }
  }, [roomId, currentRoom, joinRoom]);

  // Handle match end
  useEffect(() => {
    if (matchStatus === 'finished') {
      const timeout = setTimeout(() => {
        navigate('/lobby');
      }, 8000);
      return () => clearTimeout(timeout);
    }
  }, [matchStatus, navigate]);

  // Timer logic
  // (Now automatically synced with Server's state via game_state updates)

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleLeave = () => {
    leaveRoom();
    navigate('/lobby');
  };

  const xpPercent = myMaxXp > 0 ? (myXp / myMaxXp) * 100 : 0;

  const liveRankings = matchLeaderboard;

  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      try {
        if (window.screen?.orientation?.lock) {
          window.screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (_) {}
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    }}>

      {/* ── Top HUD ─────────────────────────────────────────── */}
      <div className="game-top-hud" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'rgba(10, 14, 26, 0.95)',
        borderBottom: '1px solid var(--border-color)',
        zIndex: 10,
        flexShrink: 0,
        gap: 8,
        minHeight: 52,
      }}>
        {/* Left: Brand + Leave + Code */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleLeave} style={{ padding: '4px 8px' }}>
            ← Leave
          </button>
          <span
            style={{
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-sm)',
              padding: '3px 8px',
              fontSize: '0.75rem',
              color: 'var(--accent-secondary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: 1,
              fontWeight: 700,
            }}
          >
            {currentRoom?.name ? `${currentRoom.name} (${currentRoom.code})` : currentRoom?.code || '------'}
          </span>
        </div>

        {/* Center: HP bar + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Player avatar */}
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: player?.avatar_color || '#4A90D9',
              border: '2px solid rgba(255,255,255,0.4)',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
                Lv {myLevel}
              </div>
              <div className="hp-bar-bg" style={{ width: 'clamp(70px, 15vw, 120px)', background: 'rgba(0,0,0,0.5)' }}>
                <div style={{ width: `${xpPercent}%`, height: '100%', background: 'linear-gradient(90deg, #4A90D9, #00d2ff)', borderRadius: 2 }} />
              </div>
            </div>
          </div>

          {!myAlive && !myRespawning && (
            <span className="badge badge-danger animate-pulse" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
              💀
            </span>
          )}
          {myRespawning && (
            <span className="badge badge-warning animate-pulse" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
              ⏳ {myRespawnTimer}s
            </span>
          )}
        </div>

        {/* Center: Match Timer */}
        {matchStatus === 'playing' && (
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <div
              style={{
                fontSize: '1.15rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: timeLeft <= 10 ? '#FF4757' : '#FFF',
              }}
            >
              {formatTime(timeLeft)}
            </div>
          </div>
        )}

        {/* Right: Score + Kills + Ranking + Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pts</div>
            <div className="score-display" style={{ fontSize: '0.95rem' }}>{myScore}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Kills</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--accent-danger)', fontWeight: 700 }}>
              {myKills}
            </div>
          </div>

          {/* Mobile Rankings Toggle Button */}
          <button
            className="btn btn-secondary btn-sm mobile-only"
            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
            onClick={() => setShowMobileRankings((v) => !v)}
            aria-label="Toggle Rankings"
          >
            🏆
          </button>

          {/* Fullscreen / Landscape Mode Toggle Button */}
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 8px', fontSize: '0.82rem' }}
            onClick={toggleFullscreen}
            title="Toàn màn hình / Xoay ngang"
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? '✕' : '⛶'}
          </button>

          {/* Desktop Controls Hint */}
          <div className="desktop-only" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
            WASD / Mouse<br />SPACE / Click
          </div>
        </div>
      </div>

      {/* ── Main Game Area ────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Game Canvas */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
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

        {/* Right Sidebar: Leaderboard (Desktop) */}
        <div className="game-sidebar desktop-only" style={{
          width: 190,
          flexShrink: 0,
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
            {liveRankings.map((p, i) => (
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

      {/* ── Mobile Live Rankings Sheet ─────────────────────── */}
      {showMobileRankings && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 160,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={() => setShowMobileRankings(false)}
        >
          <div
            className="animate-slide-in"
            style={{
              width: '100%',
              maxHeight: '65vh',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border-color)',
              borderRadius: '16px 16px 0 0',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 -8px 30px rgba(0,0,0,0.7)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>🏆 Live Rankings</h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowMobileRankings(false)}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {liveRankings.map((p, i) => (
                <div
                  key={p.nickname || i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 800, width: 22 }}>
                      {i === 0 ? '👑' : `#${i + 1}`}
                    </span>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: p.color || '#4A90D9' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.nickname}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-gold)' }}>
                    {p.score} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Waiting/Ready overlay ────────────────────────── */}
      {matchStatus === 'waiting' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(10,14,26,0.95)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          padding: 16,
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: 'min(94vw, 560px)',
            maxHeight: '90vh',
            background: 'var(--bg-card)',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            border: '1px solid var(--border-color)',
            padding: '24px 20px',
          }}>
            <h2 style={{ marginBottom: 4, fontSize: '1.6rem', textAlign: 'center' }}>
              {currentRoom?.name || 'Game Room'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, textAlign: 'center', fontSize: '0.9rem' }}>
              Room Code: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-secondary)', letterSpacing: 2 }}>{currentRoom?.code}</strong>
              {isHost && <span className="badge badge-warning" style={{ marginLeft: 8 }}>👑 Host</span>}
            </p>
            
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: 18, maxHeight: '40vh' }}>
              <h4 style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.75rem', marginBottom: 10 }}>
                Players ({players.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {players.map((p, i) => (
                  <div key={p.socketId} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '10px 14px',
                    borderRadius: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: p.color || '#fff' }} />
                      <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{p.nickname}</span>
                      {i === 0 && <span style={{ fontSize: '0.8rem' }}>👑</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary"
                onClick={handleLeave}
                style={{ flex: 1, padding: 14 }}
                disabled={matchCountdown > 0}
              >
                Leave
              </button>
              {matchCountdown > 0 ? (
                <button className="btn" disabled style={{ flex: 2, padding: 14, opacity: 1, background: 'var(--accent-primary)', color: '#fff' }}>
                  Starts in {matchCountdown}...
                </button>
              ) : isHost ? (
                <button
                  className="btn btn-primary"
                  onClick={sendReady}
                  style={{ flex: 2, padding: 14, background: 'var(--accent-danger)', fontWeight: 800 }}
                >
                  🔥 START MATCH
                </button>
              ) : (
                <button className="btn btn-secondary" disabled style={{ flex: 2, padding: 14, opacity: 0.5 }}>
                  Waiting for Host...
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Respawning overlay ────────────────────────── */}
      {matchStatus === 'playing' && myRespawning && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          background: 'rgba(255,0,0,0.2)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)', color: '#FF4757', textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
            YOU DIED
          </h1>
          <p style={{ fontSize: '1.2rem', color: '#FFF', textShadow: '0 2px 10px rgba(0,0,0,0.8)', marginTop: 14 }}>
            Respawning in <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{myRespawnTimer}</span>...
          </p>
        </div>
      )}

      {/* ── Match Results overlay ────────────────────────── */}
      {matchStatus === 'finished' && matchResults && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 150,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          padding: 16,
        }}>
          <div
            className="card animate-fade-in"
            style={{
              textAlign: 'center',
              padding: '28px 20px',
              maxWidth: 480,
              width: 'min(94vw, 480px)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: '2.8rem', marginBottom: 4 }}>🏆</div>
            <h2 style={{ marginBottom: 4 }}>Match Over!</h2>
            {matchResults.winner && (
              <p style={{ color: 'var(--accent-gold)', fontSize: '1.05rem', marginBottom: 16 }}>
                Winner: <strong>{matchResults.winner.nickname}</strong>
              </p>
            )}

            <div style={{ marginBottom: 20 }}>
              {(matchResults.results || []).map((r, i) => (
                <div key={r.playerId || i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-color)',
                  justifyContent: 'space-between',
                  fontSize: '0.9rem',
                }}>
                  <span className={`rank-${r.rank}`} style={{ fontWeight: 800 }}>
                    {r.rank === 1 ? '👑' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.nickname}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>{r.score} pts</span>
                  <span style={{ color: 'var(--accent-danger)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{r.kills}K</span>
                </div>
              ))}
            </div>

            <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.82rem' }}>
              Returning to lobby in 8 seconds...
            </p>
            <button className="btn btn-primary btn-full" onClick={() => navigate('/lobby')}>
              🏠 Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
