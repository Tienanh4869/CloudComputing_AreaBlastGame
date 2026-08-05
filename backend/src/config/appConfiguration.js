const { DefaultAzureCredential } = require('@azure/identity');

const ENV = require('./env');
const logger = require('../utils/logger');

const SLASH_COOLDOWN_KEY = 'Game:SlashCooldownMs';
const MOVEMENT_SPEED_KEY = 'Game:MovementSpeed';
const SIZE_INCREASE_KEY = 'Game:SizeIncreasePerLevel';
const MAX_SIZE_KEY = 'Game:MaxPlayerSizeMultiplier';
const MAP_ROTATION_KEY = 'Game:MapRotation';

const DEFAULT_LABEL = 'Production';
const DEFAULT_REFRESH_INTERVAL_MS = 5000;

const ALLOWED_MAPS = Object.freeze([
  'ice_map.json',
  'fire_map.json',
]);
const DEFAULT_MAP_ROTATION = Object.freeze([...ALLOWED_MAPS]);

let appConfiguration = null;

const state = {
  service: 'Azure App Configuration',
  keys: [SLASH_COOLDOWN_KEY, MOVEMENT_SPEED_KEY, SIZE_INCREASE_KEY, MAX_SIZE_KEY, MAP_ROTATION_KEY],
  enabled: false,
  configured: false,
  connected: false,
  source: 'environment-default',
  label: DEFAULT_LABEL,
  
  slashCooldownMs: ENV.GAME.slashCooldownMs,
  movementSpeed: ENV.GAME.playerSpeed,
  sizeIncreasePerLevel: ENV.GAME.sizeIncreasePerLevel,
  maxPlayerSizeMultiplier: ENV.GAME.maxPlayerSizeMultiplier,
  
  mapRotation: [...DEFAULT_MAP_ROTATION],
  mapRotationSource: 'application-default',
  lastRefreshAt: null,
  lastAttemptAt: null,
  lastError: null,
};

function parsePositiveInt(value, key, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function parsePositiveFloat(value, key, min, max) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} must be a float from ${min} to ${max}`);
  }
  return parsed;
}

function parseMapRotation(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${MAP_ROTATION_KEY} must contain at least one comma-separated map name`);
  }
  const mapRotation = [...new Set(value.split(',').map((m) => m.trim()).filter(Boolean))];
  if (mapRotation.length === 0) {
    throw new Error(`${MAP_ROTATION_KEY} must contain at least one map name`);
  }
  const unsupportedMaps = mapRotation.filter((m) => !ALLOWED_MAPS.includes(m));
  if (unsupportedMaps.length > 0) {
    throw new Error(`${MAP_ROTATION_KEY} contains unsupported map(s): ${unsupportedMaps.join(', ')}`);
  }
  return mapRotation;
}

function rotationsEqual(left, right) {
  return left.length === right.length && left.every((m, i) => m === right[i]);
}

function getRefreshIntervalMs() {
  const parsed = Number.parseInt(process.env.AZURE_APPCONFIG_REFRESH_INTERVAL_MS, 10);
  if (!Number.isFinite(parsed) || parsed < 1000) return DEFAULT_REFRESH_INTERVAL_MS;
  return parsed;
}

function getAppConfigurationStatus() {
  return {
    ...state,
    slashCooldownMs: ENV.GAME.slashCooldownMs,
    movementSpeed: ENV.GAME.playerSpeed,
    sizeIncreasePerLevel: ENV.GAME.sizeIncreasePerLevel,
    maxPlayerSizeMultiplier: ENV.GAME.maxPlayerSizeMultiplier,
    mapRotation: [...state.mapRotation],
  };
}

function getMapRotation() {
  return [...state.mapRotation];
}

