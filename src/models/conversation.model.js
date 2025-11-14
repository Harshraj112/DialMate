const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  speaker: {
    type: String,
    enum: ['ai', 'user'],
    required: true
  },
  text: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },

  // Optional enrichments (intent, sentiment)
  intent: {
    type: String,
    enum: [
      'interested',
      'not_interested',
      'question',
      'objection',
      'ready_to_book',
      'unknown'
    ],
    default: 'unknown'
  },
  sentiment: {
    type: String,
    enum: ['positive', 'neutral', 'negative'],
    default: 'neutral'
  },
  confidence: Number
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  callSid: {
    type: String,
    required: true,
    index: true,
    unique: true
  },

  phoneNumber: {
    type: String,
    index: true
  },

  campaign: {
    type: String,
    index: true
  },

  startTime: {
    type: Date,
    default: Date.now
  },

  endTime: Date,

  duration: Number, // auto-calculated (seconds)

  // All captured messages
  messages: [messageSchema],

  // Final outcome of the call
  outcome: {
    type: String,
    enum: [
      'appointment_booked',
      'not_interested',
      'callback_later',
      'transferred',
      'no_answer',
      'incomplete',
      'unknown'
    ],
    default: 'unknown'
  },

  // Appointment info (if booked)
  appointmentDetails: {
    date: Date,
    time: String,
    notes: String
  },

  interruptions: {
    type: Number,
    default: 0
  },

  // Scores for training/AI improvement
  userSatisfactionScore: Number,    // 1–5
  aiResponseQuality: Number,        // 1–5

  // For self-learning patterns
  successfulPatterns: [String],
  failurePatterns: [String],
  keyPhrases: [String],

  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }

}, { timestamps: true });


// ─────────────────────────────────────────────
// 🔥 PRE-SAVE HOOK — Auto calculate call duration
// ─────────────────────────────────────────────
conversationSchema.pre('save', function (next) {
  if (this.endTime && this.startTime) {
    this.duration = Math.floor((this.endTime - this.startTime) / 1000); // seconds
  }
  next();
});


// ─────────────────────────────────────────────
// 🔥 POST-SAVE HOOK — Auto extract key learning
// ─────────────────────────────────────────────
conversationSchema.post('save', function (doc) {
  try {
    const allTexts = doc.messages.map(m => m.text.toLowerCase());

    // Basic keyword extraction (improve later using GPT)
    const keywords = [];
    const commonWords = ['the', 'and', 'i', 'you', 'is', 'to', 'for', 'um', 'uh'];

    allTexts.forEach(text => {
      text.split(/\s+/).forEach(word => {
        if (word.length > 4 && !commonWords.includes(word)) {
          keywords.push(word);
        }
      });
    });

    doc.keyPhrases = [...new Set(keywords)].slice(0, 20);
  } catch (err) {
    console.error("Keyword extraction failed:", err);
  }
});


// ─────────────────────────────────────────────
// 📊 Indexes for fast analytics
// ─────────────────────────────────────────────
conversationSchema.index({ outcome: 1 });
conversationSchema.index({ campaign: 1, outcome: 1 });
conversationSchema.index({ createdAt: -1 });
conversationSchema.index({ phoneNumber: 1 });
conversationSchema.index({ "messages.intent": 1 });


module.exports = mongoose.model('Conversation', conversationSchema);
