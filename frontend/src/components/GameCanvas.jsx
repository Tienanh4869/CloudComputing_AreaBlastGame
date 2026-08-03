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
  const { roomId, mapTheme, particles, players, matchStatus } = useGameStore(s => ({
    roomId: s.roomId,
    mapTheme: s.mapTheme,
    particles: s.particles,
    players: s.players,
    matchStatus: s.matchStatus,
  }));
  const playerSocketId = useGameStore((s) => s.mySocketId);
  const { player: myProfile } = useAuthStore();

  // No longer fetching mapTheme from Blob Storage on frontend.
  // We use mapTheme received from backend via socket.

  // Subscribe to game state directly for rendering
  const getState = () => useGameStore.getState();

  // ── Input Handling & Continuous Steering ───────────────────
  const headingRef = useRef({ dx: 1, dy: 0 }); // Continuous gliding heading
  const mousePosRef = useRef({ x: 0, y: 0, active: false });
  const lastMoveRef = useRef({ dx: 0, dy: 0, lastSent: 0 });

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

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const worldX = (e.clientX - rect.left) * scaleX;
    const worldY = (e.clientY - rect.top) * scaleY;
    mousePosRef.current = { x: worldX, y: worldY, active: true };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mousePosRef.current.active = false;
  }, []);

  const handleCanvasClick = useCallback((e) => {
    if (e.button === 0) { // Left click
      onAttack?.();
    }
  }, [onAttack]);

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
      let dx = 0, dy = 0;
      let hasActiveSteer = false;

      // 1. Keyboard WASD / Arrows
      if (keys.has('KeyW') || keys.has('ArrowUp'))    dy -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown'))  dy += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft'))  dx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;

      if (keys.size > 0 && (dx !== 0 || dy !== 0)) {
        hasActiveSteer = true;
        const len = Math.hypot(dx, dy);
        if (len > 0) { dx /= len; dy /= len; }
        headingRef.current = { dx, dy };
      } else if (joystickRef && joystickRef.current && (Math.abs(joystickRef.current.dx) > 0.05 || Math.abs(joystickRef.current.dy) > 0.05)) {
        // 2. Mobile Touch Joystick steering
        hasActiveSteer = true;
        dx = joystickRef.current.dx;
        dy = joystickRef.current.dy;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          headingRef.current = { dx: dx / len, dy: dy / len };
        }
      } else if (mousePosRef.current.active) {
        // 3. Laptop Mouse steering (steer toward cursor)
        const myPlayer = getState().players.find(p => p.socketId === playerSocketId);
        if (myPlayer) {
          const mdx = mousePosRef.current.x - myPlayer.x;
          const mdy = mousePosRef.current.y - myPlayer.y;
          const dist = Math.hypot(mdx, mdy);
          if (dist > 30) {
            hasActiveSteer = true;
            dx = mdx / dist;
            dy = mdy / dist;
            headingRef.current = { dx, dy };
          }
        }
      }

      // 4. Continuous auto-glide navigation: keep moving in heading direction
      if (!hasActiveSteer && (headingRef.current.dx !== 0 || headingRef.current.dy !== 0)) {
        dx = headingRef.current.dx;
        dy = headingRef.current.dy;
      }

      const now = performance.now();
      const moved = Math.abs(dx - lastMoveRef.current.dx) > 0.02 || Math.abs(dy - lastMoveRef.current.dy) > 0.02;
      const isMoving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
      const shouldResend = isMoving && (now - lastMoveRef.current.lastSent > 120);

      // Send movement heading to server
      if (moved || shouldResend) {
        lastMoveRef.current = { dx, dy, lastSent: now };
        onMove?.(dx, dy);
      }

      // Render frame
      render(ctx, canvas);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [onMove, playerSocketId, joystickRef]);

  // ── Rendering ─────────────────────────────────────────────

  function render(ctx, canvas) {
    const { players, particles, mySocketId, mapTheme } = getState();
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

    // Draw bushes
    if (mapTheme?.bushes) {
      ctx.fillStyle = mapTheme.bushColor || 'rgba(100, 255, 100, 0.4)';
      ctx.strokeStyle = mapTheme.bushBorder || 'rgba(50, 200, 50, 0.6)';
      ctx.lineWidth = 2;
      for (const bush of mapTheme.bushes) {
        ctx.beginPath();
        ctx.rect(bush.x, bush.y, bush.w, bush.h);
        ctx.fill();
        ctx.stroke();
        
        // Add some leaf-like details
        ctx.save();
        ctx.clip();
        ctx.fillStyle = mapTheme.bushBorder || 'rgba(50, 200, 50, 0.6)';
        for (let i = 0; i < bush.w; i += 30) {
          for (let j = 0; j < bush.h; j += 30) {
            ctx.beginPath();
            ctx.arc(bush.x + i + 15, bush.y + j + 15, 8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    // Draw safe zone
    const safeZone = getState().safeZone;
    if (safeZone) {
      // Draw outer poison area
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H); // Full screen
      ctx.arc(safeZone.x, safeZone.y, safeZone.radius, 0, Math.PI * 2, true); // Hole
      ctx.fillStyle = 'rgba(80, 0, 150, 0.4)'; // Darker purple poison
      ctx.fill();
      
      // Draw safe zone border
      ctx.beginPath();
      ctx.arc(safeZone.x, safeZone.y, safeZone.radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#ff00ff';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.restore();
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

    if (!player.alive || player.respawning) {
      // Draw ghost/dead/respawning indicator
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
    
    // If player is in bush, make them transparent
    if (player.inBushId !== null) {
      ctx.globalAlpha = 0.6;
    }

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
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleCanvasClick}
      style={{
        display: 'block',
        borderRadius: 8,
        cursor: 'crosshair',
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        touchAction: 'none',
      }}
      tabIndex={0}
    />
  );
}
