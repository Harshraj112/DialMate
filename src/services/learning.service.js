const Conversation = require('../models/conversation.model');

class LearningService {

  //------------------------------------------------------
  // 1️⃣ Analyze successful AI conversation patterns
  //------------------------------------------------------
  async analyzeSuccessPatterns() {
    const successful = await Conversation.find({
      outcome: 'appointment_booked'
    });

    if (successful.length === 0) {
      return {
        commonPhrases: {},
        avgDuration: 0,
        avgInterruptions: 0,
        bestTimeOfDay: {},
        topAIPhrases: [],
        topUserIntentPatterns: []
      };
    }

    const patterns = {
      commonPhrases: {},
      avgDuration: 0,
      avgInterruptions: 0,
      bestTimeOfDay: {},
      topAIPhrases: {},
      topUserIntentPatterns: {}
    };

    successful.forEach(conv => {
      const hour = new Date(conv.startTime).getHours();
      patterns.bestTimeOfDay[hour] = (patterns.bestTimeOfDay[hour] || 0) + 1;

      conv.messages.forEach(msg => {
        const words = msg.text.toLowerCase().split(/\s+/);

        // Analyze AI messages
        if (msg.speaker === "ai") {
          // Track phrase usage
          words.forEach(word => {
            if (word.length > 2) {
              patterns.commonPhrases[word] = (patterns.commonPhrases[word] || 0) + 1;
            }
          });

          // Track exact responses that worked
          patterns.topAIPhrases[msg.text] =
            (patterns.topAIPhrases[msg.text] || 0) + 1;
        }

        // Analyze user intent patterns
        if (msg.speaker === "user" && msg.intent) {
          patterns.topUserIntentPatterns[msg.intent] =
            (patterns.topUserIntentPatterns[msg.intent] || 0) + 1;
        }
      });

      patterns.avgDuration += conv.duration || 0;
      patterns.avgInterruptions += conv.interruptions || 0;
    });

    patterns.avgDuration = (patterns.avgDuration / successful.length).toFixed(2);
    patterns.avgInterruptions = (patterns.avgInterruptions / successful.length).toFixed(2);

    // Sort phrases by frequency
    patterns.commonPhrases = Object.fromEntries(
      Object.entries(patterns.commonPhrases)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30) // top 30 words
    );

    // Top 10 working AI responses
    patterns.topAIPhrases = Object.entries(patterns.topAIPhrases)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([text, count]) => ({ text, count }));

    // Top 10 user intents that lead to success
    patterns.topUserIntentPatterns = Object.entries(patterns.topUserIntentPatterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([intent, count]) => ({ intent, count }));

    return patterns;
  }



  //------------------------------------------------------
  // 2️⃣ High-level business insights for your dashboard
  //------------------------------------------------------
  async getInsights() {
    const total = await Conversation.countDocuments();
    const successful = await Conversation.countDocuments({ outcome: "appointment_booked" });
    const rejected = await Conversation.countDocuments({ outcome: "not_interested" });

    const interruptionsAgg = await Conversation.aggregate([
      { $group: { _id: null, avg: { $avg: "$interruptions" } } }
    ]);

    return {
      totalCalls: total,
      successfulCalls: successful,
      rejectedCalls: rejected,
      conversionRate: total > 0 ? ((successful / total) * 100).toFixed(2) + "%" : "0%",
      avgInterruptions: interruptionsAgg[0]?.avg.toFixed(2) || "0"
    };
  }



  //------------------------------------------------------
  // 3️⃣ Export dataset for fine-tuning / training your AI
  //------------------------------------------------------
  async exportTrainingData() {
    const conversations = await Conversation.find({
      outcome: { $in: ["appointment_booked", "not_interested"] }
    });

    return conversations.map(conv => ({
      messages: conv.messages.map(m => ({
        role: m.speaker === "ai" ? "assistant" : "user",
        content: m.text
      })),
      outcome: conv.outcome,
      metadata: {
        duration: conv.duration,
        interruptions: conv.interruptions,
        date: conv.startTime
      }
    }));
  }
}

module.exports = new LearningService();
