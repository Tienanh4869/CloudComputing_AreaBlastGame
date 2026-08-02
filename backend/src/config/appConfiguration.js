const { DefaultAzureCredential } = require('@azure/identity');

const ENV = require('./env');
const logger = require('../utils/logger');

const ATTACK_DAMAGE_KEY = 'Game:AttackDamage';
const DEFAULT_LABEL = 'Production';
const DEFAULT_REFRESH_INTERVAL_MS = 5000;
const MIN_ATTACK_DAMAGE = 1;
const MAX_ATTACK_DAMAGE = 100;

let appConfiguration = null;

const state = {
  service: 'Azure App Configuration',
  key: ATTACK_DAMAGE_KEY,
  enabled: false,
  configured: false,
  connected: false,
  source: 'environment-default',
  label: DEFAULT_LABEL,
  attackDamage: ENV.GAME.attackDamage,
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
  };
}

function applyAttackDamage() {
  if (!appConfiguration) {
    throw new Error('Azure App Configuration provider is not initialized');
  }

  const rawValue = appConfiguration.get(ATTACK_DAMAGE_KEY);
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    throw new Error(
      `${ATTACK_DAMAGE_KEY} was not found for label ${state.label}`
    );
  }

  const attackDamage = parseAttackDamage(rawValue);
  const previousDamage = ENV.GAME.attackDamage;

  ENV.GAME.attackDamage = attackDamage;
  state.connected = true;
  state.source = 'azure-app-configuration';
  state.attackDamage = attackDamage;
  state.lastRefreshAt = new Date().toISOString();
  state.lastError = null;

  if (previousDamage !== attackDamage) {
    logger.info('[AppConfig] Game attack damage updated', {
      previousDamage,
      attackDamage,
      label: state.label,
    });
  }

  return previousDamage !== attackDamage;
}

async function initializeAppConfiguration() {
  state.enabled = process.env.AZURE_APPCONFIG_ENABLED === 'true';
  state.configured = Boolean(process.env.AZURE_APPCONFIG_ENDPOINT);
  state.label = process.env.AZURE_APPCONFIG_LABEL || DEFAULT_LABEL;
  state.attackDamage = ENV.GAME.attackDamage;

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
        applyAttackDamage();
      } catch (error) {
        state.lastError = error.message;
        logger.error('[AppConfig] Refreshed value was rejected', {
          error: error.message,
        });
      }
    });

    applyAttackDamage();
    logger.info('[AppConfig] Azure App Configuration connected', {
      key: ATTACK_DAMAGE_KEY,
      label: state.label,
      attackDamage: ENV.GAME.attackDamage,
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

  try {
    await appConfiguration.refresh();
    const changed = applyAttackDamage();

    logger.info('[AppConfig] Manual refresh completed', {
      changed,
      attackDamage: ENV.GAME.attackDamage,
    });

    return {
      changed: changed || previousDamage !== ENV.GAME.attackDamage,
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
  initializeAppConfiguration,
  refreshAppConfiguration,
  getAppConfigurationStatus,
  parseAttackDamage,
};
