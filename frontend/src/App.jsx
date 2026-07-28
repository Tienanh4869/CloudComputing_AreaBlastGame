// src/App.jsx — Root component with routing and auth guard
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useAuthStore from './store/authStore';

// Pages
import LoginPage      from './pages/LoginPage';
import RegisterPage   from './pages/RegisterPage';
import LobbyPage      from './pages/LobbyPage';
import GamePage       from './pages/GamePage';
import LeaderboardPage from './pages/LeaderboardPage';
import HistoryPage    from './pages/HistoryPage';

/**
 * Protected route — redirect to /login if not authenticated.
 */
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
};

/**
 * Public route — redirect to /lobby if already authenticated.
 */
const PublicRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/lobby" replace />;
  return children;
};

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

      {/* Protected routes */}
      <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
      <Route path="/game/:roomId" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
      <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/lobby" replace />} />
      <Route path="*" element={<Navigate to="/lobby" replace />} />
    </Routes>
  );
}
