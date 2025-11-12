require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { globalErrHandler, notFound } = require('./middleware/errorHandler');
const callRoutes = require('./routes/call.routes');
const webhookRoutes = require('./routes/webhook.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/calls', callRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 handler (must come after routes)
app.use(notFound);

// Global error handler (must be last)
app.use(globalErrHandler);

app.get('/', (req, res) => {
  res.send('Server is running ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
