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
  // Removed crossOrigin to avoid CORS blocking opponent avatars
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
  const lastMoveRef = useRef({ dx: 0, dy: 0, isBoosting: false, lastSent: 0 });
  const isBoostingRef = useRef(false);

  const handleKeyDown = useCallback((e) => {
    keysRef.current.add(e.code);
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      onAttack?.();
    }
    if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      isBoostingRef.current = true;
    }
  }, [onAttack]);

  const handleKeyUp = useCallback((e) => {
    keysRef.current.delete(e.code);
    if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      isBoostingRef.current = false;
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Mouse coords are relative to window/canvas, we must map them to world later
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    mousePosRef.current = { x: mouseX, y: mouseY, active: true };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mousePosRef.current.active = false;
  }, []);

  const handleCanvasClick = useCallback((e) => {
    if (e.button === 0) { // Left click
      onAttack?.();
    } else if (e.button === 2) { // Right click
      isBoostingRef.current = true;
    }
  }, [onAttack]);

  const handleMouseUp = useCallback((e) => {
    if (e.button === 2) { // Right click release
      isBoostingRef.current = false;
    }
  }, []);

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
          // mousePosRef is screen coordinate. Center of screen is player.
          const W = canvas.width;
          const H = canvas.height;
          const screenCenterX = W / 2;
          const screenCenterY = H / 2;

          const mdx = mousePosRef.current.x - screenCenterX;
          const mdy = mousePosRef.current.y - screenCenterY;
          // Scale doesn't matter for the angle/direction calculation
          const dist = Math.hypot(mdx, mdy);
          if (dist > 15) {
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
      const moved = Math.abs(dx - lastMoveRef.current.dx) > 0.02 || Math.abs(dy - lastMoveRef.current.dy) > 0.02 || isBoostingRef.current !== lastMoveRef.current.isBoosting;
      const isMoving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
      const shouldResend = (isMoving || isBoostingRef.current) && (now - lastMoveRef.current.lastSent > 120);

      // Send movement heading to server
      if (moved || shouldResend) {
        lastMoveRef.current = { dx, dy, isBoosting: isBoostingRef.current, lastSent: now };
        onMove?.(dx, dy, isBoostingRef.current);
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

  function drawHexagonGrid(ctx, cameraX, cameraY, W, H, hexSize) {
    const hexWidth = hexSize * 2;
    const hexHeight = Math.sqrt(3) * hexSize;
    const colSpacing = hexSize * 1.5;
    const rowSpacing = hexHeight;

    // Calculate grid boundaries based on camera
    const startCol = Math.floor(cameraX / colSpacing) - 1;
    const endCol = Math.floor((cameraX + W) / colSpacing) + 1;
    const startRow = Math.floor(cameraY / rowSpacing) - 1;
    const endRow = Math.floor((cameraY + H) / rowSpacing) + 1;

    ctx.beginPath();
    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        const cx = col * colSpacing;
        const cy = row * rowSpacing + (col % 2 === 1 ? rowSpacing / 2 : 0);

        ctx.moveTo(cx + hexSize * Math.cos(0), cy + hexSize * Math.sin(0));
        for (let i = 1; i <= 6; i++) {
          ctx.lineTo(
            cx + hexSize * Math.cos((i * Math.PI) / 3),
            cy + hexSize * Math.sin((i * Math.PI) / 3)
          );
        }
      }
    }
    ctx.stroke();
  }

  function render(ctx, canvas, state) {
    const { players = [], particles = [], mySocketId, mapTheme, slashes = [] } = state;
    
    // Resize canvas dynamically to match window/container
    const parent = canvas.parentElement;
    if (parent && (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight)) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    const W = canvas.width;
    const H = canvas.height;

    // Find local player to center camera
    const myPlayer = players.find((p) => p.socketId === mySocketId);

    // Fixed camera zoom. No zooming in/out based on level!
    const scale = 0.55;

    // World visible area based on scale
    const viewW = W / scale;
    const viewH = H / scale;

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
           // Faster LERP for extremely smooth, responsive gameplay
           rPlayer.x += (pl.x - rPlayer.x) * 0.45; 
           rPlayer.y += (pl.y - rPlayer.y) * 0.45;
        }
      }
      lerpedPlayers.push({ ...pl, x: rPlayer.x, y: rPlayer.y });
    }

    // Now find the lerped position of the local player to center the camera perfectly smoothly
    const myLerpedPlayer = lerpedPlayers.find(p => p.socketId === mySocketId);
    
    // Smooth camera with integer snap to prevent sub-pixel jitter
    let targetCamX = myLerpedPlayer ? myLerpedPlayer.x - viewW / 2 : mapWidth / 2 - viewW / 2;
    let targetCamY = myLerpedPlayer ? myLerpedPlayer.y - viewH / 2 : mapHeight / 2 - viewH / 2;
    
    // No camera clamping - camera ALWAYS stays perfectly centered on player
    // to ensure smooth and predictable controls at map corners.

    const camX = Math.round(targetCamX);
    const camY = Math.round(targetCamY);
    // ---------------------------------------

    // 1. Background (unscaled to fill screen)
    ctx.fillStyle = mapTheme?.background || '#11151c'; // Darker EvoWars style
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-camX, -camY);

    // 2. Hexagon grid pattern (EvoWars style)
    ctx.save();
    // Clip the grid to the map boundaries so it doesn't spill into the void
    ctx.beginPath();
    ctx.rect(0, 0, mapWidth, mapHeight);
    ctx.clip();
    
    ctx.strokeStyle = mapTheme?.gridColor || 'rgba(108,99,255,0.05)';
    ctx.lineWidth = 1;
    drawHexagonGrid(ctx, camX, camY, viewW, viewH, 60);
    ctx.restore();

    // 3. Map border (dãy phân cách cho pit)
    ctx.strokeStyle = '#FF5A1F'; // EvoWars style orange border
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, mapWidth, mapHeight);
    
    // Inner boundary warning
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.4)';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, mapWidth - 12, mapHeight - 12);

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
      const pl = lerpedPlayers[i];
      // Frustum culling (account for player scale and weapon reach!)
      const plScale = pl.scale || 1.0;
      const visualRadius = (64 * plScale) / 2 + 150; // Extra 150px padding for weapons and effects
      if (pl.x < camX - visualRadius || pl.x > camX + viewW + visualRadius || pl.y < camY - visualRadius || pl.y > camY + viewH + visualRadius) continue;
      drawPlayer(ctx, pl, pl.socketId === mySocketId, slashes);
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

    ctx.restore(); // End camera translate / scale

    // 9. Minimap (Top-Left corner)
    drawMinimap(ctx, viewW, viewH, mapWidth, mapHeight, lerpedPlayers, myLerpedPlayer, camX, camY);

  } // End of render

  // ── Minimap ────────────────────────────────────────────────
  function drawMinimap(ctx, viewW, viewH, mapW, mapH, players, me, camX, camY) {
    const W = ctx.canvas.width;
    const size = Math.min(140, W * 0.22); // Size of minimap (Square 140x140)
    const padding = 16;
    const mx = padding; // Top-Left X
    const my = padding; // Top-Left Y
    const scaleX = size / mapW;
    const scaleY = size / mapH;

    // Minimap Background
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(mx, my, size, size);

    // Clip to square for all minimap content
    ctx.beginPath();
    ctx.rect(mx, my, size, size);
    ctx.clip();

    // Map Border on minimap
    ctx.strokeStyle = 'rgba(255, 90, 31, 0.4)'; // match the orange border faintly
    ctx.lineWidth = 1;
    ctx.strokeRect(mx, my, size, size);

    // Removed XP Orbs from minimap as requested

    // Players as dots
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!p.alive && !p.respawning) continue;
      const isMe = me && p.socketId === me.socketId;
      ctx.fillStyle = isMe ? '#FFFFFF' : '#00A8FF'; // White for me, Blue for others
      ctx.beginPath();
      ctx.arc(mx + p.x * scaleX, my + p.y * scaleY, isMe ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Viewport rectangle
    if (me) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(mx + camX * scaleX, my + camY * scaleY, viewW * scaleX, viewH * scaleY);
    }

    ctx.restore(); // End clip

    // Minimap border ring (Square)
    ctx.strokeStyle = '#5B5BFF';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(mx, my, size, size);
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
    // player.scale is provided by server: Math.min(1 + level * 0.04, 2.0)
    const visualScale = player.scale || 1.0;
    // Base visual radius is 32 (from 64x64 sprite)
    const visualRadius = 32 * visualScale;
    const hitRadius = player.radius || PLAYER_RADIUS; // 20px collision box

    if (!player.alive || player.respawning) {
      // Ghost / Respawning indicator
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = player.color || '#888';
      ctx.beginPath();
      ctx.arc(player.x, player.y, visualRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    
    // Boost Trail (Sprint effect)
    if (player.isBoosting) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 255, 255, 0.4)';
      ctx.shadowColor = 'cyan';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      // Draw a trail slightly behind the player
      ctx.arc(player.x - player.facingX * 20, player.y - player.facingY * 20, visualRadius * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (player.inBushId !== null && player.inBushId !== undefined) {
      ctx.globalAlpha = 0.5;
    }

    // Outer self aura
    if (isMe) {
      ctx.fillStyle = 'rgba(108, 99, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(player.x, player.y, visualRadius + 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Avatar Image or Vector Circle
    const avatarImg = getImage(player.avatarUrl);
    if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(player.x, player.y, visualRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatarImg, player.x - visualRadius, player.y - visualRadius, visualRadius * 2, visualRadius * 2);
      ctx.restore();

      ctx.strokeStyle = isMe ? '#FFFFFF' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isMe ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, visualRadius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = player.color || '#4A90D9';
      ctx.beginPath();
      ctx.arc(player.x, player.y, visualRadius, 0, Math.PI * 2);
      ctx.fill();

      // Eye / Pupil
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(player.x - visualRadius * 0.25, player.y - visualRadius * 0.25, visualRadius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = isMe ? '#FFFFFF' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isMe ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, visualRadius, 0, Math.PI * 2);
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
      
      // Dynamic weapon size based on level (same as backend attackRange)
      const dynamicAttackRange = 50 + ((player.level || 1) - 1) * 5; 
      const weaponSize = dynamicAttackRange * 0.8; // Scale weapon image to fit range
      
      // Draw weapon offset slightly from body
      ctx.drawImage(weaponImg, visualRadius * 0.8, -weaponSize / 2, weaponSize, weaponSize);
      ctx.restore();
    }

    // XP Bar
    const xpRatio = Math.max(0, Math.min(1, (player.xp || 0) / (player.maxXp || 10)));
    const barX = player.x - HP_BAR_W / 2;
    const barY = player.y - visualRadius - 12;

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
      player.y - visualRadius - 16
    );

    // Player Level
    ctx.font = `bold 12px sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Lv ${player.level || 1}`, player.x, player.y + visualRadius + 16);
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
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleCanvasClick}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
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
