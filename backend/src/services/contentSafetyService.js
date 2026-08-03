const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * Call Azure Content Safety to analyze text
 * Returns { isSafe: boolean, censoredText: string }
 * If the API fails or is not configured, it fails open (allows text) to prevent blocking the game.
 */
async function moderateText(text) {
  if (!text || text.trim() === '') {
    return { isSafe: true, censoredText: text };
  }

  if (!config.CONTENT_SAFETY_ENDPOINT || !config.CONTENT_SAFETY_KEY) {
    // If not configured, just return original text
    return { isSafe: true, censoredText: text };
  }

  const endpoint = config.CONTENT_SAFETY_ENDPOINT.replace(/\/+$/, '');
  const url = `${endpoint}/contentsafety/text:analyze?api-version=2023-10-01`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.CONTENT_SAFETY_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[ContentSafety] API Error: ${response.status} - ${errText}`);
      // Fail open
      return { isSafe: true, censoredText: text };
    }

    const data = await response.json();
    
    // Check categories: Hate, Sexual, SelfHarm, Violence
    // Severity scale: 0, 2, 4, 6
    // We block if any severity >= 2
    let isSafe = true;
    if (data.categoriesAnalysis) {
      for (const category of data.categoriesAnalysis) {
        if (category.severity >= 2) {
          isSafe = false;
          break;
        }
      }
    }

    if (!isSafe) {
      // Create a censored version
      const censoredText = '***';
      return { isSafe, censoredText };
    }

    return { isSafe: true, censoredText: text };

  } catch (error) {
    logger.error(`[ContentSafety] Request failed: ${error.message}`);
    return { isSafe: true, censoredText: text };
  }
}

module.exports = {
  moderateText
};
