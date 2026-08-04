// src/components/GameCanvas.jsx — High-Performance Canvas 2D Game Renderer (Mobile & Desktop 60FPS)
import { useEffect, useRef, useCallback } from 'react';
import useGameStore from '../store/gameStore';

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

export default function GameCanvas({ onMove, onAttack, mapWidth, mapHeight, joystickRef }) {
  const canvasRef = useRef(null);
  const keysRef = useRef(new Set());
  const frameRef = useRef(null);
  const renderPlayersRef = useRef(new Map());

  // Subscribe to game state directly for rendering without triggering React re-renders
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

  // ── Game Loop (client-side: read input, render 60 FPS) ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use alpha: false or desynchronized for highest mobile 2D performance
    const ctx = canvas.getContext('2d', { alpha: false });

    const loop = () => {
      const state = getState();
      const myId = state.mySocketId;
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
        const myPlayer = state.players.find(p => p.socketId === myId);
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
      render(ctx, canvas, state);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [onMove, joystickRef]);

  // ── High Performance Optimized Rendering ──────────────────

  function render(ctx, canvas, state) {
    const { players = [], particles = [], mySocketId, mapTheme, safeZone, slashes = [] } = state;
    
    // --- LERP PLAYERS TO PREVENT JITTER ---
    const renderPlayers = renderPlayersRef.current;
    const currentIds = new Set(players.map(p => p.socketId));
    for (const id of renderPlayers.keys()) {
      if (!currentIds.has(id)) renderPlayers.delete(id);
    }
    
    const lerpedPlayers = [];
    for (let i = 0; i < players.length; i++) {
      const pl = players[i];
      let rPlayer = renderPlayers.get(pl.socketId);
      if (!rPlayer) {
        rPlayer = { x: pl.x, y: pl.y };
        renderPlayers.set(pl.socketId, rPlayer);
      } else {
        const distSq = (pl.x - rPlayer.x)**2 + (pl.y - rPlayer.y)**2;
        if (distSq > 150000) { 
           rPlayer.x = pl.x;
           rPlayer.y = pl.y;
        } else {
           rPlayer.x += (pl.x - rPlayer.x) * 0.25; 
           rPlayer.y += (pl.y - rPlayer.y) * 0.25;
        }
      }
      lerpedPlayers.push({ ...pl, x: rPlayer.x, y: rPlayer.y });
    }
    // ---------------------------------------

    const W = canvas.width;
    const H = canvas.height;

    // 1. Background
    ctx.fillStyle = mapTheme?.background || '#0d1520';
    ctx.fillRect(0, 0, W, H);

    // 2. Grid pattern (Fast batch stroke)
    ctx.strokeStyle = mapTheme?.gridColor || 'rgba(108,99,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 50) {
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let y = 0; y < H; y += 50) {
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();

    // 3. Map border
    ctx.strokeStyle = mapTheme?.borderGlow || 'rgba(108,99,255,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, W - 4, H - 4);

    // 4. Obstacles (Walls / Cover) - Fast Direct Geometry
    if (mapTheme?.obstacles && mapTheme.obstacles.length > 0) {
      ctx.fillStyle = mapTheme.obstacleColor || 'rgba(70, 80, 100, 0.7)';
      ctx.strokeStyle = mapTheme.obstacleBorder || 'rgba(150, 170, 210, 0.8)';
      ctx.lineWidth = 2;
      for (let i = 0; i < mapTheme.obstacles.length; i++) {
        const obs = mapTheme.obstacles[i];
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      }
    }

    // 5. Bushes (Hiding zones)
    if (mapTheme?.bushes && mapTheme.bushes.length > 0) {
      ctx.fillStyle = mapTheme.bushColor || 'rgba(46, 213, 115, 0.35)';
      ctx.strokeStyle = mapTheme.bushBorder || 'rgba(46, 213, 115, 0.6)';
      ctx.lineWidth = 2;
      for (let i = 0; i < mapTheme.bushes.length; i++) {
        const bush = mapTheme.bushes[i];
        ctx.beginPath();
        roundRectPath(ctx, bush.x, bush.y, bush.w, bush.h, 8);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 6. Safe zone (Poison storm)
    if (safeZone) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(safeZone.x, safeZone.y, Math.max(0, safeZone.radius), 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(120, 20, 200, 0.35)';
      ctx.fill();

      // Safe zone double-ring border (Zero lag alternative to shadowBlur)
      ctx.beginPath();
      ctx.arc(safeZone.x, safeZone.y, Math.max(0, safeZone.radius), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 0, 255, 0.3)';
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(safeZone.x, safeZone.y, Math.max(0, safeZone.radius), 0, Math.PI * 2);
      ctx.strokeStyle = '#FF00FF';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // 7. Particles (Collectible Dots) - Highly Optimized Batch Loop
    if (particles.length > 0) {
      const t = Date.now() / 700;
      const defaultColor = mapTheme?.particleColor || '#FFD700';

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const pulse = 1 + 0.15 * Math.sin(t + p.x * 0.1);
        const r = PARTICLE_RADIUS * pulse;
        const color = p.color || defaultColor;

        // Outer soft glow halo
        ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright core
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 8. Players
    for (let i = 0; i < lerpedPlayers.length; i++) {
      drawPlayer(ctx, lerpedPlayers[i], lerpedPlayers[i].socketId === mySocketId, slashes);
    }

    // 9. Slashes (Attack Animations)
    if (slashes.length > 0) {
      const now = Date.now();
      for (let i = 0; i < slashes.length; i++) {
        const slash = slashes[i];
        const age = now - slash.createdAt;
        if (age <= 220) {
          drawSlash(ctx, slash, age);
        }
      }
    }
  }

  function drawSlash(ctx, slash, age) {
    const progress = age / 220; // 0 to 1
    const angle = Math.atan2(slash.facingY || 0, slash.facingX || 1);
    const attackerRadius = slash.radius || 16;
    const radius = attackerRadius * 1.4 + progress * attackerRadius;
    const alpha = Math.max(0, 1 - progress);

    ctx.save();
    ctx.translate(slash.x, slash.y);
    ctx.rotate(angle);

    // Outer glow blade
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2.2, Math.PI / 2.2, false);
    ctx.lineWidth = 8 * alpha;
    ctx.strokeStyle = `rgba(255, 100, 100, ${alpha * 0.4})`;
    ctx.stroke();

    // Sharp cutting edge
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2.2, Math.PI / 2.2, false);
    ctx.lineWidth = 3 * alpha;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.stroke();

    ctx.restore();
  }

  function drawPlayer(ctx, player, isMe, slashes) {
    const radius = player.radius || PLAYER_RADIUS;

    if (!player.alive || player.respawning) {
      // Ghost / Respawning indicator
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = player.color || '#888';
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    if (player.inBushId !== null && player.inBushId !== undefined) {
      ctx.globalAlpha = 0.5;
    }

    // Outer self aura
    if (isMe) {
      ctx.fillStyle = 'rgba(108, 99, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius + 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Avatar Image or Vector Circle
    const avatarImg = getImage(player.avatarUrl);
    if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatarImg, player.x - radius, player.y - radius, radius * 2, radius * 2);
      ctx.restore();

      ctx.strokeStyle = isMe ? '#FFFFFF' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isMe ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = player.color || '#4A90D9';
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Eye / Pupil
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(player.x - radius * 0.25, player.y - radius * 0.25, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = isMe ? '#FFFFFF' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isMe ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Weapon
    const weaponImg = getImage(player.weaponUrl);
    if (weaponImg && weaponImg.complete && weaponImg.naturalWidth > 0) {
      const recentSlash = slashes?.find(s => s.attackerSocketId === player.socketId);
      let swingAngle = 0;
      if (recentSlash) {
        const age = Date.now() - recentSlash.createdAt;
        if (age < 220) {
          const progress = age / 220;
          swingAngle = (progress * Math.PI) - (Math.PI / 2);
        }
      }

      const angle = Math.atan2(player.facingY || 0, player.facingX || 1) + swingAngle;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(angle);
      const weaponSize = radius * 1.5;
      ctx.drawImage(weaponImg, radius - 4, -weaponSize / 2, weaponSize, weaponSize);
      ctx.restore();
    }

    // XP Bar
    const xpRatio = Math.max(0, Math.min(1, (player.xp || 0) / (player.maxXp || 10)));
    const barX = player.x - HP_BAR_W / 2;
    const barY = player.y - radius - 12;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX, barY, HP_BAR_W, HP_BAR_H);

    ctx.fillStyle = '#00d2ff'; // XP Color
    ctx.fillRect(barX, barY, HP_BAR_W * xpRatio, HP_BAR_H);

    // Player Nickname
    ctx.font = `bold 11px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#FFFFFF' : '#DDDDDD';
    ctx.fillText(
      (player.nickname?.length > 10 ? player.nickname.slice(0, 10) + '…' : player.nickname) || '?',
      player.x,
      player.y - radius - 16
    );

    // Player Level
    ctx.font = `bold 12px sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Lv ${player.level || 1}`, player.x, player.y + radius + 16);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
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
