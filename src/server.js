require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const WebSocket = require('ws');

// Routes
const callRoutes = require('./routes/call.routes');
const webhookRoutes = require('./routes/webhook.routes');

// Realtime handler
const mediaStreamHandler = require('./realtime/media-stream.handler');

// Error handlers
const { globalErrHandler, notFound } = require('./middleware/globalErrorHandler');

const app = express();
const server = http.createServer(app);

// WebSofcket server for realtime audio
const wss = new WebSocket.Server({
  server,
  path: '/media'
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/calls', callRoutes);
app.use('/api/webhooks', webhookRoutes);
app.post('/api/webhooks/call-status', (req, res) => {
    console.log('Call status webhook hit', req.body);
    res.sendStatus(200); // must respond to Twilio
});
app.post('/api/webhooks/twiml', (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Hello! This is a test call.");
    res.type('text/xml').send(twiml.toString());
});


// Root
app.get('/', (req, res) => {
  res.send('Server is running ✅');
});

// 404 and global error handlers
app.use(notFound);
app.use(globalErrHandler);

// WebSocket Handling
wss.on('connection', (ws, req) => {
  const url = req.url;
  const callSidMatch = url.match(/callSid=([^&]+)/);
  const callSid = callSidMatch ? callSidMatch[1] : null;

  if (!callSid) {
    console.error('❌ No callSid provided in WebSocket connection');
    ws.close();
    return;
  }

  console.log(`📞 WebSocket connected for Call SID: ${callSid}`);
  mediaStreamHandler.handleConnection(ws, callSid);
});

// Start Server
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/media?callSid=XXXX`);
});

// MongoDB connect
mongoose.connect(process.env.MONGO_URI, {
  dbName: process.env.MONGO_DB_NAME || 'ai-calls'
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

console.log("MONGO_URI =", process.env.MONGO_URI);

module.exports = app;
