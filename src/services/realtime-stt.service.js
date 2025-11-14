const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const config = require('../config');

class RealtimeSTTService {
  constructor() {
    this.deepgram = createClient(config.deepgram.apiKey);
  }

  /**
   * Creates a real-time STT connection
   * @param {Function} onTranscript - final sentences
   * @param {Function} onInterruption - when user interrupts AI speaking
   * @param {Function} onVad - silence / start / stop events 
   * @returns websocket connection
   */
  createLiveConnection(onTranscript, onInterruption, onVad) {
    const connection = this.deepgram.listen.live({
      model: 'nova-2-phonecall',    // Best for phone calls
      language: 'en',
      smart_format: true,
      interim_results: true,
      encoding: 'mulaw',
      sample_rate: 8000,
      channels: 1,
      endpointing: 300,             // VAD silence detection (ms)
      vad_events: true              // Emits start/stop talking events
    });

    let isUserSpeaking = false;
    let aiIsTalking = false;

    // Allow controller to pause AI talk
    this.setAIState = (state) => {
      aiIsTalking = state;
    };

    // 1) Deepgram connection open
    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('🎤 Deepgram STT connection opened');
    });

    // 2) Voice Activity Events (optional)
    connection.on(LiveTranscriptionEvents.Vad, (event) => {
      if (onVad) onVad(event);
    });

    // 3) Transcription events
    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data?.channel?.alternatives?.[0]?.transcript;

      if (!transcript) return;

      // Detect user interrupting AI's voice
      if (aiIsTalking && transcript.trim().length > 0) {
        console.log('⚠️ User is interrupting AI');
        if (onInterruption) onInterruption();
      }

      // Process only final transcripts
      if (data.is_final && transcript.trim().length > 0) {
        console.log('👤 User (final):', transcript.trim());

        if (onTranscript) {
          onTranscript({
            text: transcript.trim(),
            confidence: data.channel.alternatives[0].confidence,
            isFinal: true
          });
        }
      }
    });

    // 4) Error events
    connection.on(LiveTranscriptionEvents.Error, (err) => {
      console.error('❌ Deepgram STT Error:', err);
    });

    // 5) Close events
    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('🔌 Deepgram STT connection closed');
    });

    return connection;
  }
}

module.exports = new RealtimeSTTService();
