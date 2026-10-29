// Pure IPC security policy shared by the main process and its tests. No Electron imports here.

/** Every channel the renderer may invoke. Anything else is rejected. */
export const IPC_CHANNELS = Object.freeze({
  getAppInfo: 'app:get-info',
} as const);

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const MAX_IPC_PAYLOAD_BYTES = 16 * 1024;

const ALLOWED_CHANNELS: ReadonlySet<string> = new Set(Object.values(IPC_CHANNELS));

/** Number of arguments each channel accepts. */
const CHANNEL_ARITY: Readonly<Record<IpcChannel, number>> = {
  'app:get-info': 0,
};

export type IpcValidation =
  { readonly ok: true; readonly channel: IpcChannel } | { readonly ok: false; readonly reason: string };

export function isAllowedChannel(channel: string): channel is IpcChannel {
  return ALLOWED_CHANNELS.has(channel);
}

/** Validates channel, arity and payload size of a renderer invoke. */
export function validateInvoke(channel: string, args: readonly unknown[]): IpcValidation {
  if (!isAllowedChannel(channel)) return { ok: false, reason: `unapproved channel: ${channel}` };
  if (args.length !== CHANNEL_ARITY[channel]) {
    return { ok: false, reason: `${channel} expects ${CHANNEL_ARITY[channel]} argument(s), got ${args.length}` };
  }
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(args);
  } catch {
    return { ok: false, reason: `${channel} payload is not serializable` };
  }
  if (encoded === undefined || encoded.length > MAX_IPC_PAYLOAD_BYTES) {
    return { ok: false, reason: `${channel} payload exceeds ${MAX_IPC_PAYLOAD_BYTES} bytes` };
  }
  return { ok: true, channel };
}

/** Accepts only a loopback http(s) dev server URL; anything else disables dev loading. */
export function resolveDevServerUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (!loopback || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null;
  return url.origin;
}

/** The renderer frame must be our dev server origin or the exact packaged index file. */
export function isTrustedSenderUrl(
  senderUrl: string | undefined,
  devServerOrigin: string | null,
  indexFileUrl: string,
): boolean {
  if (!senderUrl) return false;
  let url: URL;
  try {
    url = new URL(senderUrl);
  } catch {
    return false;
  }
  if (devServerOrigin) return url.origin === devServerOrigin;
  const index = new URL(indexFileUrl);
  return url.protocol === 'file:' && url.pathname === index.pathname;
}
