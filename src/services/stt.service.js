const OpenAI = require('openai');
const fs = require('fs');
const fetch = require('node-fetch');   // IMPORTANT FIX
const wav = require('node-wav');       // For Twilio media stream fixes

class STTService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  // Transcribe from file path
  async transcribeFile(audioFilePath) {
    try {
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: "whisper-1",
        language: "en",
        response_format: "json",
        temperature: 0.1
      });

      return transcription.text;
    } catch (error) {
      console.error('Whisper STT Error:', error);
      throw error;
    }
  }

  // Transcribe from audio buffer
  async transcribeBuffer(audioBuffer) {
    try {
      const tempFile = `/tmp/audio_${Date.now()}.wav`;

      // fix: encode buffer into proper WAV
      const wavData = wav.encode([audioBuffer], {
        sampleRate: 16000,
        float: false,
        bitDepth: 16
      });

      fs.writeFileSync(tempFile, wavData);

      const transcription = await this.transcribeFile(tempFile);

      fs.unlinkSync(tempFile);

      return transcription;

    } catch (error) {
      console.error('Buffer transcription error:', error);
      throw error;
    }
  }

  // Transcribe from URL
  async transcribeFromUrl(audioUrl) {
    try {
      const response = await fetch(audioUrl);
      const buffer = await response.buffer();

      return await this.transcribeBuffer(buffer);
    } catch (error) {
      console.error('URL transcription error:', error);
      throw error;
    }
  }
}

module.exports = new STTService();
