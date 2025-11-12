module.exports = {
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },
  server: {
    port: process.env.PORT || 3000,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
  }
};