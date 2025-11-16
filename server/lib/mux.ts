import Mux from '@mux/mux-node';

if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
  console.warn('⚠️  MUX_TOKEN_ID or MUX_TOKEN_SECRET not set - video features disabled');
}

export const mux = process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET
  ? new Mux({
      tokenId: process.env.MUX_TOKEN_ID,
      tokenSecret: process.env.MUX_TOKEN_SECRET,
    })
  : null;

// Helper to create a direct upload URL
export async function createDirectUpload() {
  if (!mux) {
    throw new Error('Mux not configured');
  }

  const upload = await mux.video.uploads.create({
    new_asset_settings: {
      playback_policy: ['signed'], // Require signed URLs for playback
      encoding_tier: 'baseline',
    },
    cors_origin: '*', // Configure this based on your domain in production
  });

  return {
    uploadId: upload.id,
    url: upload.url,
  };
}

// Helper to create asset from URL
export async function createAssetFromUrl(url: string) {
  if (!mux) {
    throw new Error('Mux not configured');
  }

  const asset = await mux.video.assets.create({
    input: [{ url }],
    playback_policy: ['signed'],
    encoding_tier: 'baseline',
  });

  return asset;
}

// Helper to get asset details
export async function getAsset(assetId: string) {
  if (!mux) {
    throw new Error('Mux not configured');
  }

  return await mux.video.assets.retrieve(assetId);
}

// Helper to delete asset
export async function deleteAsset(assetId: string) {
  if (!mux) {
    throw new Error('Mux not configured');
  }

  return await mux.video.assets.delete(assetId);
}

// Helper to create signed playback URL
export async function createSignedPlaybackUrl(playbackId: string, expiresIn = 3600) {
  if (!mux) {
    throw new Error('Mux not configured');
  }

  const { JWT } = await import('@mux/mux-node/JWT');

  // Create signed URL that expires in expiresIn seconds (default 1 hour)
  const token = JWT.sign(playbackId, {
    keyId: process.env.MUX_SIGNING_KEY_ID!,
    keySecret: process.env.MUX_SIGNING_KEY_PRIVATE!,
    type: 'video',
    expiration: `${expiresIn}s`,
  });

  return token;
}

// Helper to verify webhook signature
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  if (!mux) {
    throw new Error('Mux not configured');
  }

  const { Webhooks } = Mux;
  return Webhooks.verifyHeader(rawBody, signature, secret);
}

// Get upload details
export async function getUpload(uploadId: string) {
  if (!mux) {
    throw new Error('Mux not configured');
  }

  return await mux.video.uploads.retrieve(uploadId);
}
