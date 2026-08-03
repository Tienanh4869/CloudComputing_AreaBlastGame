const { DefaultAzureCredential } = require('@azure/identity');

const ENV = require('./env');
const logger = require('../utils/logger');

const ATTACK_DAMAGE_KEY = 'Game:AttackDamage';
const MAP_ROTATION_KEY = 'Game:MapRotation';
const DEFAULT_LABEL = 'Production';
const DEFAULT_REFRESH_INTERVAL_MS = 5000;
const MIN_ATTACK_DAMAGE = 1;
const MAX_ATTACK_DAMAGE = 100;
const ALLOWED_MAPS = Object.freeze([
  'ice_map.json',
  'fire_map.json',
]);
const DEFAULT_MAP_ROTATION = Object.freeze([...ALLOWED_MAPS]);

let appConfiguration = null;

const state = {
  service: 'Azure App Configuration',
  key: ATTACK_DAMAGE_KEY,
  keys: [ATTACK_DAMAGE_KEY, MAP_ROTATION_KEY],
  enabled: false,
  configured: false,
  connected: false,
  source: 'environment-default',
  label: DEFAULT_LABEL,
  attackDamage: ENV.GAME.attackDamage,
  mapRotation: [...DEFAULT_MAP_ROTATION],
  mapRotationSource: 'application-default',
  lastRefreshAt: null,
  lastAttemptAt: null,
  lastError: null,
};

function parseAttackDamage(value) {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed)
    || parsed < MIN_ATTACK_DAMAGE
    || parsed > MAX_ATTACK_DAMAGE
  ) {
    throw new Error(
      `${ATTACK_DAMAGE_KEY} must be an integer from ${MIN_ATTACK_DAMAGE} to ${MAX_ATTACK_DAMAGE}`
    );
  }

  return parsed;
}

function parseMapRotation(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `${MAP_ROTATION_KEY} must contain at least one comma-separated map name`
    );
  }

  const mapRotation = [...new Set(
    value
      .split(',')
      .map((mapName) => mapName.trim())
      .filter(Boolean)
  )];

  if (mapRotation.length === 0) {
    throw new Error(
      `${MAP_ROTATION_KEY} must contain at least one comma-separated map name`
    );
  }

  const unsupportedMaps = mapRotation.filter(
    (mapName) => !ALLOWED_MAPS.includes(mapName)
  );

  if (unsupportedMaps.length > 0) {
    throw new Error(
      `${MAP_ROTATION_KEY} contains unsupported map(s): ${unsupportedMaps.join(', ')}`
    );
  }

  return mapRotation;
}

function rotationsEqual(left, right) {
  return left.length === right.length
    && left.every((mapName, index) => mapName === right[index]);
}

function getRefreshIntervalMs() {
  const parsed = Number.parseInt(
    process.env.AZURE_APPCONFIG_REFRESH_INTERVAL_MS,
    10
  );

  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_REFRESH_INTERVAL_MS;
  }

  return parsed;
}

