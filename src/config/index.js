require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    baseUrl: process.env.BASE_URL || 'https://localhost.com'
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },
  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ringg-clone'
  }
};