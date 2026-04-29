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
