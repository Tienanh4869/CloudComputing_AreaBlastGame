// src/pages/LobbyPage.jsx — Room listing and creation
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getRooms, createRoom, getRoomByCode } from '../api/rooms';
import { logout as apiLogout, updateProfile, updateNickname, uploadImage } from '../api/auth';
import useAuthStore from '../store/authStore';
import useGameStore from '../store/gameStore';
import useSocket from '../hooks/useSocket';

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
  const { user, player } = useAuthStore();
  const setRoom = useGameStore((s) => s.setRoom);
  const resetGame = useGameStore((s) => s.resetGame);
  
  // Use socket for global chat
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
  const [isFindingMatch, setIsFindingMatch] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const [newRoom, setNewRoom] = useState({ name: '', max_players: 4 });
  const [creating, setCreating] = useState(false);
  const [profileForm, setProfileForm] = useState({
    nickname: player?.nickname || '',
    avatar_url: player?.avatar_url || '',
    weapon_url: player?.weapon_url || ''
  });
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Global Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (socket) {
      const handleGlobalChat = (msg) => {
        setChatMessages(prev => [...prev, msg].slice(-100)); // keep last 100
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      };
      
      const handleMatchFound = ({ roomId, roomCode, isQuickMatch }) => {
        setIsFindingMatch(false);
        toast.success('Match Found! Joining...');
        // We can just create a dummy room object since GamePage only needs roomId initially
        handleJoinRoom({ id: roomId, code: roomCode });
      };

      socket.on('global_chat_message', handleGlobalChat);
      socket.on('match_found', handleMatchFound);
      return () => {
        socket.off('global_chat_message', handleGlobalChat);
        socket.off('match_found', handleMatchFound);
      };
    }
  }, [socket]);

  const handleQuickMatch = () => {
    if (!socket) return;
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
    const interval = setInterval(loadRooms, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, [loadRooms]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setCurrentPage(1); // Reset to page 1 on new search
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

  const handleLogout = async () => {
    try { await apiLogout(); } catch (e) { /* ignore */ }
    useAuthStore.getState().logout();
    navigate('/login');
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdatingProfile(true);
    try {
      const { data } = await updateProfile({
        avatar_url: profileForm.avatar_url,
        weapon_url: profileForm.weapon_url
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
    <div style={{ minHeight: '100vh', paddingTop: 70, display: 'flex', flexDirection: 'column' }}>
      {/* Navbar */}
      <nav className="navbar">
        <span className="navbar-brand gradient-text" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('menu')}>
          ⚔️ ArenaBlast
        </span>
        <div className="navbar-links">
          <Link to="/lobby" className="nav-link active">🏠 Lobby</Link>
          <Link to="/leaderboard" className="nav-link">🏆 Leaderboard</Link>
          <Link to="/history" className="nav-link">📜 History</Link>
          <div 
            onClick={() => setShowProfile(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8,
              padding: '6px 14px', background: 'var(--bg-card)', cursor: 'pointer',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)',
            }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: player?.avatar_color || '#4A90D9' }} />
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{player?.nickname || user?.username}</span>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Side: Game Menu / Browser */}
        <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          
          {activeTab === 'menu' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 500, marginTop: '5vh' }}>
              <h1 style={{ fontSize: '3rem', fontWeight: 900, marginBottom: 10 }} className="gradient-text">ARENA BLAST</h1>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 40, fontSize: '1.1rem' }}>Battle Royale in your browser.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
                <button 
                  className="btn btn-primary btn-lg" 
                  style={{ padding: '24px 20px', fontSize: '1.2rem', justifyContent: 'center' }}
                  onClick={handleQuickMatch}
                >
                  🎲 QUICK MATCH
                </button>
                
                <button 
                  className="btn btn-secondary btn-lg" 
                  style={{ padding: '20px', fontSize: '1.1rem', justifyContent: 'center', background: 'rgba(255,255,255,0.1)' }}
                  onClick={() => setShowCreate(true)}
                >
                  🏠 CREATE ROOM
                </button>
                
                <div style={{ display: 'flex', gap: 16 }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ flex: 1, padding: '16px', justifyContent: 'center' }}
                    onClick={() => setActiveTab('browser')}
                  >
                    🔍 BROWSE ROOMS
                  </button>
                  <button 
                    className="btn btn-secondary" 
                    style={{ flex: 1, padding: '16px', justifyContent: 'center' }}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('menu')}>← Back</button>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Public Rooms</h2>
                </div>
                
                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 400 }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Search rooms..." 
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button type="submit" className="btn btn-secondary">Search</button>
                </form>

                <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Create Room</button>
              </div>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
                  <div className="spinner" style={{ width: 48, height: 48 }} />
                </div>
              ) : rooms.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏟️</div>
                  <p>No rooms available right now.</p>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: 16,
                }}>
                  {rooms.map((room) => (
                    <div key={room.id} className="card animate-slide-in" style={{
                      cursor: room.status === 'waiting' ? 'pointer' : 'default',
                      opacity: room.status === 'finished' ? 0.6 : 1,
                      position: 'relative'
                    }} onClick={() => onRoomClick(room)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <h3 style={{ fontSize: '1.1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {room.name}
                          </h3>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-secondary)', letterSpacing: 2 }}>
                            Host: {room.creator?.username || 'Unknown'}
                          </div>
                        </div>
                        <StatusBadge status={room.status} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                          👥 {room.player_count} / {room.max_players}
                        </div>
                        {room.status === 'waiting' && (
                          <span className="btn btn-primary btn-sm">Join</span>
                        )}
                        {room.status === 'playing' && (
                          <span className="btn btn-secondary btn-sm">Spectate</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 32 }}>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: World Chat Sidebar */}
        <div style={{ 
          width: 320, 
          borderLeft: '1px solid var(--border-color)', 
          background: 'rgba(10,14,26,0.95)',
          display: 'flex', 
          flexDirection: 'column',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.2)'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 800, color: 'var(--accent-secondary)' }}>
            🌎 World Chat
          </div>
          <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chatMessages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', marginTop: 40 }}>
                Welcome to ArenaBlast! Say hello to the world.
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{msg.nickname}: </span>
                  <span style={{ color: 'var(--text-primary)' }}>{msg.message}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendGlobalChat} style={{ padding: 16, borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8, background: 'var(--bg-card)' }}>
            <input 
              type="text" 
              className="form-input" 
              style={{ flex: 1 }} 
              placeholder="Chat in world..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              maxLength={150}
            />
            <button type="submit" className="btn btn-primary" disabled={!chatInput.trim()}>Send</button>
          </form>
        </div>

      </div>

      {/* Quick Match Finding Modal */}
      {isFindingMatch && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
        }}>
          <div className="card animate-fade-in" style={{ width: 360, padding: 32, textAlign: 'center' }}>
            <div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 20px' }} />
            <h3 style={{ marginBottom: 8 }}>Finding Match...</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 24 }}>
              Waiting for other players (Need 4)
            </p>
            <button className="btn btn-secondary btn-full" onClick={cancelQuickMatch}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Join By Code Modal */}
      {showJoinCode && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
        }} onClick={() => setShowJoinCode(false)}>
          <div className="card animate-fade-in" style={{ width: 360, padding: 32 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 8 }}>🔑 Join by Code</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 20 }}>
              Enter the 6-character room code.
            </p>
            <form onSubmit={handleJoinByCode}>
              <input 
                type="text" 
                className="form-input" 
                autoFocus
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}
                placeholder="XXXXXX"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowJoinCode(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-full">Find Room</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowCreate(false)}>
          <div className="card animate-fade-in" style={{ width: 400, padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 20 }}>Create New Room</h3>
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label className="form-label">Room Name</label>
                <input className="form-input" placeholder="My Awesome Room"
                  value={newRoom.name}
                  onChange={(e) => setNewRoom((r) => ({ ...r, name: e.target.value }))}
                  required />
              </div>
              <div className="form-group">
                <label className="form-label">Max Players: {newRoom.max_players}</label>
                <input type="range" min={2} max={8} value={newRoom.max_players}
                  onChange={(e) => setNewRoom((r) => ({ ...r, max_players: +e.target.value }))}
                  style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>2</span><span>8</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowCreate(false)}>Cancel</button>
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
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowProfile(false)}>
          <div className="card animate-fade-in" style={{ width: 400, padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 20 }}>Customize Profile</h3>
            <form onSubmit={handleUpdateProfile}>
              <div className="form-group">
                <label className="form-label">Nickname</label>
                <input className="form-input" placeholder="Your nickname"
                  value={profileForm.nickname}
                  onChange={(e) => setProfileForm((f) => ({ ...f, nickname: e.target.value }))}
                  required minLength={2} maxLength={30} />
              </div>
              <div className="form-group">
                <label className="form-label">Avatar Image</label>
                <input className="form-input" type="file" accept="image/*"
                  onChange={(e) => handleFileChange(e, 'avatar_url')}
                />
                {profileForm.avatar_url && <img src={profileForm.avatar_url} alt="Avatar" style={{ height: 40, marginTop: 8 }} />}
              </div>
              <div className="form-group">
                <label className="form-label">Weapon Image</label>
                <input className="form-input" type="file" accept="image/*"
                  onChange={(e) => handleFileChange(e, 'weapon_url')}
                />
                {profileForm.weapon_url && <img src={profileForm.weapon_url} alt="Weapon" style={{ height: 40, marginTop: 8 }} />}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowProfile(false)}>Cancel</button>
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
