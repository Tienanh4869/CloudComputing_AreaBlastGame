// src/pages/LobbyPage.jsx — Room listing, matchmaking, and creation
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getRooms, createRoom, getRoomByCode } from '../api/rooms';
import { updateProfile, updateNickname, uploadImage } from '../api/auth';
import useAuthStore from '../store/authStore';
import useGameStore from '../store/gameStore';
import useSocket from '../hooks/useSocket';
import DailyQuestPanel from '../components/DailyQuestPanel';
import Navbar from '../components/Navbar';

const StatusBadge = ({ status }) => {
  const map = {
    waiting: { cls: 'badge-success', label: '● Waiting' },
    playing: { cls: 'badge-warning', label: '⚔ Playing' },
    finished: { cls: 'badge-danger', label: '✓ Finished' },
  };
  const b = map[status] || map.waiting;
  return <span className={`badge ${b.cls}`}>{b.label}</span>;
};

export default function LobbyPage() {
  const navigate = useNavigate();
  const { player } = useAuthStore();
  const setRoom = useGameStore((s) => s.setRoom);
  const resetGame = useGameStore((s) => s.resetGame);

  // Use socket for global chat & matchmaking
  const { socket } = useSocket();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Search
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // UI State
  const [activeTab, setActiveTab] = useState('menu'); // 'menu', 'browser'
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [isFindingMatch, setIsFindingMatch] = useState(false);
  const [queueInfo, setQueueInfo] = useState({ current: 1, min: 4, max: 8, needed: 8, startingIn: null });

  const [joinCode, setJoinCode] = useState('');
  const [newRoom, setNewRoom] = useState({ name: '', max_players: 4 });
  const [creating, setCreating] = useState(false);
  const [profileForm, setProfileForm] = useState({
    nickname: player?.nickname || '',
    avatar_url: player?.avatar_url || '',
    weapon_url: player?.weapon_url || '',
  });
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Global Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  const mobileChatEndRef = useRef(null);

  useEffect(() => {
    if (socket) {
      const handleGlobalChat = (msg) => {
        setChatMessages((prev) => [...prev, msg].slice(-100)); // keep last 100
        setTimeout(() => {
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          mobileChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      };

      const handleMatchFound = ({ roomId, roomCode }) => {
        setIsFindingMatch(false);
        toast.success('Match Found! Entering arena...');
        handleJoinRoom({ id: roomId, code: roomCode });
      };

      const handleQueueUpdate = (data) => {
        setQueueInfo({
          current: data.current || 1,
          min: data.min || 4,
          max: data.max || 8,
          needed: data.needed || data.max || 8,
          startingIn: data.startingIn !== undefined ? data.startingIn : null,
        });
      };

      socket.on('global_chat_message', handleGlobalChat);
      socket.on('match_found', handleMatchFound);
      socket.on('quick_match_queue_update', handleQueueUpdate);
      return () => {
        socket.off('global_chat_message', handleGlobalChat);
        socket.off('match_found', handleMatchFound);
        socket.off('quick_match_queue_update', handleQueueUpdate);
      };
    }
  }, [socket]);

  const handleQuickMatch = () => {
    if (!socket) return;
    setQueueInfo({ current: 1, needed: 8 });
    setIsFindingMatch(true);
    socket.emit('join_quick_match');
  };

  const cancelQuickMatch = () => {
    if (!socket) return;
    setIsFindingMatch(false);
    socket.emit('leave_quick_match');
  };

  const sendGlobalChat = (e) => {
    e.preventDefault();
    if (chatInput.trim() && socket) {
      socket.emit('global_chat_message', chatInput.trim());
      setChatInput('');
    }
  };

  const loadRooms = useCallback(async () => {
    try {
      const { data } = await getRooms({ page: currentPage, limit: 8, search: searchQuery });
      setRooms(data.rooms);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      toast.error('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery]);

  useEffect(() => {
    resetGame();
    loadRooms();
    const interval = setInterval(loadRooms, 5000);
    return () => clearInterval(interval);
  }, [loadRooms]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setCurrentPage(1);
  };

  const handleJoinRoom = (room) => {
    setRoom(room);
    navigate(`/game/${room.id}`);
  };

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      const { data } = await getRoomByCode(joinCode.trim());
      handleJoinRoom(data.room);
    } catch {
      toast.error('Room not found with that code');
    }
  };

  const onRoomClick = (room) => {
    if (room.status !== 'waiting') {
      handleJoinRoom(room); // Spectate
      return;
    }
    handleJoinRoom(room);
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoom.name.trim()) return;
    setCreating(true);
    try {
      const { data } = await createRoom(newRoom);
      toast.success(`Room "${data.room.name}" created!`);
      setShowCreate(false);
      handleJoinRoom(data.room);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdatingProfile(true);
    try {
      const { data } = await updateProfile({
        avatar_url: profileForm.avatar_url,
        weapon_url: profileForm.weapon_url,
      });
      let updatedPlayer = data.player;

      if (profileForm.nickname && profileForm.nickname !== player.nickname) {
        const { data: nameData } = await updateNickname({ nickname: profileForm.nickname });
        updatedPlayer = nameData.player;
      }

      useAuthStore.getState().setPlayer(updatedPlayer);
      toast.success('Profile updated!');
      setShowProfile(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleFileChange = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          setUpdatingProfile(true);
          const { data } = await uploadImage(reader.result, type);
          setProfileForm((f) => ({ ...f, [type]: data.url }));
          toast.success('Image uploaded! Click Save to apply.');
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to upload image');
        } finally {
          setUpdatingProfile(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error('File read error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 64, display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <Navbar onOpenProfile={() => setShowProfile(true)} />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left Side: Game Menu / Browser */}
        <div
          className="container"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '24px 16px 80px',
            overflowY: 'auto',
          }}
        >
          {activeTab === 'menu' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                maxWidth: 520,
                marginTop: '2vh',
              }}
            >
              <h1
                style={{
                  fontSize: 'clamp(2rem, 8vw, 3.2rem)',
                  fontWeight: 900,
                  marginBottom: 8,
                  textAlign: 'center',
                  letterSpacing: '-1px',
                }}
                className="gradient-text"
              >
                ARENA BLAST
              </h1>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: '1rem', textAlign: 'center' }}>
                Real-time Battle Royale in your browser
              </p>

              {/* Daily Quests */}
              <DailyQuestPanel />

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
                <button
                  className="btn btn-primary btn-lg"
                  style={{
                    padding: '20px 20px',
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: '0 8px 24px rgba(108, 99, 255, 0.4)',
                  }}
                  onClick={handleQuickMatch}
                >
                  🎲 QUICK MATCH (4-8P)
                </button>

                <button
                  className="btn btn-secondary btn-lg"
                  style={{
                    padding: '16px',
                    fontSize: '1.05rem',
                    justifyContent: 'center',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-glow)',
                  }}
                  onClick={() => setShowCreate(true)}
                >
                  🏠 CREATE CUSTOM ROOM
                </button>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '14px', justifyContent: 'center' }}
                    onClick={() => setActiveTab('browser')}
                  >
                    🔍 BROWSE ROOMS
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '14px', justifyContent: 'center' }}
                    onClick={() => setShowJoinCode(true)}
                  >
                    🔑 JOIN BY CODE
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'browser' && (
            <div style={{ width: '100%', maxWidth: 1000, animation: 'fadeIn 0.3s' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 20,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('menu')}>
                    ← Back
                  </button>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Public Rooms</h2>
                </div>

                <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 450 }}>
                  <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8, flex: 1 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search rooms..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Search
                    </button>
                  </form>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                    + Create
                  </button>
                </div>
              </div>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
                  <div className="spinner" style={{ width: 48, height: 48 }} />
                </div>
              ) : rooms.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏟️</div>
                  <p>No rooms available right now.</p>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: 16 }}
                    onClick={() => setShowCreate(true)}
                  >
                    Create the First Room →
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 14,
                  }}
                >
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="card animate-slide-in"
                      style={{
                        cursor: room.status === 'waiting' ? 'pointer' : 'default',
                        opacity: room.status === 'finished' ? 0.6 : 1,
                        position: 'relative',
                        padding: 16,
                      }}
                      onClick={() => onRoomClick(room)}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: 12,
                        }}
                      >
                        <div>
                          <h3 style={{ fontSize: '1.05rem', marginBottom: 4 }}>{room.name}</h3>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.78rem',
                              color: 'var(--accent-secondary)',
                            }}
                          >
                            Host: {room.creator?.username || 'Unknown'}
                          </div>
                        </div>
                        <StatusBadge status={room.status} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          👥 {room.player_count} / {room.max_players}
                        </div>
                        {room.status === 'waiting' && <span className="btn btn-primary btn-sm">Join</span>}
                        {room.status === 'playing' && <span className="btn btn-secondary btn-sm">Spectate</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: World Chat (Desktop Only) */}
        <div
          className="lobby-chat-sidebar-desktop"
          style={{
            width: 320,
            borderLeft: '1px solid var(--border-color)',
            background: 'rgba(10,14,26,0.95)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.2)',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              fontWeight: 800,
              color: 'var(--accent-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>🌎</span>
            <span>World Chat</span>
          </div>

          <div
            style={{
              flex: 1,
              padding: 16,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {chatMessages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', textAlign: 'center', marginTop: 40 }}>
                Welcome to ArenaBlast! Say hello to the world.
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} style={{ fontSize: '0.88rem', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{msg.nickname}: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{msg.message}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={sendGlobalChat}
            style={{
              padding: 14,
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              gap: 8,
              background: 'var(--bg-card)',
            }}
          >
            <input
              type="text"
              className="form-input"
              style={{ flex: 1 }}
              placeholder="Chat in world..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={150}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!chatInput.trim()}>
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Floating Chat Button for Mobile */}
      <button
        className="floating-chat-btn mobile-only"
        onClick={() => setShowMobileChat(true)}
        aria-label="Open World Chat"
      >
        <span>💬</span>
        <span>World Chat</span>
        {chatMessages.length > 0 && (
          <span
            style={{
              background: 'var(--accent-danger)',
              borderRadius: 99,
              padding: '2px 6px',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            {chatMessages.length}
          </span>
        )}
      </button>

      {/* Mobile Chat Bottom-Sheet Modal */}
      {showMobileChat && (
        <div className="mobile-chat-modal" onClick={() => setShowMobileChat(false)}>
          <div className="mobile-chat-content" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontWeight: 800, color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🌎</span> World Chat
              </div>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 10px', fontSize: '0.9rem' }}
                onClick={() => setShowMobileChat(false)}
              >
                ✕ Close
              </button>
            </div>

            <div
              style={{
                flex: 1,
                padding: 16,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {chatMessages.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', textAlign: 'center', marginTop: 30 }}>
                  Welcome to ArenaBlast! Say hello.
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} style={{ fontSize: '0.88rem', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{msg.nickname}: </span>
                    <span style={{ color: 'var(--text-primary)' }}>{msg.message}</span>
                  </div>
                ))
              )}
              <div ref={mobileChatEndRef} />
            </div>

            <form
              onSubmit={sendGlobalChat}
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                gap: 8,
                background: 'var(--bg-card)',
              }}
            >
              <input
                type="text"
                className="form-input"
                style={{ flex: 1 }}
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={150}
              />
              <button type="submit" className="btn btn-primary" disabled={!chatInput.trim()}>
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Quick Match Finding Modal */}
      {isFindingMatch && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(6px)',
            padding: 16,
          }}
        >
          <div
            className="card animate-fade-in"
            style={{
              width: 'min(92vw, 420px)',
              padding: '24px 20px',
              textAlign: 'center',
              border: '1px solid rgba(0, 200, 255, 0.4)',
              boxShadow: '0 8px 32px rgba(0, 200, 255, 0.2)',
            }}
          >
            <div
              className="spinner"
              style={{
                width: 48,
                height: 48,
                margin: '0 auto 16px',
                borderWidth: 4,
                borderColor: 'rgba(0, 200, 255, 0.2)',
                borderTopColor: '#00d2ff',
              }}
            />
            <h3 style={{ marginBottom: 6, fontSize: '1.3rem' }} className="gradient-text">
              🎯 Ghép Trận Ngẫu Nhiên
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 14 }}>
              (Tối thiểu 4 người — Tối đa 8 người)
            </p>

            <div
              style={{
                margin: '14px 0',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                }}
              >
                <span>Đang chờ trong hàng:</span>
                <span style={{ color: queueInfo.current >= (queueInfo.min || 4) ? '#00ffcc' : '#ffcc00' }}>
                  {queueInfo.current} / {queueInfo.max || 8} Người
                </span>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: 10,
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 5,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(12, (queueInfo.current / (queueInfo.max || 8)) * 100))}%`,
                    height: '100%',
                    background:
                      queueInfo.current >= (queueInfo.min || 4)
                        ? 'linear-gradient(90deg, #00f2fe, #4facfe)'
                        : 'linear-gradient(90deg, #f6d365, #fda085)',
                    borderRadius: 5,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              <div style={{ marginTop: 10 }}>
                {queueInfo.current >= (queueInfo.max || 8) ? (
                  <p style={{ color: '#00ffcc', fontSize: '0.85rem', fontWeight: 'bold', margin: 0 }}>
                    🚀 Đủ 8 người! Đang khởi tạo trận đấu...
                  </p>
                ) : queueInfo.current >= (queueInfo.min || 4) ? (
                  <p style={{ color: '#00ffcc', fontSize: '0.85rem', fontWeight: 'bold', margin: 0 }}>
                    ⚡ Đã đủ tối thiểu {queueInfo.min || 4} người!
                    {queueInfo.startingIn !== null && queueInfo.startingIn !== undefined
                      ? ` Bắt đầu sau ${queueInfo.startingIn}s...`
                      : ' Chuẩn bị vào trận...'}
                  </p>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                    Cần thêm {(queueInfo.min || 4) - queueInfo.current} người nữa để bắt đầu...
                  </p>
                )}
              </div>
            </div>

            <button className="btn btn-secondary btn-full" onClick={cancelQuickMatch} style={{ marginTop: 8 }}>
              Hủy Tìm Trận
            </button>
          </div>
        </div>
      )}

      {/* Join By Code Modal */}
      {showJoinCode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            padding: 16,
          }}
          onClick={() => setShowJoinCode(false)}
        >
          <div
            className="card animate-fade-in"
            style={{ width: 'min(92vw, 360px)', padding: '24px 20px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 8 }}>🔑 Join by Code</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 18 }}>
              Enter the 6-character room code.
            </p>
            <form onSubmit={handleJoinByCode}>
              <input
                type="text"
                className="form-input"
                autoFocus
                maxLength={6}
                style={{
                  textTransform: 'uppercase',
                  letterSpacing: 4,
                  textAlign: 'center',
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                }}
                placeholder="XXXXXX"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowJoinCode(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-full">
                  Find Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="card animate-fade-in"
            style={{ width: 'min(92vw, 420px)', padding: '24px 20px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 18 }}>Create New Room</h3>
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label className="form-label">Room Name</label>
                <input
                  className="form-input"
                  placeholder="My Awesome Room"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom((r) => ({ ...r, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Max Players: {newRoom.max_players}</label>
                <input
                  type="range"
                  min={2}
                  max={50}
                  value={newRoom.max_players}
                  onChange={(e) => setNewRoom((r) => ({ ...r, max_players: +e.target.value }))}
                  style={{ width: '100%', accentColor: 'var(--accent-primary)', height: 32 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>2</span>
                  <span>50</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-full" disabled={creating}>
                  {creating ? 'Creating...' : '🚀 Create & Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowProfile(false)}
        >
          <div
            className="card animate-fade-in"
            style={{
              width: 'min(92vw, 420px)',
              padding: '24px 20px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: 18 }}>Customize Profile</h3>
            <form onSubmit={handleUpdateProfile}>
              <div className="form-group">
                <label className="form-label">Nickname</label>
                <input
                  className="form-input"
                  placeholder="Your nickname"
                  value={profileForm.nickname}
                  onChange={(e) => setProfileForm((f) => ({ ...f, nickname: e.target.value }))}
                  required
                  minLength={2}
                  maxLength={30}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Avatar Image</label>
                <input
                  className="form-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, 'avatar_url')}
                />
                {profileForm.avatar_url && (
                  <img
                    src={profileForm.avatar_url}
                    alt="Avatar"
                    style={{ height: 40, marginTop: 8, borderRadius: '50%', objectFit: 'cover' }}
                  />
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Weapon Image</label>
                <input
                  className="form-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, 'weapon_url')}
                />
                {profileForm.weapon_url && (
                  <img src={profileForm.weapon_url} alt="Weapon" style={{ height: 40, marginTop: 8 }} />
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowProfile(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-full" disabled={updatingProfile}>
                  {updatingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
