const twilioService = require('../services/twilio.service');
const config = require('../config');
const asyncHandler = require('express-async-handler');

class CallController {

  // Make outbound call
  makeOutboundCall = asyncHandler(async (req, res) => {
    console.log('\n📞 [makeOutboundCall] Request received at /api/calls');
    console.log('Request body:', req.body);

    const { phoneNumber, campaign } = req.body;

    // Validate phone number
    if (!phoneNumber || !/^\+?\d{10,15}$/.test(phoneNumber)) {
      console.log('❌ Invalid phone number:', phoneNumber);
      const err = new Error('Invalid phone number');
      err.statusCode = 400;
      throw err; // Goes to global error handler
    }

    console.log('✅ Phone number valid:', phoneNumber);
    console.log('📢 Campaign:', campaign);

    const callbackUrl = `${config.server.baseUrl}/api/calls/incoming`;
    console.log('🔁 Callback URL:', callbackUrl);

    console.log('📤 Initiating call via Twilio...');
    const call = await twilioService.makeCall(phoneNumber, callbackUrl);

    console.log('✅ Twilio call initiated successfully!');
    console.log('🆔 Call SID:', call.sid);
    console.log('📶 Call Status:', call.status);

    res.json({
      success: true,
      callSid: call.sid,
      status: call.status
    });
  });

  // Handle incoming call
  handleIncomingCall = asyncHandler(async (req, res) => {
    console.log('\n📞 [handleIncomingCall] Incoming call webhook hit');
    console.log('Incoming From:', req.body.From);
    console.log('Incoming To:', req.body.To);

    const twiml = twilioService.generateTwiML(
      'Hi! I’m your AI assistant. Please tell me how I can help you today.'
    );

    console.log('🧠 Responding with TwiML...');
    res.type('text/xml');
    res.send(twiml);
  });
}

module.exports = new CallController();
