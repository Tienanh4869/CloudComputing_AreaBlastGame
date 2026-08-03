// src/components/GameCanvas.jsx — Camera-based Canvas 2D Renderer for large EvoWars.io-style maps
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
  const headingRef = useRef({ dx: 1, dy: 0 });
  const mousePosRef = useRef({ x: 0, y: 0, active: false });
  const lastMoveRef = useRef({ dx: 0, dy: 0, lastSent: 0 });
  const cameraRef = useRef({ x: 0, y: 0 });

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
    // Store screen-space mouse position (relative to canvas element)
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      active: true,
      canvasW: rect.width,
      canvasH: rect.height,
    };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mousePosRef.current.active = false;
  }, []);

  const handleCanvasClick = useCallback((e) => {
    if (e.button === 0) {
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

  // ── Resize canvas to fill container ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  // ── Game Loop ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
        // 3. Laptop Mouse steering (steer toward cursor position in screen space)
        const cW = mousePosRef.current.canvasW || canvas.clientWidth;
        const cH = mousePosRef.current.canvasH || canvas.clientHeight;
        const centerX = cW / 2;
        const centerY = cH / 2;
        const mdx = mousePosRef.current.x - centerX;
        const mdy = mousePosRef.current.y - centerY;
        const dist = Math.hypot(mdx, mdy);
        if (dist > 25) {
          hasActiveSteer = true;
          dx = mdx / dist;
          dy = mdy / dist;
          headingRef.current = { dx, dy };
        }
      }

      // 4. Continuous auto-glide navigation
      if (!hasActiveSteer && (headingRef.current.dx !== 0 || headingRef.current.dy !== 0)) {
        dx = headingRef.current.dx;
        dy = headingRef.current.dy;
      }

      const now = performance.now();
      const moved = Math.abs(dx - lastMoveRef.current.dx) > 0.02 || Math.abs(dy - lastMoveRef.current.dy) > 0.02;
      const isMoving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
      const shouldResend = isMoving && (now - lastMoveRef.current.lastSent > 120);

      if (moved || shouldResend) {
        lastMoveRef.current = { dx, dy, lastSent: now };
        onMove?.(dx, dy);
      }

      // Render frame with camera
      render(ctx, canvas, state);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [onMove, joystickRef]);

  // ── Camera-based Renderer ─────────────────────────────────

  function render(ctx, canvas, state) {
    const { players = [], particles = [], mySocketId, mapTheme, safeZone, slashes = [] } = state;
    
    // --- LERP PLAYERS TO PREVENT JITTER ---
    const renderPlayers = renderPlayersRef.current;
    const currentIds = new Set(players.map(p => p.socketId));
    for (const id of renderPlayers.keys()) {
      if (!currentIds.has(id)) renderPlayers.delete(id);
    }
    
    const lerpedPlayers = [];
    let me = null;
    
    for (let i = 0; i < players.length; i++) {
      const pl = players[i];
      let rPlayer = renderPlayers.get(pl.socketId);
      if (!rPlayer) {
        rPlayer = { x: pl.x, y: pl.y };
        renderPlayers.set(pl.socketId, rPlayer);
      } else {
        // If distance is huge (e.g., respawn or map teleport), snap instantly
        const distSq = (pl.x - rPlayer.x)**2 + (pl.y - rPlayer.y)**2;
        if (distSq > 150000) { 
           rPlayer.x = pl.x;
           rPlayer.y = pl.y;
        } else {
           rPlayer.x += (pl.x - rPlayer.x) * 0.25; // 25% smooth lerp per frame
           rPlayer.y += (pl.y - rPlayer.y) * 0.25;
        }
      }
      
      const lerpedPl = { ...pl, x: rPlayer.x, y: rPlayer.y };
      lerpedPlayers.push(lerpedPl);
      
      if (lerpedPl.socketId === mySocketId) {
        me = lerpedPl;
      }
    }
    // ---------------------------------------

    const W = canvas.width;
    const H = canvas.height;
    const MW = mapWidth || 3000;
    const MH = mapHeight || 3000;
    const dpr = W / (canvas.clientWidth || W);

    // Camera: center on player
    let targetCamX = 0, targetCamY = 0;
    if (me) {
      targetCamX = me.x - W / (2 * dpr);
      targetCamY = me.y - H / (2 * dpr);
    }
    // Smooth camera with fast lerp + integer snap to prevent sub-pixel jitter
    cameraRef.current.x += (targetCamX - cameraRef.current.x) * 0.28;
    cameraRef.current.y += (targetCamY - cameraRef.current.y) * 0.28;
    const camX = Math.round(cameraRef.current.x);
    const camY = Math.round(cameraRef.current.y);

    // === Begin drawing ===
    ctx.save();
    ctx.scale(dpr, dpr);

    const viewW = W / dpr;
    const viewH = H / dpr;

    // 1. Background (fill entire viewport)
    ctx.fillStyle = mapTheme?.background || '#0d1520';
    ctx.fillRect(0, 0, viewW, viewH);

    // Translate to camera
    ctx.save();
    ctx.translate(-camX, -camY);

    // 2. Grid pattern (only draw visible portion)
    const gridSpacing = 60;
    const startGX = Math.floor(Math.max(0, camX) / gridSpacing) * gridSpacing;
    const endGX = Math.min(MW, camX + viewW + gridSpacing);
    const startGY = Math.floor(Math.max(0, camY) / gridSpacing) * gridSpacing;
    const endGY = Math.min(MH, camY + viewH + gridSpacing);

    ctx.strokeStyle = mapTheme?.gridColor || 'rgba(108,99,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startGX; x <= endGX; x += gridSpacing) {
      ctx.moveTo(x, startGY);
      ctx.lineTo(x, endGY);
    }
    for (let y = startGY; y <= endGY; y += gridSpacing) {
      ctx.moveTo(startGX, y);
      ctx.lineTo(endGX, y);
    }
    ctx.stroke();

    // 3. No rectangular border — EvoWars.io open arena style

    // 4. Safe zone
    if (safeZone) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, MW, MH);
      ctx.arc(safeZone.x, safeZone.y, Math.max(0, safeZone.radius), 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(120, 20, 200, 0.35)';
      ctx.fill();

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

    // 5. Particles (Only draw visible ones)
    if (particles.length > 0) {
      const t = Date.now() / 700;
      const defaultColor = mapTheme?.particleColor || '#FFD700';
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        // Frustum cull: skip if outside viewport
        if (p.x < camX - 20 || p.x > camX + viewW + 20 || p.y < camY - 20 || p.y > camY + viewH + 20) continue;

        const pulse = 1 + 0.15 * Math.sin(t + p.x * 0.1);
        const r = PARTICLE_RADIUS * pulse;
        const color = p.color || defaultColor;

        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 6. Players (All — they could be anywhere on map)
    for (let i = 0; i < lerpedPlayers.length; i++) {
      const pl = lerpedPlayers[i];
      // Only draw if roughly within viewport (generous margin for large players)
      const pRad = (pl.radius || PLAYER_RADIUS) + 60;
      if (pl.x < camX - pRad || pl.x > camX + viewW + pRad || pl.y < camY - pRad || pl.y > camY + viewH + pRad) continue;
      drawPlayer(ctx, pl, pl.socketId === mySocketId, slashes);
    }

    // 7. Slashes
    if (slashes.length > 0) {
      const now = Date.now();
      for (let i = 0; i < slashes.length; i++) {
        const slash = slashes[i];
        const age = now - slash.createdAt;
        if (age <= 220) {
          if (slash.x >= camX - 80 && slash.x <= camX + viewW + 80 && slash.y >= camY - 80 && slash.y <= camY + viewH + 80) {
            drawSlash(ctx, slash, age);
          }
        }
      }
    }

    ctx.restore(); // End camera translate

    // 8. Minimap (bottom-right corner overlay)
    drawMinimap(ctx, viewW, viewH, MW, MH, lerpedPlayers, me, safeZone);

    ctx.restore(); // End dpr scale
  }

  // ── Minimap ────────────────────────────────────────────────

  function drawMinimap(ctx, viewW, viewH, mapW, mapH, players, me, safeZone) {
    const size = Math.min(150, viewW * 0.22);
    const padding = 12;
    const mx = viewW - size - padding;
    const my = viewH - size - padding;
    const scaleX = size / mapW;
    const scaleY = size / mapH;

    // Minimap Background
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#080c18';
    ctx.beginPath();
    ctx.arc(mx + size / 2, my + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Clip to circle for all minimap content
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx + size / 2, my + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    // Safe zone: fill poison area outside safe circle
    if (safeZone) {
      // Poison fill (entire minimap bg)
      ctx.fillStyle = 'rgba(100, 0, 180, 0.35)';
      ctx.fillRect(mx, my, size, size);

      // Clear safe zone (shows dark bg underneath)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(mx + safeZone.x * scaleX, my + safeZone.y * scaleY, safeZone.radius * scaleX, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Safe zone ring
      ctx.beginPath();
      ctx.arc(mx + safeZone.x * scaleX, my + safeZone.y * scaleY, safeZone.radius * scaleX, 0, Math.PI * 2);
      ctx.strokeStyle = '#FF00FF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Players as dots
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.alive && !p.respawning) continue;
      const isMe = me && p.socketId === me.socketId;
      ctx.fillStyle = isMe ? '#FFFFFF' : (p.color || '#FF4757');
      ctx.beginPath();
      ctx.arc(mx + p.x * scaleX, my + p.y * scaleY, isMe ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Viewport rectangle
    if (me) {
      const cx = cameraRef.current.x;
      const cy = cameraRef.current.y;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(mx + cx * scaleX, my + cy * scaleY, viewW * scaleX, viewH * scaleY);
    }

    ctx.restore(); // End circle clip

    // Minimap border ring
    ctx.beginPath();
    ctx.arc(mx + size / 2, my + size / 2, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(108, 99, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawSlash(ctx, slash, age) {
    const progress = age / 220;
    const angle = Math.atan2(slash.facingY || 0, slash.facingX || 1);
    const attackerRadius = slash.radius || 16;
    const radius = attackerRadius * 1.4 + progress * attackerRadius;
    const alpha = Math.max(0, 1 - progress);

    ctx.save();
    ctx.translate(slash.x, slash.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2.2, Math.PI / 2.2, false);
    ctx.lineWidth = 8 * alpha;
    ctx.strokeStyle = `rgba(255, 100, 100, ${alpha * 0.4})`;
    ctx.stroke();

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

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(player.x - radius * 0.25, player.y - radius * 0.25, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

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
          swingAngle = ((age / 220) * Math.PI) - (Math.PI / 2);
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

    // HP Bar
    const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
    const barX = player.x - HP_BAR_W / 2;
    const barY = player.y - radius - 12;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX, barY, HP_BAR_W, HP_BAR_H);
    ctx.fillStyle = hpRatio > 0.5 ? '#2ED573' : hpRatio > 0.25 ? '#FFA502' : '#FF4757';
    ctx.fillRect(barX, barY, HP_BAR_W * hpRatio, HP_BAR_H);

    // Nickname & Score
    ctx.font = `bold 11px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#FFFFFF' : '#DDDDDD';
    ctx.fillText(
      (player.nickname?.length > 10 ? player.nickname.slice(0, 10) + '…' : player.nickname) || '?',
      player.x,
      player.y - radius - 16
    );

    ctx.font = `bold 10px monospace`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`${player.score || 0}`, player.x, player.y + radius + 14);
  }

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleCanvasClick}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
        touchAction: 'none',
      }}
      tabIndex={0}
    />
  );
}