function applyGameplayConfiguration() {
  if (!appConfiguration) {
    throw new Error('Azure App Configuration provider is not initialized');
  }

  let changed = false;

  // Map rotation
  const rawMapRotation = appConfiguration.get(MAP_ROTATION_KEY);
  const hasMapRotation = rawMapRotation !== undefined && rawMapRotation !== null;
  const mapRotation = hasMapRotation ? parseMapRotation(rawMapRotation) : [...DEFAULT_MAP_ROTATION];
  const mapRotationChanged = !rotationsEqual(state.mapRotation, mapRotation);
  if (mapRotationChanged) {
    logger.info('[AppConfig] Game map rotation updated', { previous: state.mapRotation, current: mapRotation });
    state.mapRotation = mapRotation;
    changed = true;
  }
  state.mapRotationSource = hasMapRotation ? 'azure-app-configuration' : 'application-default';

  // Slash Cooldown
  const rawCooldown = appConfiguration.get(SLASH_COOLDOWN_KEY);
  if (rawCooldown !== undefined && rawCooldown !== null && rawCooldown !== '') {
    const val = parsePositiveInt(rawCooldown, SLASH_COOLDOWN_KEY, 100, 5000);
    if (ENV.GAME.slashCooldownMs !== val) {
      logger.info('[AppConfig] SlashCooldownMs updated', { prev: ENV.GAME.slashCooldownMs, val });
      ENV.GAME.slashCooldownMs = val;
      state.slashCooldownMs = val;
      changed = true;
    }
  }

  // Movement Speed
  const rawSpeed = appConfiguration.get(MOVEMENT_SPEED_KEY);
  if (rawSpeed !== undefined && rawSpeed !== null && rawSpeed !== '') {
    const val = parsePositiveFloat(rawSpeed, MOVEMENT_SPEED_KEY, 0.5, 15.0);
    if (ENV.GAME.playerSpeed !== val) {
      logger.info('[AppConfig] MovementSpeed updated', { prev: ENV.GAME.playerSpeed, val });
      ENV.GAME.playerSpeed = val;
      state.movementSpeed = val;
      changed = true;
    }
  }

  // Size Increase
  const rawSizeInc = appConfiguration.get(SIZE_INCREASE_KEY);
  if (rawSizeInc !== undefined && rawSizeInc !== null && rawSizeInc !== '') {
    const val = parsePositiveFloat(rawSizeInc, SIZE_INCREASE_KEY, 0.0, 1.0);
    if (ENV.GAME.sizeIncreasePerLevel !== val) {
      logger.info('[AppConfig] SizeIncreasePerLevel updated', { prev: ENV.GAME.sizeIncreasePerLevel, val });
      ENV.GAME.sizeIncreasePerLevel = val;
      state.sizeIncreasePerLevel = val;
      changed = true;
    }
  }

  // Max Size Multiplier
  const rawMax = appConfiguration.get(MAX_SIZE_KEY);
  if (rawMax !== undefined && rawMax !== null && rawMax !== '') {
    const val = parsePositiveFloat(rawMax, MAX_SIZE_KEY, 1.0, 10.0);
    if (ENV.GAME.maxPlayerSizeMultiplier !== val) {
      logger.info('[AppConfig] MaxPlayerSizeMultiplier updated', { prev: ENV.GAME.maxPlayerSizeMultiplier, val });
      ENV.GAME.maxPlayerSizeMultiplier = val;
      state.maxPlayerSizeMultiplier = val;
      changed = true;
    }
  }

  state.connected = true;
  state.source = 'azure-app-configuration';
  state.lastRefreshAt = new Date().toISOString();
  state.lastError = null;

  return changed;
}

async function initializeAppConfiguration() {
  state.enabled = process.env.AZURE_APPCONFIG_ENABLED === 'true';
  state.configured = Boolean(process.env.AZURE_APPCONFIG_ENDPOINT);
  state.label = process.env.AZURE_APPCONFIG_LABEL || DEFAULT_LABEL;

  if (!state.enabled || !state.configured) {
    if (!state.enabled) logger.info('[AppConfig] Integration disabled; using default configs');
    if (!state.configured) {
      state.lastError = 'AZURE_APPCONFIG_ENDPOINT is not configured';
      logger.warn(`[AppConfig] ${state.lastError}; using default configs`);
    }
    return getAppConfigurationStatus();
  }

  state.lastAttemptAt = new Date().toISOString();

  try {
    const { load } = require('@azure/app-configuration-provider');
    const credential = new DefaultAzureCredential();

    const selectors = state.keys.map(key => ({ keyFilter: key, labelFilter: state.label }));

    appConfiguration = await load(
      process.env.AZURE_APPCONFIG_ENDPOINT,
      credential,
      {
        selectors,
        refreshOptions: {
          enabled: true,
          refreshIntervalInMs: getRefreshIntervalMs(),
        },
        startupOptions: { timeoutInMs: 10000 },
      }
    );

    appConfiguration.onRefresh(() => {
      try {
        applyGameplayConfiguration();
      } catch (error) {
        state.lastError = error.message;
        logger.error('[AppConfig] Refreshed value was rejected', { error: error.message });
      }
    });

    applyGameplayConfiguration();
    logger.info('[AppConfig] Azure App Configuration connected', { label: state.label });
  } catch (error) {
    appConfiguration = null;
    state.connected = false;
    state.source = 'environment-default';
    state.lastError = error.message;
    logger.error('[AppConfig] Connection failed; using default configs', { error: error.message });
  }

  return getAppConfigurationStatus();
}

async function refreshAppConfiguration() {
  if (!appConfiguration) {
    const error = new Error(state.lastError || 'Azure App Configuration is not connected');
    error.code = 'APPCONFIG_UNAVAILABLE';
    throw error;
  }

  state.lastAttemptAt = new Date().toISOString();
  try {
    await appConfiguration.refresh();
    const changed = applyGameplayConfiguration();

    logger.info('[AppConfig] Manual refresh completed', { changed });

    return {
      changed,
      status: getAppConfigurationStatus(),
    };
  } catch (error) {
    state.lastError = error.message;
    logger.error('[AppConfig] Manual refresh failed', { error: error.message });
    const refreshError = new Error('Unable to refresh Azure App Configuration');
    refreshError.code = 'APPCONFIG_REFRESH_FAILED';
    refreshError.cause = error;
    throw refreshError;
  }
}

module.exports = {
  SLASH_COOLDOWN_KEY,
  MOVEMENT_SPEED_KEY,
  SIZE_INCREASE_KEY,
  MAX_SIZE_KEY,
  MAP_ROTATION_KEY,
  ALLOWED_MAPS,
  DEFAULT_MAP_ROTATION,
  initializeAppConfiguration,
  refreshAppConfiguration,
  getAppConfigurationStatus,
  getMapRotation,
  parseMapRotation,
  parsePositiveInt,
  parsePositiveFloat,
};
