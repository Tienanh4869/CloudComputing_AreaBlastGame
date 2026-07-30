// src/components/GameCanvas.jsx — Canvas 2D game renderer
import { useEffect, useRef, useCallback, useState } from 'react';
import useGameStore from '../store/gameStore';
import useAuthStore from '../store/authStore';

// ── Renderer constants ────────────────────────────────────────
const PLAYER_RADIUS = 16;
const PARTICLE_RADIUS = 8;
const HP_BAR_W = 40;
const HP_BAR_H = 5;

// Image cache for custom avatars/weapons
const imageCache = new Map();
function getImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.src = url;
  imageCache.set(url, img);
  return img;
}

export default function GameCanvas({ onMove, onAttack, mapWidth, mapHeight, mapUrl, joystickRef }) {
  const canvasRef = useRef(null);
  const keysRef = useRef(new Set());
  const frameRef = useRef(null);
  const [mapTheme, setMapTheme] = useState(null);
  const playerSocketId = useGameStore((s) => s.mySocketId);
  const { player: myProfile } = useAuthStore();

  // Fetch map JSON from Blob Storage
  useEffect(() => {
    if (mapUrl) {
      // Add timestamp to bypass browser cache
      fetch(`${mapUrl}?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => setMapTheme(data.theme))
        .catch(err => console.error('Failed to load map:', err));
    }
  }, [mapUrl]);

  // Subscribe to game state directly for rendering
  const getState = () => useGameStore.getState();

  // ── Input Handling ─────────────────────────────────────────

  const handleKeyDown = useCallback((e) => {
    keysRef.current.add(e.code);
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      onAttack?.();
    }
  }, [onAttack]);

  const handleKeyUp = useCallback((e) => {
    keysRef.current.delete(e.code);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // ── Game Loop (client-side: read input, render) ────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const loop = () => {
      const keys = keysRef.current;
      // WASD or Arrow keys
      let dx = 0, dy = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp'))    dy -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown'))  dy += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft'))  dx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;

      // Merge with Joystick input
      if (joystickRef && joystickRef.current) {
        if (joystickRef.current.dx !== 0 || joystickRef.current.dy !== 0) {
          dx = joystickRef.current.dx;
          dy = joystickRef.current.dy;
        }
      }

      if (dx !== 0 || dy !== 0) onMove?.(dx, dy);

      // Render frame
      render(ctx, canvas);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [onMove, playerSocketId]);

  // ── Rendering ─────────────────────────────────────────────

  function render(ctx, canvas) {
    const { players, particles, mySocketId } = getState();
    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.fillStyle = mapTheme?.background || '#0d1520';
    ctx.fillRect(0, 0, W, H);

    // Grid pattern
    ctx.strokeStyle = mapTheme?.gridColor || 'rgba(108,99,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Map border glow
    ctx.strokeStyle = mapTheme?.borderGlow || 'rgba(108,99,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Draw obstacles (cover/walls)
    if (mapTheme?.obstacles) {
      ctx.fillStyle = mapTheme.obstacleColor || 'rgba(100, 100, 100, 0.5)';
      ctx.strokeStyle = mapTheme.obstacleBorder || 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      for (const obs of mapTheme.obstacles) {
        ctx.beginPath();
        ctx.rect(obs.x, obs.y, obs.w, obs.h);
        ctx.fill();
        ctx.stroke();
        
        // Diagonal hatch pattern for cover illusion
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        for (let i = -obs.h; i < obs.w + obs.h; i += 15) {
          ctx.beginPath();
          ctx.moveTo(obs.x + i, obs.y);
          ctx.lineTo(obs.x + i - obs.h, obs.y + obs.h);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Draw particles (collectible dots)
    for (const p of particles) {
      const t = Date.now() / 600;
      const pulse = 1 + 0.2 * Math.sin(t + p.x);

      const color = mapTheme?.particleColor || p.color || '#FFD700';

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PARTICLE_RADIUS * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw players
    for (const player of players) {
      drawPlayer(ctx, player, player.socketId === mySocketId);
    }

    // Draw slashes
    for (const slash of getState().slashes) {
      drawSlash(ctx, slash);
    }
  }

  function drawSlash(ctx, slash) {
    const age = Date.now() - slash.createdAt;
    if (age > 200) return;

    const progress = age / 200; // 0 to 1
    const angle = Math.atan2(slash.facingY || 0, slash.facingX || 1);
    
    ctx.save();
    ctx.translate(slash.x, slash.y);
    ctx.rotate(angle);
    
    // Scale visual slash based on attacker's radius (fallback to 16)
    const attackerRadius = slash.radius || 16;
    const baseVisualRadius = attackerRadius * 1.5; 
    const radius = baseVisualRadius + progress * attackerRadius;
    
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI/2, Math.PI/2, false);
    
    ctx.lineWidth = 5 * (1 - progress);
    ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#fff';
    ctx.stroke();

    ctx.restore();
  }

  function drawPlayer(ctx, player, isMe) {
    const radius = player.radius || PLAYER_RADIUS;

    if (!player.alive) {
      // Draw ghost/dead indicator
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = player.color || '#888';
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();

    // Glow for current player
    if (isMe) {
      ctx.shadowColor = player.color || '#4A90D9';
      ctx.shadowBlur = 20;
    }

    const avatarImg = getImage(player.avatarUrl);
    if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatarImg, player.x - radius, player.y - radius, radius * 2, radius * 2);
      ctx.restore();

      ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = isMe ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Fallback Player body
      ctx.fillStyle = player.color || '#4A90D9';
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner circle (pupil / design)
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(player.x - radius * 0.25, player.y - radius * 0.25, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = isMe ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Draw Weapon with swing animation
    const weaponImg = getImage(player.weaponUrl);
    if (weaponImg && weaponImg.complete && weaponImg.naturalWidth > 0) {
      // Calculate swing animation based on recent slash
      const recentSlash = getState().slashes.find(s => s.attackerSocketId === player.socketId);
      let swingAngle = 0;
      if (recentSlash) {
        const age = Date.now() - recentSlash.createdAt;
        if (age < 200) {
          const progress = age / 200; // 0 to 1
          // Swing from -60 degrees to +60 degrees
          swingAngle = (progress * Math.PI) - (Math.PI / 2);
        }
      }

      const angle = Math.atan2(player.facingY || 0, player.facingX || 1) + swingAngle;
      
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(angle);
      
      // Weapon scales with player radius
      const weaponSize = radius * 1.5;
      ctx.drawImage(weaponImg, radius - 4, -weaponSize / 2, weaponSize, weaponSize);
      ctx.restore();
    }

    // HP bar
    const hpRatio = player.hp / player.maxHp;
    const barX = player.x - HP_BAR_W / 2;
    const barY = player.y - radius - 12;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, barX, barY, HP_BAR_W, HP_BAR_H, 3);
    ctx.fill();

    ctx.fillStyle = hpRatio > 0.5 ? '#2ED573' : hpRatio > 0.25 ? '#FFA502' : '#FF4757';
    roundRect(ctx, barX, barY, HP_BAR_W * hpRatio, HP_BAR_H, 3);
    ctx.fill();

    // Nickname
    ctx.save();
    ctx.font = `bold 11px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = isMe ? '#fff' : 'rgba(255,255,255,0.85)';
    ctx.fillText(
      (player.nickname?.length > 10 ? player.nickname.slice(0, 10) + '…' : player.nickname) || '?',
      player.x,
      player.y - radius - 16
    );
    // Score badge
    ctx.font = `11px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`${player.score}`, player.x, player.y + radius + 15);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  return (
    <canvas
      ref={canvasRef}
      width={mapWidth || 1200}
      height={mapHeight || 800}
      style={{
        display: 'block',
        borderRadius: 8,
        cursor: 'crosshair',
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
      }}
      tabIndex={0}
    />
  );
}
