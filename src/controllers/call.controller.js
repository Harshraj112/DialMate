const twilioService = require('../services/twilio.service');
const config = require('../config');
const asyncHandler = require('express-async-handler');
const twilio = require('twilio');

class CallController {

  //-------------------------------------------------------
  // 1️⃣ MAKE OUTBOUND CALL
  //-------------------------------------------------------
  makeOutboundCall = asyncHandler(async (req, res) => {
    console.log('\n📞 [makeOutboundCall] Request received');
    console.log('Request body:', req.body);

    const { phoneNumber, campaign } = req.body;

    if (!phoneNumber || !/^\+?\d{10,15}$/.test(phoneNumber)) {
      const err = new Error('Invalid phone number');
      err.statusCode = 400;
      throw err;
    }

    console.log('📢 Campaign:', campaign);

    // This URL will return TwiML with media stream
    const twimlCallback = `${config.server.baseUrl}/api/calls/outbound-twiml?campaign=${campaign}`;

    console.log('🔁 TwiML callback URL:', twimlCallback);

    // Call Twilio via twilioService
    const call = await twilioService.makeCall(phoneNumber, twimlCallback);

    res.json({
      success: true,
      callSid: call.sid,
      status: call.status
    });
  });



  //-------------------------------------------------------
  // 2️⃣ TWIML FOR OUTBOUND CALL (MEDIA STREAM STARTS HERE)
  //-------------------------------------------------------
  outboundTwiml = asyncHandler(async (req, res) => {
    console.log('\n📡 [outboundTwiml] Generating TwiML for outbound stream');
    const callSid = req.query.CallSid || req.body.CallSid;

    const twiml = new twilio.twiml.VoiceResponse();

    const start = twiml.start();
    start.stream({
      url: `${config.server.wsUrl}/media?callSid=${callSid}`,
      track: 'both_tracks'
    });

    // Keep call open for 60 seconds — your WebSocket will drive the conversation
    twiml.pause({ length: 60 });

    res.type('text/xml');
    res.send(twiml.toString());
  });



  //-------------------------------------------------------
  // 3️⃣ HANDLE INBOUND CALL (ALSO STARTS MEDIA STREAM)
  //-------------------------------------------------------
  handleIncomingCall = asyncHandler(async (req, res) => {
    console.log('\n📞 [handleIncomingCall] Incoming call detected');
    console.log('Caller:', req.body.From);

    const callSid = req.body.CallSid;

    const twiml = new twilio.twiml.VoiceResponse();

    const start = twiml.start();
    start.stream({
      url: `${config.server.wsUrl}/media?callSid=${callSid}`,
      track: "both_tracks"
    });

    // AI will speak using TTS from websocket side
    twiml.pause({ length: 60 });

    res.type('text/xml');
    res.send(twiml.toString());
  });
}

module.exports = new CallController();
