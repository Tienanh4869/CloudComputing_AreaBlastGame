jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const ENV = require('../../config/env');
const { moderateImage } = require('../imageModeration');

describe('moderateImage', () => {
  const originalFetch = global.fetch;
  const originalConfig = {
    AZURE_VISION_ENDPOINT: ENV.AZURE_VISION_ENDPOINT,
    AZURE_VISION_KEY: ENV.AZURE_VISION_KEY,
    AZURE_VISION_MODERATION_ENABLED: ENV.AZURE_VISION_MODERATION_ENABLED,
    AZURE_VISION_ADULT_THRESHOLD: ENV.AZURE_VISION_ADULT_THRESHOLD,
    AZURE_VISION_RACY_THRESHOLD: ENV.AZURE_VISION_RACY_THRESHOLD,
    AZURE_VISION_GORE_THRESHOLD: ENV.AZURE_VISION_GORE_THRESHOLD,
  };

  beforeEach(() => {
    ENV.AZURE_VISION_ENDPOINT = 'https://vision.example.test';
    ENV.AZURE_VISION_KEY = 'test-key';
    ENV.AZURE_VISION_MODERATION_ENABLED = true;
    ENV.AZURE_VISION_ADULT_THRESHOLD = 0.6;
    ENV.AZURE_VISION_RACY_THRESHOLD = 0.7;
    ENV.AZURE_VISION_GORE_THRESHOLD = 0.6;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    Object.assign(ENV, originalConfig);
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('skips Azure when moderation is disabled', async () => {
    ENV.AZURE_VISION_MODERATION_ENABLED = false;

    const result = await moderateImage(Buffer.from('image'), 'image/png');

    expect(result).toMatchObject({ checked: false, safe: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('accepts a safe image', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        adult: {
          isAdultContent: false,
          isRacyContent: false,
          isGoryContent: false,
          adultScore: 0.02,
          racyScore: 0.04,
          goreScore: 0.01,
        },
      }),
    });

    const result = await moderateImage(Buffer.from('image'), 'image/png');

    expect(result).toMatchObject({
      checked: true,
      safe: true,
      provider: 'azure-computer-vision-v3.2',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://vision.example.test/vision/v3.2/analyze?visualFeatures=Adult',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'image/png',
          'Ocp-Apim-Subscription-Key': 'test-key',
        }),
      })
    );
  });

  test('rejects an image flagged by Azure', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        adult: {
          isAdultContent: true,
          isRacyContent: false,
          isGoryContent: false,
          adultScore: 0.91,
          racyScore: 0.1,
          goreScore: 0,
        },
      }),
    });

    const result = await moderateImage(Buffer.from('image'), 'image/jpeg');

    expect(result.safe).toBe(false);
    expect(result.reasons).toContain('adult');
  });

  test('rejects an image that exceeds a configured score threshold', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        adult: {
          isAdultContent: false,
          isRacyContent: false,
          isGoryContent: false,
          adultScore: 0.1,
          racyScore: 0.8,
          goreScore: 0.1,
        },
      }),
    });

    const result = await moderateImage(Buffer.from('image'), 'image/webp');

    expect(result.safe).toBe(false);
    expect(result.reasons).toEqual(['racy']);
  });

  test('fails closed when Azure returns an error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(
      moderateImage(Buffer.from('image'), 'image/png')
    ).rejects.toMatchObject({ code: 'VISION_API_ERROR' });
  });
});
