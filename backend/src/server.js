'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const db = require('./db/db');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
}));
app.use(express.json());

// Health check — placeholder router at /api
const apiRouter = express.Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', apiRouter);

// Feature routes
app.use('/api/config', require('./routes/config'));
app.use('/api/import', require('./routes/import'));
app.use('/api/fifo',   require('./routes/fifo'));
app.use('/api/export', require('./routes/export'));

// Global error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Is the server already running?`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

module.exports = app;
