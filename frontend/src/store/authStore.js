// src/store/authStore.js — Zustand store for authentication state
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set, get) => ({
      token:  null,
      user:   null,
      player: null,
      isAuthenticated: false,

      // Set auth data after login/register
      setAuth: ({ token, user, player }) => {
        set({ token, user, player, isAuthenticated: true });
      },

      // Update player profile (nickname change, etc.)
      setPlayer: (player) => set({ player }),

      // Clear auth on logout
      logout: () => {
        set({ token: null, user: null, player: null, isAuthenticated: false });
      },

      // Check if user has admin role
      isAdmin: () => get().user?.role === 'admin',
    }),
    {
      name: 'arenablast-auth',   // localStorage key
      partialize: (state) => ({  // Only persist these fields
        token: state.token,
        user:  state.user,
        player: state.player,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;
