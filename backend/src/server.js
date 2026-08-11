// src/server.js — HTTP + Socket.IO server entry point
const http = require('http');
const { Server: SocketServer } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const env = require('./config/env');
const { PORT, CORS_ORIGIN, NODE_ENV } = env;
const logger = require('./utils/logger');

async function bootstrap() {
  // 0. Load Azure Key Vault secrets (if configured) before DB connection
  if (env.loadKeyVaultSecrets) {
    await env.loadKeyVaultSecrets();
  }

  // These modules read credentials/configuration while being imported.
  // Load them only after Key Vault has populated env to avoid clients being
  // created with stale fallback values (especially the Sequelize password).
  const { initializeAppConfiguration } = require('./config/appConfiguration');
  const { connectDB, sequelize } = require('./config/database');
  const { connectRedis, getPubSub } = require('./config/redis');
  const app = require('./app');
  const { initSocket } = require('./socket');

  // Load dynamic gameplay settings. Failures keep the safe local defaults.
  await initializeAppConfiguration();

  // 1. Connect to PostgreSQL
  await connectDB();

  // 2. Sync DB models (alter: safe for dev, use migrations in prod)
  if (NODE_ENV === 'development') {
    await sequelize.sync({ alter: true });
    logger.info('[DB] Models synced (alter)');
  } else {
    await sequelize.sync({ alter: true }); // Tạm thời bật alter trên production để update DB schema
    logger.info('[DB] Models synced (alter)');
  }

  // 3. Connect to Redis (optional, degrades gracefully)
  await connectRedis();

  // 4. Create HTTP server
  const httpServer = http.createServer(app);

  const io = new SocketServer(httpServer, {
    cors: {
      origin: true, // Dynamically reflect origin to prevent CORS blocking during polling
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Use polling as fallback for environments without WebSocket support
    transports: ['websocket', 'polling'],
  });

  const { useAzureSocketIO } = require("@azure/web-pubsub-socket.io");

  // 5.5 Setup Azure Web PubSub or Redis Adapter
  if (env.WEB_PUBSUB_CONNECTION_STRING) {
    logger.info('[Socket] Configuring Azure Web PubSub for Socket.IO...');
    useAzureSocketIO(io, {
      hub: "ArenaBlastHub",
      connectionString: env.WEB_PUBSUB_CONNECTION_STRING
    });
    logger.info('[Socket] Azure Web PubSub attached');
  } else {
    // Fallback to Redis Adapter if Web PubSub is not configured
    const { pubClient, subClient } = getPubSub();
    if (pubClient && subClient) {
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('[Socket] Redis Adapter attached (Fallback)');
    }
  }

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
  logger.error('[Server] Failed to start', {
    error: err.message,
    code: err.original?.code || err.parent?.code || err.code,
  });
  process.exit(1);
});
