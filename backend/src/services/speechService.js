const sdk = require("microsoft-cognitiveservices-speech-sdk");
const config = require('../config/env');

/**
 * Generate speech (audio buffer) from text using Azure AI Speech
 * @param {string} text - The text to synthesize
 * @returns {Promise<Buffer>} - Resolves with MP3 audio buffer
 */
const generateSpeech = (text) => {
  return new Promise((resolve, reject) => {
    if (!config.AZURE_SPEECH_KEY || !config.AZURE_SPEECH_REGION) {
      return reject(new Error("Azure Speech configuration is missing from environment/Key Vault."));
    }

    // Configure Speech SDK
    const speechConfig = sdk.SpeechConfig.fromSubscription(config.AZURE_SPEECH_KEY, config.AZURE_SPEECH_REGION);
    
    // Choose a dynamic announcer voice (GuyNeural is a good energetic American male voice)
    speechConfig.speechSynthesisVoiceName = "en-US-GuyNeural"; 
    
    // Set output format to MP3
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    // Set audioConfig to null because we want the audio stream, not play to local speaker
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    synthesizer.speakTextAsync(
      text,
      (result) => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          // Convert ArrayBuffer to Node.js Buffer
          const buffer = Buffer.from(result.audioData);
          synthesizer.close();
          resolve(buffer);
        } else {
          synthesizer.close();
          reject(new Error("Speech synthesis failed or was canceled: " + result.errorDetails));
        }
      },
      (error) => {
        synthesizer.close();
        reject(error);
      }
    );
  });
};

module.exports = {
  generateSpeech
};
