// src/realtime/media-stream.handler.js

const realtimeSTT = require('../services/realtime-stt.service');
const gptService = require('../services/gpt.service');
const ttsService = require('../services/tts-stream.service');
const Conversation = require('../models/conversation.model');

class MediaStreamHandler {
  constructor() {
    // Active call states
    this.activeCalls = new Map();

    // Per-call processing mutex (prevents concurrent GPT/TTS for same call)
    this.processingPromises = new Map();

    // Configurable backpressure threshold (bytes queued on socket)
    this.WS_BUFFER_THRESHOLD = 500_000; // tune this value (500 KB)
    this.STT_RECONNECT_DELAY = 1000; // ms, initial reconnect delay
  }

  /**
   * Entry point called when Twilio opens a websocket and provides callSid
   * @param {WebSocket} ws
   * @param {string} callSid
   */
  handleConnection(ws, callSid) {
    if (!callSid) {
      console.warn('Missing callSid for connection - rejecting');
      ws.close();
      return;
    }

    console.log(`📞 New call websocket connected: ${callSid}`);

    const callState = {
      callSid,
      streamSid: null,
      sttConnection: null,
      currentTTSStream: null,
      isAISpeaking: false,
      conversationLog: [],
      interruptions: 0,
      startTime: new Date(),
      lastUserTranscriptAt: 0,
      closed: false,
      reconnectAttempts: 0
    };

    this.activeCalls.set(callSid, callState);

    // initialize DB and GPT memory
    this.initializeConversationDB(callSid).catch(err => console.error('DB init failed:', err));
    gptService.initializeConversation(callSid, this.getSystemPrompt());

    // Attach WS handlers
    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message);
        await this.handleTwilioMessage(ws, callState, msg);
      } catch (err) {
        console.error('WebSocket message parse/handle error:', err);
      }
    });

    ws.on('close', () => {
      callState.closed = true;
      this.handleCallEnd(callState).catch(e => console.error('handleCallEnd error:', e));
    });

    ws.on('error', (err) => {
      console.warn('WebSocket error for call', callSid, err);
    });
  }

  /**
   * Router for events from Twilio media stream
   */
  async handleTwilioMessage(ws, callState, msg) {
    if (!msg || !msg.event) {
      console.warn('Invalid Twilio message', msg);
      return;
    }

    switch (msg.event) {
      case 'start':
        if (!msg.start || !msg.start.streamSid) {
          console.warn('Invalid start payload', msg);
          return;
        }
        await this.handleStart(ws, callState, msg).catch(err => console.error('handleStart error:', err));
        break;

      case 'media':
        await this.handleMedia(callState, msg).catch(err => console.error('handleMedia error:', err));
        break;

      case 'stop':
        await this.handleStop(callState).catch(err => console.error('handleStop error:', err));
        break;

      default:
        console.warn('Unhandled Twilio event:', msg.event);
    }
  }

  /**
   * Called when Twilio sends the 'start' event
   */
  async handleStart(ws, callState, msg) {
    callState.streamSid = msg.start.streamSid;
    console.log(`🎬 Stream started for call ${callState.callSid} (streamSid=${callState.streamSid})`);

    // Create real-time STT connection with callbacks
    const createSTT = () => {
      try {
        callState.sttConnection = realtimeSTT.createLiveConnection(
          // onTranscript (final)
          async (transcriptObj) => {
            // transcriptObj can be { text, confidence, isFinal } (per realtime-stt.service)
            await this.onUserSpeech(ws, callState, transcriptObj).catch(e => console.error('onUserSpeech error:', e));
          },
          // onInterruption
          () => {
            this.onUserInterruption(callState);
          },
          // onVad (optional)
          (vadEvent) => {
            // vadEvent can be used to detect start/stop voice; not required to act on here
            // console.debug('VAD:', vadEvent);
          }
        );
        callState.reconnectAttempts = 0;
      } catch (err) {
        console.error('Failed to create STT connection:', err);
        // schedule a reconnect
        callState.reconnectAttempts = (callState.reconnectAttempts || 0) + 1;
        setTimeout(() => {
          if (!callState.closed) createSTT();
        }, Math.min(this.STT_RECONNECT_DELAY * callState.reconnectAttempts, 10_000));
      }
    };

    createSTT();

    // Send initial AI greeting
    await this.sendAIGreeting(ws, callState).catch(err => console.error('sendAIGreeting error:', err));
  }

  /**
   * Main handler for incoming media audio chunks from Twilio
   */
  async handleMedia(callState, msg) {
    try {
      if (!callState.sttConnection) {
        // STT not ready yet; try to ignore/queue if necessary
        return;
      }

      const payloadB64 = msg.media && msg.media.payload;
      if (!payloadB64) return;

      const audioChunk = Buffer.from(payloadB64, 'base64');

      // Send raw audio to STT connection - Deepgram (or whichever STT) handles it
      try {
        callState.sttConnection.send(audioChunk);
      } catch (err) {
        console.warn('STT send error, attempting reconnect:', err);
        // attempt to reconnect STT once
        if (!callState.closed) {
          try {
            callState.sttConnection.finish?.();
          } catch (_) {}
          // recreate connection
          if (realtimeSTT && typeof realtimeSTT.createLiveConnection === 'function') {
            callState.sttConnection = realtimeSTT.createLiveConnection(
              async (transcriptObj) => { await this.onUserSpeech(null, callState, transcriptObj); },
              () => { this.onUserInterruption(callState); }
            );
          }
        }
      }
    } catch (err) {
      console.error('handleMedia top-level error:', err);
    }
  }

  /**
   * Called when Twilio sends 'stop' indicating call ended
   */
  async handleStop(callState) {
    console.log(`📞 Received stop for call ${callState.callSid}`);
    try {
      if (callState.sttConnection && typeof callState.sttConnection.finish === 'function') {
        try {
          await callState.sttConnection.finish();
        } catch (e) {
          console.warn('Error finishing STT connection:', e);
        }
      }
    } catch (err) {
      console.error('handleStop error:', err);
    }
  }

  /**
   * Send greeting at call start. Makes TTS abortable and stores handle.
   */
  async sendAIGreeting(ws, callState) {
    const greeting = "Hi! This is Sarah calling from TechSolutions. How are you doing today?";
    console.log(`🤖 AI (greeting): ${greeting}`);

    // Log AI message
    await this.logMessage(callState.callSid, 'ai', greeting).catch(e => console.error('logMessage error:', e));

    // Mark AI as speaking
    callState.isAISpeaking = true;

    // Stream TTS and keep handle to abort if interrupted
    try {
      const ttsHandle = await ttsService.streamSpeech(
        greeting,
        (audioChunk) => {
          // If AI is no longer speaking (interrupted), skip sending
          if (!callState.isAISpeaking) return;
          // check websocket state & backpressure
          if (!ws || ws.readyState !== ws.OPEN) return;
          if (ws.bufferedAmount > this.WS_BUFFER_THRESHOLD) {
            // skip chunk to relieve backpressure
            return;
          }

          // send chunk to Twilio
          try {
            ws.send(JSON.stringify({
              event: 'media',
              streamSid: callState.streamSid,
              media: { payload: audioChunk.toString('base64') }
            }));
          } catch (err) {
            console.warn('Failed sending TTS chunk to Twilio:', err);
          }
        },
        () => {
          // On complete
          callState.isAISpeaking = false;
          callState.currentTTSStream = null;
        }
      );

      // If TTS service returns an abortable handle (stream or controller), store it
      if (ttsHandle) callState.currentTTSStream = ttsHandle;
    } catch (err) {
      console.error('Error streaming greeting TTS:', err);
      callState.isAISpeaking = false;
    }
  }

  /**
   * Called whenever STT returns a final user transcript.
   * This serializes processing per-call to avoid concurrent GPT/TTS calls.
   * transcriptObj may be { text, confidence, isFinal } or plain string
   */
  async onUserSpeech(ws, callState, transcriptObj) {
    try {
      const text = (typeof transcriptObj === 'string') ? transcriptObj : (transcriptObj?.text || '');
      if (!text || text.trim().length < 2) return;

      const now = Date.now();
      // Prevent spamming repeated transcripts (e.g., same final text sent twice)
      if (callState.lastUserTranscriptAt && (now - callState.lastUserTranscriptAt) < 400) {
        // too soon after previous transcript
        // optionally check content equality to dedupe
        return;
      }
      callState.lastUserTranscriptAt = now;

      // Debounce: if currently processing, skip / optionally queue
      if (this.processingPromises.get(callState.callSid)) {
        console.log('Processing in progress for call, skipping transcript to avoid overlap');
        return;
      }

      // Create processing promise and store in map (per-call mutex)
      const processing = (async () => {
        try {
          // Stop AI TTS if still playing (should already be handled by interruption, but ensure)
          if (callState.isAISpeaking) {
            this._stopCurrentTTS(callState);
            callState.isAISpeaking = false;
          }

          // Log user message (persist immediately)
          await this.logMessage(callState.callSid, 'user', text, {}).catch(e => console.error('logMessage user error:', e));

          // Intent analysis (non-blocking could be performed after reply, but we do it here)
          const analysis = await gptService.analyzeIntent(text).catch(err => {
            console.error('analyzeIntent error:', err);
            return { intent: 'unknown', sentiment: 'neutral', entities: {} };
          });
          console.log('📊 Intent:', analysis);

          // Generate the AI reply (this uses per-call history in GPTService)
          const aiResponse = await gptService.generateResponse(callState.callSid, text).catch(err => {
            console.error('generateResponse error:', err);
            return "Sorry, could you repeat that?";
          });

          console.log(`🤖 AI reply: ${aiResponse}`);

          // Log AI response with the analysis result
          await this.logMessage(callState.callSid, 'ai', aiResponse, analysis).catch(e => console.error('logMessage ai error:', e));

          // Mark AI speaking and stream TTS (abortable)
          callState.isAISpeaking = true;
          try {
            const ttsHandle = await ttsService.streamSpeech(
              aiResponse,
              (audioChunk) => {
                if (!callState.isAISpeaking) return;
                if (!ws || ws.readyState !== ws.OPEN) return;
                if (ws.bufferedAmount > this.WS_BUFFER_THRESHOLD) {
                  // skip chunk if we have too much queued
                  return;
                }
                try {
                  ws.send(JSON.stringify({
                    event: 'media',
                    streamSid: callState.streamSid,
                    media: { payload: audioChunk.toString('base64') }
                  }));
                } catch (err) {
                  console.warn('Failed sending TTS chunk to Twilio (during reply):', err);
                }
              },
              () => {
                callState.isAISpeaking = false;
                callState.currentTTSStream = null;
              }
            );

            if (ttsHandle) callState.currentTTSStream = ttsHandle;
          } catch (ttsErr) {
            console.error('TTS streaming error for AI reply:', ttsErr);
            callState.isAISpeaking = false;
            callState.currentTTSStream = null;
          }

        } catch (err) {
          console.error('Error processing user speech:', err);
        } finally {
          // release mutex
          this.processingPromises.delete(callState.callSid);
        }
      })();

      this.processingPromises.set(callState.callSid, processing);
      await processing;
    } catch (err) {
      console.error('onUserSpeech top-level error:', err);
    }
  }

  /**
   * When Deepgram (or STT) signals interruption, stop TTS immediately
   */
  onUserInterruption(callState) {
    try {
      if (callState.isAISpeaking) {
        console.log('⚠️ User interrupted AI (callSid=%s)', callState.callSid);
        callState.isAISpeaking = false;
        callState.interruptions = (callState.interruptions || 0) + 1;

        // stop TTS stream if we have a handle
        this._stopCurrentTTS(callState);
      } else {
        // user started speaking while AI not speaking — nothing to stop
      }
    } catch (err) {
      console.error('onUserInterruption error:', err);
    }
  }

  /**
   * Attempts to stop/abort the current TTS stream in a best-effort way
   */
  _stopCurrentTTS(callState) {
    try {
      const h = callState.currentTTSStream;
      if (!h) return;

      // Common interfaces: Node stream (destroy), custom stopper (stop), or AbortController
      if (typeof h.destroy === 'function') {
        try { h.destroy(); } catch (e) { /* ignore */ }
      } else if (typeof h.stop === 'function') {
        try { h.stop(); } catch (e) { /* ignore */ }
      } else if (h.abort && typeof h.abort === 'function') {
        try { h.abort(); } catch (e) { /* ignore */ }
      } else if (h.controller && typeof h.controller.abort === 'function') {
        try { h.controller.abort(); } catch (e) { /* ignore */ }
      } else {
        // can't stop; clear reference and allow TTS to finish but ensure we won't send further chunks
      }

      callState.currentTTSStream = null;
    } catch (err) {
      console.warn('Failed to stop current TTS stream:', err);
      callState.currentTTSStream = null;
    }
  }

  /**
   * Initialize Conversation DB (upsert)
   */
  async initializeConversationDB(callSid, phoneNumber = null, campaign = null) {
    try {
      await Conversation.findOneAndUpdate(
        { callSid },
        { $setOnInsert: { callSid, phoneNumber, campaign, startTime: new Date(), messages: [] } },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error('initializeConversationDB DB error:', err);
      throw err;
    }
  }

  /**
   * Append a message to conversation document. Uses upsert to be safe.
   * analysis may contain { intent, sentiment, entities }
   */
  async logMessage(callSid, speaker, text, analysis = {}) {
    if (!callSid || !text) return;
    try {
      await Conversation.findOneAndUpdate(
        { callSid },
        {
          $push: {
            messages: {
              speaker,
              text,
              intent: analysis?.intent || 'unknown',
              sentiment: analysis?.sentiment || 'neutral',
              confidence: analysis?.confidence || null,
              timestamp: new Date()
            }
          }
        },
        { upsert: true }
      );
    } catch (err) {
      console.error('logMessage DB error:', err);
    }
  }

  /**
   * Called when call ends / WS closes
   */
  async handleCallEnd(callState) {
    try {
      const duration = Math.floor((new Date() - callState.startTime) / 1000);

      // Ensure STT finished
      try {
        if (callState.sttConnection && typeof callState.sttConnection.finish === 'function') {
          await callState.sttConnection.finish();
        }
      } catch (e) {
        console.warn('Error finishing STT on call end:', e);
      }

      // Attempt to stop TTS
      this._stopCurrentTTS(callState);

      // Update final conversation record
      await Conversation.findOneAndUpdate(
        { callSid: callState.callSid },
        {
          $set: {
            endTime: new Date(),
            duration,
            interruptions: callState.interruptions || 0
          }
        },
        { upsert: true }
      );

      // Clear GPT memory
      try { gptService.clearConversation(callState.callSid); } catch (e) { /* ignore */ }

      // Remove state
      this.activeCalls.delete(callState.callSid);
      this.processingPromises.delete(callState.callSid);

      console.log(`✅ Call finalized: ${callState.callSid} (duration ${duration}s, interruptions ${callState.interruptions})`);
    } catch (err) {
      console.error('handleCallEnd error:', err);
    }
  }

  /**
   * System prompt for GPT initialization
   */
  getSystemPrompt() {
    return `You are Sarah, a professional sales representative from TechSolutions.

PERSONALITY:
- Warm and friendly
- Professional but conversational
- Empathetic listener
- Natural speaker (use "um", "well", etc. occasionally)

RULES:
- Keep responses under 25 words
- Ask ONE question at a time
- If interrupted, acknowledge smoothly: "Oh sorry, go ahead" or "Yes, I'm listening"
- Match customer's energy level
- Never sound scripted

GOALS:
1. Build rapport
2. Understand customer needs
3. Book a demo appointment

CONVERSATION FLOW:
1. Greeting + quick intro
2. Permission to continue ("Is now a good time?")
3. Discover pain points
4. Present solution briefly
5. Book appointment

Handle objections gracefully. If they're not interested, ask if you can follow up later.`;
  }
}

module.exports = new MediaStreamHandler();