function getAppConfigurationStatus() {
  return {
    ...state,
    attackDamage: ENV.GAME.attackDamage,
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

  const rawAttackDamage = appConfiguration.get(ATTACK_DAMAGE_KEY);
  if (
    rawAttackDamage === undefined
    || rawAttackDamage === null
    || rawAttackDamage === ''
  ) {
    throw new Error(
      `${ATTACK_DAMAGE_KEY} was not found for label ${state.label}`
    );
  }

  const rawMapRotation = appConfiguration.get(MAP_ROTATION_KEY);
  const hasMapRotation = rawMapRotation !== undefined && rawMapRotation !== null;
  const attackDamage = parseAttackDamage(rawAttackDamage);
  const mapRotation = hasMapRotation
    ? parseMapRotation(rawMapRotation)
    : [...DEFAULT_MAP_ROTATION];

  const previousDamage = ENV.GAME.attackDamage;
  const previousMapRotation = state.mapRotation;
  const damageChanged = previousDamage !== attackDamage;
  const mapRotationChanged = !rotationsEqual(previousMapRotation, mapRotation);

  ENV.GAME.attackDamage = attackDamage;
  state.connected = true;
  state.source = 'azure-app-configuration';
  state.attackDamage = attackDamage;
  state.mapRotation = mapRotation;
  state.mapRotationSource = hasMapRotation
    ? 'azure-app-configuration'
    : 'application-default';
  state.lastRefreshAt = new Date().toISOString();
  state.lastError = null;

  if (damageChanged) {
    logger.info('[AppConfig] Game attack damage updated', {
      previousDamage,
      attackDamage,
      label: state.label,
    });
  }

  if (mapRotationChanged) {
    logger.info('[AppConfig] Game map rotation updated', {
      previousMapRotation,
      mapRotation,
      label: state.label,
    });
  }

  if (!hasMapRotation) {
    logger.warn('[AppConfig] Game map rotation key is missing; using defaults', {
      key: MAP_ROTATION_KEY,
      mapRotation,
      label: state.label,
    });
  }

  return damageChanged || mapRotationChanged;
}

async function initializeAppConfiguration() {
  state.enabled = process.env.AZURE_APPCONFIG_ENABLED === 'true';
  state.configured = Boolean(process.env.AZURE_APPCONFIG_ENDPOINT);
  state.label = process.env.AZURE_APPCONFIG_LABEL || DEFAULT_LABEL;
  state.attackDamage = ENV.GAME.attackDamage;
  state.mapRotation = [...DEFAULT_MAP_ROTATION];
  state.mapRotationSource = 'application-default';

  if (!state.enabled) {
    logger.info('[AppConfig] Integration disabled; using default attack damage', {
      attackDamage: ENV.GAME.attackDamage,
    });
    return getAppConfigurationStatus();
  }

  if (!state.configured) {
    state.lastError = 'AZURE_APPCONFIG_ENDPOINT is not configured';
    logger.warn(`[AppConfig] ${state.lastError}; using default attack damage`);
    return getAppConfigurationStatus();
  }

  state.lastAttemptAt = new Date().toISOString();

  try {
    // Load lazily so local development can keep the integration disabled.
    const { load } = require('@azure/app-configuration-provider');
    const credential = new DefaultAzureCredential();

    appConfiguration = await load(
      process.env.AZURE_APPCONFIG_ENDPOINT,
      credential,
      {
        selectors: [
          {
            keyFilter: ATTACK_DAMAGE_KEY,
            labelFilter: state.label,
          },
          {
            keyFilter: MAP_ROTATION_KEY,
            labelFilter: state.label,
          },
        ],
        refreshOptions: {
          enabled: true,
          refreshIntervalInMs: getRefreshIntervalMs(),
        },
        startupOptions: {
          timeoutInMs: 10000,
        },
      }
    );

    appConfiguration.onRefresh(() => {
      try {
        applyGameplayConfiguration();
      } catch (error) {
        state.lastError = error.message;
        logger.error('[AppConfig] Refreshed value was rejected', {
          error: error.message,
        });
      }
    });

    applyGameplayConfiguration();
    logger.info('[AppConfig] Azure App Configuration connected', {
      keys: state.keys,
      label: state.label,
      attackDamage: ENV.GAME.attackDamage,
      mapRotation: state.mapRotation,
      mapRotationSource: state.mapRotationSource,
    });
  } catch (error) {
    appConfiguration = null;
    state.connected = false;
    state.source = 'environment-default';
    state.lastError = error.message;
    logger.error('[AppConfig] Connection failed; using default attack damage', {
      error: error.message,
      attackDamage: ENV.GAME.attackDamage,
    });
  }

  return getAppConfigurationStatus();
}

async function refreshAppConfiguration() {
  if (!appConfiguration) {
    const error = new Error(
      state.lastError || 'Azure App Configuration is not connected'
    );
    error.code = 'APPCONFIG_UNAVAILABLE';
    throw error;
  }

  state.lastAttemptAt = new Date().toISOString();
  const previousDamage = ENV.GAME.attackDamage;
  const previousMapRotation = [...state.mapRotation];

  try {
    await appConfiguration.refresh();
    const changed = applyGameplayConfiguration();
    const valueChanged = previousDamage !== ENV.GAME.attackDamage
      || !rotationsEqual(previousMapRotation, state.mapRotation);

    logger.info('[AppConfig] Manual refresh completed', {
      changed: changed || valueChanged,
      attackDamage: ENV.GAME.attackDamage,
      mapRotation: state.mapRotation,
    });

    return {
      changed: changed || valueChanged,
      status: getAppConfigurationStatus(),
    };
  } catch (error) {
    state.lastError = error.message;
    logger.error('[AppConfig] Manual refresh failed', {
      error: error.message,
    });

    const refreshError = new Error('Unable to refresh Azure App Configuration');
    refreshError.code = 'APPCONFIG_REFRESH_FAILED';
    refreshError.cause = error;
    throw refreshError;
  }
}

module.exports = {
  ATTACK_DAMAGE_KEY,
  MAP_ROTATION_KEY,
  ALLOWED_MAPS,
  DEFAULT_MAP_ROTATION,
  initializeAppConfiguration,
  refreshAppConfiguration,
  getAppConfigurationStatus,
  getMapRotation,
  parseAttackDamage,
  parseMapRotation,
};
