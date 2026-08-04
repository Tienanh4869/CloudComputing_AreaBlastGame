const config = require('../config/env');

/**
 * Gets the ISO country code (e.g., 'VN', 'US') from an IP address using Azure Maps.
 * @param {string} ipAddress - The client IP address.
 * @returns {Promise<string>} - Resolves to the ISO country code, or 'UNKNOWN' if it fails.
 */
const getCountryFromIp = async (ipAddress) => {
  if (!config.AZURE_MAPS_KEY) {
    console.warn('[Azure Maps] Missing AZURE_MAPS_KEY, returning UNKNOWN region');
    return 'UNKNOWN';
  }

  // Handle local development IPs (localhost and LAN)
  if (
    ipAddress === '127.0.0.1' || 
    ipAddress === '::1' || 
    ipAddress === '::ffff:127.0.0.1' ||
    ipAddress.startsWith('192.168.') ||
    ipAddress.startsWith('10.') ||
    ipAddress.startsWith('::ffff:192.168.')
  ) {
    console.log('[Azure Maps] Local/LAN IP detected, defaulting to VN for testing');
    return 'VN'; // Giả lập VN khi chạy Local
  }

  try {
    const url = `https://atlas.microsoft.com/geolocation/ip/json?api-version=1.0&ip=${ipAddress}&subscription-key=${config.AZURE_MAPS_KEY}`;
    // Using Node native fetch
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Azure Maps API returned status: ${response.status}`);
    }
    const data = await response.json();
    // Example format: { countryRegion: { isoCode: 'VN' }, ipAddress: '...' }
    return data.countryRegion?.isoCode || 'UNKNOWN';
  } catch (error) {
    console.error(`[Azure Maps] Failed to resolve IP ${ipAddress}:`, error.message);
    return 'UNKNOWN';
  }
};

module.exports = {
  getCountryFromIp
};
