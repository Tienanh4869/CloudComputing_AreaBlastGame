// src/server.js — HTTP + Socket.IO server entry point
const http = require('http');
const { Server: SocketServer } = require('socket.io');
const app = require('./app');
const { connectDB, sequelize } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { initSocket } = require('./socket');
const { PORT, CORS_ORIGIN, NODE_ENV } = require('./config/env');
const logger = require('./utils/logger');

async function bootstrap() {
  // 1. Connect to PostgreSQL
  await connectDB();

  // 2. Sync DB models (alter: safe for dev, use migrations in prod)
  if (NODE_ENV === 'development') {
    await sequelize.sync();
    logger.info('[DB] Models synced');
  } else {
    await sequelize.sync();
    logger.info('[DB] Models synced');
  }

  // 3. Connect to Redis (optional, degrades gracefully)
  await connectRedis();

  // 4. Create HTTP server
  const httpServer = http.createServer(app);

  // 5. Setup Socket.IO
  const io = new SocketServer(httpServer, {
    cors: {
      origin: CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Use polling as fallback for environments without WebSocket support
    transports: ['websocket', 'polling'],
  });

  // 6. Initialize game socket handlers
  initSocket(io);

  // 7. Start listening
  httpServer.listen(PORT, () => {
    logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    logger.info(`🎮 ArenaBlast Backend running on port ${PORT}`);
    logger.info(`📡 Environment: ${NODE_ENV}`);
    logger.info(`🌐 CORS origin: ${CORS_ORIGIN}`);
    logger.info(`❤️  Health: http://localhost:${PORT}/health`);
    logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  });

  // 8. Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('[Server] SIGTERM received, shutting down gracefully...');
    httpServer.close(async () => {
      await sequelize.close();
      logger.info('[Server] Shutdown complete');
      process.exit(0);
    });
  });
}

bootstrap().catch((err) => {
  logger.error('[Server] Failed to start:', err);
  process.exit(1);
});
