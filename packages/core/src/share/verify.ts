export type ShareGrant = {
  expiresAt: Date | null;
  passphraseHash: string | null;
  allowComment: boolean;
  allowDownload: boolean;
};

export function isShareActive(share: ShareGrant, now = new Date()) {
  return !share.expiresAt || share.expiresAt > now;
}

export function assertShareActive(share: ShareGrant, now = new Date()) {
  if (!isShareActive(share, now)) {
    throw new Error("This review link has expired.");
  }
}
