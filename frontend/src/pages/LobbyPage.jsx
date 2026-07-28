// src/pages/LobbyPage.jsx — Room listing and creation
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getRooms, createRoom, getRoomByCode } from '../api/rooms';
import { logout as apiLogout, updateProfile, uploadImage } from '../api/auth';
import useAuthStore from '../store/authStore';
import useGameStore from '../store/gameStore';

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

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [newRoom, setNewRoom] = useState({ name: '', max_players: 4 });
  const [profileForm, setProfileForm] = useState({
    avatar_url: player?.avatar_url || '',
    weapon_url: player?.weapon_url || ''
  });
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      const { data } = await getRooms();
      setRooms(data.rooms);
    } catch (err) {
      toast.error('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    resetGame();
    loadRooms();
    const interval = setInterval(loadRooms, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const handleJoinRoom = (room) => {
    setRoom(room);
    navigate(`/game/${room.id}`);
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    try {
      const { data } = await getRoomByCode(joinCode.trim());
      handleJoinRoom(data.room);
    } catch {
      toast.error('Room not found with that code');
    }
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
      const { data } = await updateProfile(profileForm);
      useAuthStore.getState().setPlayer(data.player);
      toast.success('Profile updated!');
      setShowProfile(false);
    } catch (err) {
      toast.error('Failed to update profile');
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
          toast.error('Failed to upload image');
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
    <div style={{ minHeight: '100vh', paddingTop: 70 }}>
      {/* Navbar */}
      <nav className="navbar">
        <span className="navbar-brand gradient-text">⚔️ ArenaBlast</span>
        <div className="navbar-links">
          <Link to="/lobby"      className="nav-link active">🏠 Lobby</Link>
          <Link to="/leaderboard" className="nav-link">🏆 Leaderboard</Link>
          <Link to="/history"    className="nav-link">📜 History</Link>
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

      <div className="container" style={{ paddingTop: 32, paddingBottom: 32 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Game Lobby</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
              {rooms.filter(r => r.status === 'waiting').length} rooms waiting · Join or create
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Join by code */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                id="join-code"
                className="form-input"
                style={{ width: 130, textTransform: 'uppercase', letterSpacing: 2 }}
                placeholder="ROOM CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
              />
              <button className="btn btn-secondary" onClick={handleJoinByCode}>Join</button>
            </div>
            <button id="btn-create-room" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Create Room
            </button>
          </div>
        </div>

        {/* Create Room Modal */}
        {showCreate && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
            onClick={() => setShowCreate(false)}>
            <div className="card animate-fade-in" style={{ width: 400, padding: 32 }}
              onClick={(e) => e.stopPropagation()}>
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
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
            onClick={() => setShowProfile(false)}>
            <div className="card animate-fade-in" style={{ width: 400, padding: 32 }}
              onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: 20 }}>Customize Profile</h3>
              <form onSubmit={handleUpdateProfile}>
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

        {/* Room Grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <div className="spinner" style={{ width: 48, height: 48 }} />
          </div>
        ) : rooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏟️</div>
            <p>No rooms available. Create one!</p>
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
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: 4 }}>{room.name}</h3>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-secondary)', letterSpacing: 2 }}>
                      {room.code}
                    </div>
                  </div>
                  <StatusBadge status={room.status} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    👥 {room.player_count} / {room.max_players} players
                  </div>
                  {room.status === 'waiting' && (
                    <button
                      id={`btn-join-${room.id}`}
                      className="btn btn-primary btn-sm"
                      onClick={() => handleJoinRoom(room)}
                      disabled={room.player_count >= room.max_players}
                    >
                      {room.player_count >= room.max_players ? 'Full' : '⚔️ Join'}
                    </button>
                  )}
                  {room.status === 'playing' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleJoinRoom(room)}>
                      👁 Spectate
                    </button>
                  )}
                </div>

                {/* Progress bar for room capacity */}
                <div className="hp-bar-bg" style={{ marginTop: 10 }}>
                  <div className="hp-bar-fill"
                    style={{ width: `${(room.player_count / room.max_players) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
