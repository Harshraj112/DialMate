const OpenAI = require('openai');
const config = require('../config');
const { Readable } = require('stream');

// For PCM → MULAW conversion
const mulaw = require('mulaw-js');

class TTSStreamService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
  }

  /**
   * Stream TTS audio from OpenAI and send chunks in real-time
   * @param {string} text - AI text to speak
   * @param {function(Buffer):void} onChunk - Called for each audio chunk
   * @param {function():void} onComplete - Called when speech ends
   */
  async streamSpeech(text, onChunk, onComplete) {
    try {
      console.log(`🔊 Generating TTS for: "${text}"`);

      const response = await this.openai.audio.speech.withStream().create({
        model: "gpt-4o-mini-tts",     // BEST model for phone calls
        voice: "fable",               // You requested "fable"
        format: "wav",                // PCM in WAV wrapper
        input: text
      });

      const stream = Readable.from(response.toReadableStream());

      stream.on("data", (pcmChunk) => {
        try {
          // Convert PCM → MULAW (8000hz, 8bit)
          const mulawChunk = mulaw.encode(pcmChunk);

          onChunk(mulawChunk); // Send to Twilio
        } catch (err) {
          console.error("⚠️ MULAW encoding error:", err);
        }
      });

      stream.on("end", () => {
        console.log("🔊 TTS streaming finished");
        onComplete();
      });

      stream.on("error", (error) => {
        console.error("❌ TTS stream error:", error);
        onComplete();
      });

    } catch (error) {
      console.error("❌ TTS Error:", error);
      onComplete();
      return null;
    }
  }

  /**
   * Synchronous TTS → MULAW conversion for short responses
   */
  async convertToMulaw(text) {
    console.log("🎙️ Generating non-stream TTS…");

    const response = await this.openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "fable",
      format: "wav",
      input: text
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    // Convert PCM → MULAW
    return mulaw.encode(buffer);
  }
}

module.exports = new TTSStreamService();
