// src/pages/RegisterPage.jsx — Registration screen
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { register, uploadImage } from '../api/auth';
import useAuthStore from '../store/authStore';

const COLORS = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#E91E63'];

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [form, setForm] = useState({
    username: '', email: '', password: '', nickname: '', avatar_color: COLORS[1],
    avatar_url: '', weapon_url: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((err) => ({ ...err, [e.target.name]: '' }));
  };

  const handleFileChange = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          setLoading(true);
          const { data } = await uploadImage(reader.result, type);
          setForm((f) => ({ ...f, [type]: data.url }));
          toast.success('Image uploaded!');
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to upload image');
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error('File read error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    try {
      const { data } = await register(form);
      setAuth(data);
      toast.success('Account created! Welcome to the arena! 🎮');
      navigate('/lobby');
    } catch (err) {
      const details = err.response?.data?.details;
      if (details) {
        const fieldErrors = {};
        details.forEach((d) => { fieldErrors[d.param || d.path || 'general'] = d.msg || d.message; });
        setErrors(fieldErrors);
      }
      const msg = err.response?.data?.error || 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>⚔️</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900 }}>
            <span className="gradient-text">ArenaBlast</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Create your warrior account</p>
        </div>

        <div className="card animate-fade-in" style={{ padding: 36 }}>
          <h2 style={{ marginBottom: 24, fontSize: '1.3rem' }}>Create Account</h2>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input id="reg-username" className="form-input" type="text" name="username"
                  value={form.username} onChange={handleChange} placeholder="login_name" required />
                {errors.username && <span className="form-error">{errors.username}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Nickname (in-game)</label>
                <input id="reg-nickname" className="form-input" type="text" name="nickname"
                  value={form.nickname} onChange={handleChange} placeholder="DragonSlayer" required />
                {errors.nickname && <span className="form-error">{errors.nickname}</span>}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input id="reg-email" className="form-input" type="email" name="email"
                value={form.email} onChange={handleChange} placeholder="you@example.com" required />
              {errors.email && <span className="form-error">{errors.email}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input id="reg-password" className="form-input" type="password" name="password"
                value={form.password} onChange={handleChange} placeholder="Min. 6 characters" required />
              {errors.password && <span className="form-error">{errors.password}</span>}
            </div>

            {/* Image Customization */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Avatar Image (Optional)</label>
                <input className="form-input" type="file" accept="image/*"
                  onChange={(e) => handleFileChange(e, 'avatar_url')} />
                {form.avatar_url && <img src={form.avatar_url} alt="Avatar" style={{ height: 40, marginTop: 8 }} />}
              </div>
              <div className="form-group">
                <label className="form-label">Weapon Image (Optional)</label>
                <input className="form-input" type="file" accept="image/*"
                  onChange={(e) => handleFileChange(e, 'weapon_url')} />
                {form.weapon_url && <img src={form.weapon_url} alt="Weapon" style={{ height: 40, marginTop: 8 }} />}
              </div>
            </div>

            {/* Color picker fallback */}
            <div className="form-group">
              <label className="form-label">Avatar Color</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, avatar_color: c }))}
                    style={{
                      width: 32, height: 32, borderRadius: '50%', background: c,
                      border: form.avatar_color === c ? '3px solid white' : '3px solid transparent',
                      cursor: 'pointer', transition: 'transform 0.15s',
                      transform: form.avatar_color === c ? 'scale(1.2)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </div>

            <button id="btn-register" type="submit" className="btn btn-primary btn-full btn-lg"
              disabled={loading} style={{ marginTop: 8 }}>
              {loading ? 'Creating account...' : '🚀 Join the Arena'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent-primary)', fontWeight: 600, textDecoration: 'none' }}>
              Sign in →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
