// src/api/speech.js — Utility for calling the Azure AI Speech Announcer

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Calls the backend TTS endpoint and plays the audio directly.
 * We don't use axios here because we want to load it into an HTML Audio element natively.
 * 
 * @param {string} text - The text to be announced (e.g. "Double Kill!")
 */
export const playAnnouncer = (text) => {
  if (!text) return;
  
  try {
    const url = `${API_BASE}/speech/announce?text=${encodeURIComponent(text)}`;
    const audio = new Audio(url);
    
    // Play the audio and catch any auto-play policy errors
    audio.play().catch(err => {
      console.warn('[Announcer] Auto-play prevented or error playing audio:', err);
    });
  } catch (error) {
    console.error('[Announcer] Error:', error);
  }
};
