const ENV = require('../config/env');
const logger = require('../utils/logger');

const REQUEST_TIMEOUT_MS = 10000;

const score = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const moderationError = (message, code, cause) => {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
};

/**
 * Analyze image bytes with the Azure Computer Vision 3.2 Adult feature.
 * The key is read at call time because Key Vault loads secrets during bootstrap.
 */
async function moderateImage(imageBuffer, contentType) {
  if (!ENV.AZURE_VISION_MODERATION_ENABLED) {
    return {
      checked: false,
      safe: true,
      provider: null,
      reasons: [],
    };
  }

  if (!ENV.AZURE_VISION_ENDPOINT || !ENV.AZURE_VISION_KEY) {
    throw moderationError(
      'Azure Computer Vision moderation is enabled but not configured',
      'VISION_NOT_CONFIGURED'
    );
  }

  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw moderationError('Image buffer is empty', 'INVALID_IMAGE_BUFFER');
  }

  const endpoint = ENV.AZURE_VISION_ENDPOINT.replace(/\/+$/, '');
  const url = `${endpoint}/vision/v3.2/analyze?visualFeatures=Adult`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Ocp-Apim-Subscription-Key': ENV.AZURE_VISION_KEY,
      },
      body: imageBuffer,
      signal: controller.signal,
    });
  } catch (error) {
    const code = error.name === 'AbortError' ? 'VISION_TIMEOUT' : 'VISION_UNAVAILABLE';
    throw moderationError('Azure Computer Vision request failed', code, error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    logger.error('[Vision] Moderation request rejected by Azure', {
      statusCode: response.status,
    });
    throw moderationError('Azure Computer Vision returned an error', 'VISION_API_ERROR');
  }

  const payload = await response.json();
  if (!payload.adult) {
    throw moderationError('Azure Computer Vision response is invalid', 'VISION_INVALID_RESPONSE');
  }

  const adultScore = score(payload.adult.adultScore);
  const racyScore = score(payload.adult.racyScore);
  const goreScore = score(payload.adult.goreScore);
  const reasons = [];

  if (payload.adult.isAdultContent || adultScore >= ENV.AZURE_VISION_ADULT_THRESHOLD) {
    reasons.push('adult');
  }
  if (payload.adult.isRacyContent || racyScore >= ENV.AZURE_VISION_RACY_THRESHOLD) {
    reasons.push('racy');
  }
  if (payload.adult.isGoryContent || goreScore >= ENV.AZURE_VISION_GORE_THRESHOLD) {
    reasons.push('gore');
  }

  const result = {
    checked: true,
    safe: reasons.length === 0,
    provider: 'azure-computer-vision-v3.2',
    reasons,
    scores: {
      adult: adultScore,
      racy: racyScore,
      gore: goreScore,
    },
  };

  logger.info('[Vision] Image moderation completed', {
    safe: result.safe,
    reasons: result.reasons,
    scores: result.scores,
  });

  return result;
}

module.exports = { moderateImage };
