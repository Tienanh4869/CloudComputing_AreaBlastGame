const express = require('express');
const router = express.Router();
const speechService = require('../services/speechService');

// GET /api/speech/announce?text=...
router.get('/announce', async (req, res, next) => {
  try {
    const text = req.query.text;
    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    // Call Azure AI Speech to generate the MP3 buffer
    const audioBuffer = await speechService.generateSpeech(text);
    
    // Stream the audio back to the client
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error) {
    console.error('[Speech] TTS Error:', error.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

module.exports = router;
