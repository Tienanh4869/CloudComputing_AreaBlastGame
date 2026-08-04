// src/hooks/useSocket.js — Socket.IO connection hook
import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import useAuthStore from '../store/authStore';
import useGameStore from '../store/gameStore';
import toast from 'react-hot-toast';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

let socketInstance = null;

// Shared pending join state — survives StrictMode double-effect
let pendingJoin = null; // { roomId, roomCode, password }

export const useSocket = () => {
  const socketRef = useRef(null);
  const token = useAuthStore((s) => s.token);
  const updateGameState = useGameStore((s) => s.updateGameState);
  const updateLeaderboard = useGameStore((s) => s.updateLeaderboard);
  const addKillFeed = useGameStore((s) => s.addKillFeed);
  const addSlash = useGameStore((s) => s.addSlash);
  const setMatchStatus = useGameStore((s) => s.setMatchStatus);
  const setMatchId = useGameStore((s) => s.setMatchId);
  const setMapDimensions = useGameStore((s) => s.setMapDimensions);
  const setMatchResults = useGameStore((s) => s.setMatchResults);
  const setMySocketId = useGameStore((s) => s.setMySocketId);
  const setMatchCountdown = useGameStore((s) => s.setMatchCountdown);

  const setParticles = useGameStore((s) => s.setParticles);
  const addParticles = useGameStore((s) => s.addParticles);
  const removeParticles = useGameStore((s) => s.removeParticles);

  // Connect on mount
  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    socketInstance = socket;

    // Store socket ID + auto-rejoin room on connect/reconnect
    socket.on('connect', () => {
      setMySocketId(socket.id);
      console.log('[Socket] Connected:', socket.id);
      // Auto-join if there is a pending room (handles StrictMode & reconnects)
      if (pendingJoin) {
        console.log('[Socket] Auto-joining pending room:', pendingJoin);
        socket.emit('join_room', pendingJoin);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      toast.error('Cannot connect to game server');
    });

    // ── Game Events ────────────────────────────────────────────

    // Full game state (every tick)
    socket.on('game_state', (state) => {
      updateGameState(state);
    });

    // Leaderboard update
    socket.on('leaderboard_update', ({ scores }) => {
      updateLeaderboard(scores);
    });

    // Confirmed join — server acknowledged our join_room
    socket.on('room_joined', ({ roomId, state, matchStatus, mapWidth, mapHeight, mapUrl, mapTheme, isHost }) => {
      console.log('[Socket] room_joined confirmed', { roomId, isHost, matchStatus });
      setMapDimensions(mapWidth, mapHeight, mapUrl, mapTheme);
      useGameStore.getState().setIsHost(!!isHost);
      if (matchStatus) {
        useGameStore.getState().setMatchStatus(matchStatus);
      }
      // Update initial game state (players already in room)
      useGameStore.getState().updateGameState(state);
    });

    // Match lifecycle
    socket.on('match_countdown', ({ seconds }) => {
      console.log('[Socket] match_countdown', { seconds });
      setMatchCountdown(seconds);
      // We will count down locally
      let timeLeft = seconds;
      const interval = setInterval(() => {
        timeLeft -= 1;
        if (timeLeft <= 0) {
          clearInterval(interval);
          setMatchCountdown(0);
        } else {
          setMatchCountdown(timeLeft);
        }
      }, 1000);
    });

    socket.on('match_started', ({ matchId, mapWidth, mapHeight, mapUrl, mapTheme }) => {
      console.log('[Socket] match_started', { matchId });
      setMatchStatus('playing');
      setMatchId(matchId);
      setMapDimensions(mapWidth, mapHeight, mapUrl, mapTheme);
      setMatchCountdown(0); // clear any remaining countdown
      toast.success('⚔️ Battle started!', { duration: 2000 });
    });

    socket.on('match_ended', (data) => {
      setMatchResults(data);
      toast('🏆 Match ended!', { duration: 3000 });
    });

    // Player events
    socket.on('player_joined', (data) => {
      useGameStore.getState().addPlayer(data);
      toast(`🎮 ${data.nickname} joined`, { duration: 2000 });
    });

    socket.on('player_left', (data) => {
      useGameStore.getState().removePlayer(data.socketId);
      toast(`👋 ${data.nickname} left`, { duration: 2000 });
    });

    // Attack action (visual effect)
    socket.on('player_attack_action', (data) => {
      addSlash(data);
    });

    // Kill events → kill feed
    socket.on('player_died', ({ killerNickname, targetNickname }) => {
      addKillFeed({ killer: killerNickname, victim: targetNickname });
    });

    // Particles optimizations
    socket.on('sync_particles', (particles) => {
      setParticles(particles);
    });

    socket.on('particles_spawned', (spawned) => {
      addParticles(spawned);
    });

    socket.on('particles_collected', (collectedData) => {
      const collectedIds = collectedData.map(c => c.particleId);
      removeParticles(collectedIds);
    });

    // Server errors (room full, not found, match fail, etc.)
    socket.on('error', ({ message }) => {
      console.error('[Socket] Server error:', message);
      toast.error(message);
    });

    return () => {
      socket.disconnect();
      socketInstance = null;
    };
  }, [token]);

  // Emit helpers
  const joinRoom = useCallback((roomId, roomCode, password) => {
    // Store pending join for auto-rejoin/StrictMode
    pendingJoin = { roomId, roomCode, password };

    const socket = socketRef.current;
    if (!socket) { console.error('[Socket] No socket!'); return; }

    const doJoin = () => {
      console.log('[Socket] Emitting join_room', { roomId, roomCode });
      socket.emit('join_room', { roomId, roomCode, password });
    };

    // If already connected, join immediately; else wait for connect
    if (socket.connected) {
      doJoin();
    } else {
      console.log('[Socket] Not connected yet, waiting...');
      socket.once('connect', doJoin);
    }

    setMatchStatus('waiting');
  }, []);

  const leaveRoom = useCallback(() => {
    pendingJoin = null;
    socketRef.current?.emit('leave_room');
    setMatchStatus('idle');
  }, []);

  const sendReady = useCallback(() => {
    console.log('[Socket] Sending ready, socket connected:', socketRef.current?.connected);
    socketRef.current?.emit('ready');
  }, []);

  const sendMove = useCallback((dx, dy) => {
    socketRef.current?.emit('player_move', { dx, dy });
  }, []);

  const sendAttack = useCallback(() => {
    socketRef.current?.emit('player_attack');
  }, []);

  return {
    socket: socketRef.current,
    joinRoom,
    leaveRoom,
    sendReady,
    sendMove,
    sendAttack,
  };
};

// Export singleton for use outside React (e.g., in GameCanvas)
export const getSocket = () => socketInstance;

export default useSocket;
