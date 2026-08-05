// src/config/env.js — Centralized environment config with validation
require('dotenv').config();
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const thresholdFromEnv = (key, fallback) => {
  const value = Number.parseFloat(process.env[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, 0), 1);
};

const required = (key) => {
  const val = process.env[key];
  if (!val) {
    console.warn(`[Config] Warning: ${key} is not set, using default.`);
  }
  return val;
};

const config = {
  // Server
  PORT: parseInt(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD: process.env.NODE_ENV === 'production',

  // Database
  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'arenablast',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  },

  // Redis
  REDIS: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Game settings
  GAME: {
    tickRate: parseInt(process.env.GAME_TICK_RATE) || 30,
    mapWidth: parseInt(process.env.MAP_WIDTH) || 3500,
    mapHeight: parseInt(process.env.MAP_HEIGHT) || 3500,
    particleCount: parseInt(process.env.PARTICLE_COUNT) || 150,
    playerSpeed: parseFloat(process.env.PLAYER_SPEED) || 3.5,
    playerHp: parseInt(process.env.PLAYER_HP) || 100,
    slashCooldownMs: parseInt(process.env.SLASH_COOLDOWN_MS) || 800,
    sizeIncreasePerLevel: parseFloat(process.env.SIZE_INCREASE_PER_LEVEL) || 0.04,
    maxPlayerSizeMultiplier: parseFloat(process.env.MAX_PLAYER_SIZE_MULTIPLIER) || 2.0,
    particleScore: parseInt(process.env.PARTICLE_SCORE) || 10,
  },

  // Azure Application Insights
  APP_INSIGHTS_CONNECTION: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || null,

  // Azure Storage
  AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING || null,

  // Azure Computer Vision image moderation
  AZURE_VISION_ENDPOINT: process.env.AZURE_VISION_ENDPOINT || null,
  AZURE_VISION_KEY: process.env.AZURE_VISION_KEY || null,
  AZURE_VISION_MODERATION_ENABLED: process.env.AZURE_VISION_MODERATION_ENABLED === 'true',
  AZURE_VISION_ADULT_THRESHOLD: thresholdFromEnv('AZURE_VISION_ADULT_THRESHOLD', 0.6),
  AZURE_VISION_RACY_THRESHOLD: thresholdFromEnv('AZURE_VISION_RACY_THRESHOLD', 0.7),
  AZURE_VISION_GORE_THRESHOLD: thresholdFromEnv('AZURE_VISION_GORE_THRESHOLD', 0.6),

  // Azure Service Bus
  SERVICE_BUS_CONNECTION_STRING: process.env.SERVICE_BUS_CONNECTION_STRING || null,

  // Azure Web PubSub
  WEB_PUBSUB_CONNECTION_STRING: process.env.WEB_PUBSUB_CONNECTION_STRING || '',
  PUBSUB_HUB: process.env.PUBSUB_HUB || 'arenablast_hub',

  CONTENT_SAFETY_ENDPOINT: process.env.CONTENT_SAFETY_ENDPOINT || '',
  CONTENT_SAFETY_KEY: process.env.CONTENT_SAFETY_KEY || '',
  
  LOGIC_APP_WEBHOOK_URL: process.env.LOGIC_APP_WEBHOOK_URL || '',

  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY || '',
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || '',

  AZURE_MAPS_KEY: process.env.AZURE_MAPS_KEY || '',
};

