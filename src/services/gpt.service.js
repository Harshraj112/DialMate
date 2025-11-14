const OpenAI = require('openai');
const config = require('../config');

class GPTService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });

    // Each call gets its own memory
    this.conversationHistory = new Map();
  }

  /**
   * Initialize AI behavior per call
   */
  initializeConversation(callSid, systemPrompt) {
    const defaultPrompt = `
You are a **human-like AI caller** making outbound calls.
Speak in a natural tone with SHORT responses (1 sentence).

Rules:
- Start with a friendly greeting
- Use filler words sometimes (“umm”, “well”, “you know”)
- Stop immediately if the human interrupts
- After interruption, respond naturally (“Oh sorry, go ahead”)
- Ask **one question at a time**
- Never speak more than 8 seconds
- Keep tone warm and conversational
- Do not sound like a robot
- No long explanations
- Your job: determine interest, answer objections, and try to book a meeting.
`;

    this.conversationHistory.set(callSid, [
      { role: 'system', content: systemPrompt || defaultPrompt }
    ]);
  }

  /**
   * Main response generator for human voice input
   */
  async generateResponse(callSid, userMessage) {
    let history = this.conversationHistory.get(callSid);

    // If no history yet, initialize
    if (!history) {
      this.initializeConversation(callSid);
      history = this.conversationHistory.get(callSid);
    }

    // Store what user said
    history.push({
      role: 'user',
      content: userMessage
    });

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // CHEAPER & faster → best for phone calls
        messages: history,
        max_tokens: 60,
        temperature: 0.75,
        presence_penalty: 0.4,
        frequency_penalty: 0.3,
      });

      const answer = completion.choices[0].message.content;

      // Save AI reply
      history.push({
        role: 'assistant',
        content: answer
      });

      // Keep history lightweight
      if (history.length > 18) {
        history = [history[0], ...history.slice(-16)];
      }

      this.conversationHistory.set(callSid, history);

      return answer;
    } catch (err) {
      console.error("GPT error:", err);
      return "Sorry, I missed that — could you say that again?";
    }
  }

  /**
   * AI Intent Extraction / Call Notes
   */
  async analyzeIntent(userMessage) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `
                Analyze a phone call message.
                Return JSON:
                {
                "intent": "interested / not_interested / question / objection / ready_to_book / chit_chat",
                "sentiment": "positive / neutral / negative",
                "entities": { "name": "", "time": "", "date": "", "company": "" }
                }`
            },
            { role: "user", content: userMessage }
        ],
        temperature: 0.2
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (err) {
      console.error("Intent analysis error:", err);

      return {
        intent: "unknown",
        sentiment: "neutral",
        entities: {}
      };
    }
  }

  /**
   * Reset history when call ends
   */
  clearConversation(callSid) {
    this.conversationHistory.delete(callSid);
  }

  getConversationHistory(callSid) {
    return this.conversationHistory.get(callSid) || [];
  }
}

module.exports = new GPTService();
