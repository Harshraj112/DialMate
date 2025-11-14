const twilio = require('twilio');
const config = require('../config');

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

class TwilioService {
  
  // Make outbound call
  async makeCall(toNumber, callbackUrl) {
    try {
      const call = await client.calls.create({
        to: toNumber,
        from: config.twilio.phoneNumber,
        url: callbackUrl, // TwiML instructions
        statusCallback: `${config.server.baseUrl}/api/webhooks/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });
      
      return call;
    } catch (error) {
      console.error('Error making call:', error);
      throw error;
    }
  }

  // Generate TwiML for call flow
  generateTwiML(message) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();

    response.say("Hello! This is a test call.");
    res.type('text/xml').send(response.toString());

    console.log(config.server.baseUrl);
    // const gather = response.gather({
    //     input: 'speech',
    //     action: `${config.server.baseUrl}/api/webhooks/speech-input`,
    //     language: 'en-US',
    //     speechTimeout: 'auto'
    // });

    // gather.say({
    //     voice: 'alice'
    // }, message || 'Please tell me how I can help you today.');

    // return response.toString();
  }


  // Start media stream for real-time audio
  generateMediaStreamTwiML(websocketUrl) {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    
    response.say('Please wait while I connect you.');
    
    const start = response.start();
    start.stream({
      url: websocketUrl
    });
    
    response.pause({ length: 60 });
    
    return response.toString();
  }
}

module.exports = new TwilioService();