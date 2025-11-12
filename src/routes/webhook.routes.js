// routes/webhook.routes.js
const express = require('express');
const router = express.Router();

router.post('/call-status', (req, res) => {
  console.log('📞 Call status update:', req.body);
  res.sendStatus(200);
});

router.post('/speech-input', (req, res) => {
  console.log('🎤 User speech input:', req.body);
  res.sendStatus(200);
});

module.exports = router;
