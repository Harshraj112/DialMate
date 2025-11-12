const express = require('express');
const router = express.Router();
const callController = require('../controllers/call.controller');

// ✅ Make outbound call (POST /api/calls)
router.post('/', callController.makeOutboundCall);

// ✅ Handle incoming call from Twilio (POST /api/calls/incoming)
router.post('/incoming', callController.handleIncomingCall);

module.exports = router;