config.loadKeyVaultSecrets = async () => {
  const vaultName = process.env.AZURE_KEY_VAULT_NAME;
  if (!vaultName) {
    console.log('[KeyVault] AZURE_KEY_VAULT_NAME is not set, skipping Key Vault integration.');
    return;
  }
  
  const url = `https://${vaultName}.vault.azure.net`;
  console.log(`[KeyVault] Connecting to ${url}...`);
  try {
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(url, credential);
    
    const dbPassSecret = await client.getSecret('DB-PASSWORD').catch(() => null);
    if (dbPassSecret && dbPassSecret.value) {
      config.DB.password = dbPassSecret.value;
      console.log('[KeyVault] Successfully loaded DB-PASSWORD');
    }

    const redisPassSecret = await client.getSecret('REDIS-PASSWORD').catch(() => null);
    if (redisPassSecret && redisPassSecret.value) {
      config.REDIS.password = redisPassSecret.value;
      console.log('[KeyVault] Successfully loaded REDIS-PASSWORD');
    }
    
    const blobSecret = await client.getSecret('AZURE-STORAGE-CONNECTION-STRING').catch(() => null);
    if (blobSecret && blobSecret.value) {
      config.AZURE_STORAGE_CONNECTION_STRING = blobSecret.value;
      console.log('[KeyVault] Successfully loaded AZURE-STORAGE-CONNECTION-STRING');
    }

    const visionKeySecret = await client.getSecret('AZURE-VISION-KEY').catch(() => null);
    if (visionKeySecret && visionKeySecret.value) {
      config.AZURE_VISION_KEY = visionKeySecret.value;
      console.log('[KeyVault] Successfully loaded AZURE-VISION-KEY');
    }

    const sbSecret = await client.getSecret('SERVICE-BUS-CONNECTION-STRING').catch(() => null);
    if (sbSecret && sbSecret.value) {
      config.SERVICE_BUS_CONNECTION_STRING = sbSecret.value;
      console.log('[KeyVault] Successfully loaded SERVICE-BUS-CONNECTION-STRING');
    }

    const jwtSecret = await client.getSecret('JWT-SECRET').catch(() => null);
    if (jwtSecret && jwtSecret.value) {
      config.JWT_SECRET = jwtSecret.value;
      console.log('[KeyVault] Successfully loaded JWT-SECRET');
    }

    const pubsubSecret = await client.getSecret('WEB-PUBSUB-CONNECTION-STRING').catch(() => null);
    if (pubsubSecret && pubsubSecret.value) {
      config.WEB_PUBSUB_CONNECTION_STRING = pubsubSecret.value;
      console.log('[KeyVault] Successfully loaded WEB-PUBSUB-CONNECTION-STRING');
    }
    const csEndpointSecret = await client.getSecret('CONTENT-SAFETY-ENDPOINT').catch(() => null);
    if (csEndpointSecret && csEndpointSecret.value) {
      config.CONTENT_SAFETY_ENDPOINT = csEndpointSecret.value;
      console.log('[KeyVault] Successfully loaded CONTENT-SAFETY-ENDPOINT');
    }

    const csKeySecret = await client.getSecret('CONTENT-SAFETY-KEY').catch(() => null);
    if (csKeySecret && csKeySecret.value) {
      config.CONTENT_SAFETY_KEY = csKeySecret.value;
      console.log('[KeyVault] Successfully loaded CONTENT-SAFETY-KEY');
    }
    
    const logicAppUrl = await client.getSecret('LOGIC-APP-WEBHOOK-URL').catch(() => null);
    if (logicAppUrl && logicAppUrl.value) {
      config.LOGIC_APP_WEBHOOK_URL = logicAppUrl.value.trim();
      console.log('[KeyVault] Successfully loaded LOGIC-APP-WEBHOOK-URL');
    }

    const speechKeySecret = await client.getSecret('AZURE-SPEECH-KEY').catch(() => null);
    if (speechKeySecret && speechKeySecret.value) {
      config.AZURE_SPEECH_KEY = speechKeySecret.value;
      console.log('[KeyVault] Successfully loaded AZURE-SPEECH-KEY');
    }

    const speechRegionSecret = await client.getSecret('AZURE-SPEECH-REGION').catch(() => null);
    if (speechRegionSecret && speechRegionSecret.value) {
      config.AZURE_SPEECH_REGION = speechRegionSecret.value;
      console.log('[KeyVault] Successfully loaded AZURE-SPEECH-REGION');
    }

    const mapsKeySecret = await client.getSecret('AZURE-MAPS-KEY').catch(() => null);
    if (mapsKeySecret && mapsKeySecret.value) {
      config.AZURE_MAPS_KEY = mapsKeySecret.value;
      console.log('[KeyVault] Successfully loaded AZURE-MAPS-KEY');
    }
    
  } catch (err) {
    console.error('[KeyVault] Failed to load secrets from Key Vault:', err.message);
  }
};

module.exports = config;
