// Pure IPC security policy shared by the main process and its tests. No Electron imports here.

/** Every channel the renderer may invoke. Anything else is rejected. */
export const IPC_CHANNELS = Object.freeze({
  getAppInfo: 'app:get-info',
  steamStatus: 'steam:status',
  steamCreateLobby: 'steam:create-lobby',
  steamJoinLobby: 'steam:join-lobby',
  steamLeaveLobby: 'steam:leave-lobby',
  steamSetJoinable: 'steam:set-joinable',
  steamInvite: 'steam:invite',
  steamSend: 'steam:send',
  steamPoll: 'steam:poll',
  loadSave: 'save:load',
  writeSave: 'save:write',
  /** DEV-ONLY playtest log (MSC-039); main ignores it unless MSC_PLAYTEST_LOG=1. */
  playtestStatus: 'playtest:status',
  playtestAppend: 'playtest:append',
} as const);

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const MAX_IPC_PAYLOAD_BYTES = 16 * 1024;
/** A campaign save is the one large payload (MSC-036); it matches `MAX_SAVE_TEXT_LENGTH` plus JSON quoting. */
export const MAX_SAVE_PAYLOAD_BYTES = 9 * 1024 * 1024;

/** `steam:send` carries one protocol message (up to 16 KiB of UTF-8) plus JSON escaping and the target id. */
const STEAM_SEND_PAYLOAD_BYTES = 6 * 16 * 1024 + 256;

/** One batch of dev playtest log entries (MSC-039). */
const PLAYTEST_APPEND_PAYLOAD_BYTES = 64 * 1024;

const ALLOWED_CHANNELS: ReadonlySet<string> = new Set(Object.values(IPC_CHANNELS));

/** Number of arguments each channel accepts. */
const CHANNEL_ARITY: Readonly<Record<IpcChannel, number>> = {
  'app:get-info': 0,
  'steam:status': 0,
  'steam:create-lobby': 0,
  'steam:join-lobby': 1,
  'steam:leave-lobby': 0,
  'steam:set-joinable': 1,
  'steam:invite': 0,
  'steam:send': 3,
  'steam:poll': 0,
  'save:load': 0,
  'save:write': 1,
  'playtest:status': 0,
  'playtest:append': 1,
};

const CHANNEL_MAX_BYTES: Readonly<Partial<Record<IpcChannel, number>>> = {
  'steam:send': STEAM_SEND_PAYLOAD_BYTES,
  'save:write': MAX_SAVE_PAYLOAD_BYTES,
  'playtest:append': PLAYTEST_APPEND_PAYLOAD_BYTES,
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
  const limit = CHANNEL_MAX_BYTES[channel] ?? MAX_IPC_PAYLOAD_BYTES;
  if (encoded === undefined || encoded.length > limit) {
    return { ok: false, reason: `${channel} payload exceeds ${limit} bytes` };
  }
  if (channel === 'playtest:append' && !Array.isArray(args[0])) {
    return { ok: false, reason: 'playtest:append expects an array of entries' };
  }
  if (channel === 'save:write' && typeof args[0] !== 'string') {
    return { ok: false, reason: 'save:write expects the save text' };
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
