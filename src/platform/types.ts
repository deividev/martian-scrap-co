/** Read-only application details reported by the desktop shell. */
export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly platform: string;
  readonly electron: string;
  readonly chrome: string;
}

/** The only API the preload exposes to the renderer (`window.martianPlatform`). */
export interface PlatformBridge {
  getAppInfo(): Promise<AppInfo>;
  /** Recovers the host campaign save from its fixed folder (MSC-036); validated again by the renderer. */
  loadSave(): Promise<unknown>;
  /** Commits one campaign save revision atomically; the main process validates the text first. */
  writeSave(text: string): Promise<unknown>;
}

/**
 * DEV-ONLY playtest log bridge (`window.martianPlaytest`, MSC-039). Always exposed by the preload, but main writes
 * nothing unless the app was started with MSC_PLAYTEST_LOG=1. To be removed or kept disabled for release (MSC-118).
 */
export interface PlaytestBridge {
  status(): Promise<unknown>;
  append(entries: readonly object[]): Promise<unknown>;
}

/** SteamIDs travel as decimal strings; the renderer never sees raw Steam handles. */
export interface SteamLobbyInfo {
  readonly id: string;
  readonly owner: string;
  readonly members: readonly string[];
}

export type SteamUnavailableReason = 'disabled' | 'invalid-app-id' | 'not-installed' | 'init-failed';

export type SteamStatus =
  | { readonly available: true; readonly self: string; readonly lobby: SteamLobbyInfo | null }
  | { readonly available: false; readonly reason: SteamUnavailableReason };

export type SteamEvent =
  | { readonly type: 'member-joined'; readonly steamId: string }
  | { readonly type: 'member-left'; readonly steamId: string }
  | { readonly type: 'lobby-closed' }
  /** An accepted invite, from `+connect_lobby` on launch or while running (co-op guide §2.5). */
  | { readonly type: 'join-requested'; readonly lobby: string }
  | { readonly type: 'session-failed'; readonly steamId: string };

export interface SteamPacket {
  readonly from: string;
  readonly channel: 'reliable' | 'disposable';
  readonly raw: string;
}

export interface SteamPoll {
  readonly packets: readonly SteamPacket[];
  readonly events: readonly SteamEvent[];
  /** Packets dropped in main because the renderer polled too slowly. */
  readonly dropped: number;
}

/**
 * Steam bridge exposed by the preload (`window.martianSteam`, MSC-026). Every call goes through main, which owns
 * the single Steam lifecycle; the renderer polls for packets and events once per frame.
 */
export interface SteamBridge {
  status(): Promise<SteamStatus>;
  /** Friends-only lobby for at most four players; `null` when Steam refuses. */
  createLobby(): Promise<SteamLobbyInfo | null>;
  joinLobby(lobbyId: string): Promise<SteamLobbyInfo | null>;
  leaveLobby(): Promise<void>;
  /** Host lock (MSC-003): a closed lobby takes no new members. */
  setJoinable(joinable: boolean): Promise<boolean>;
  openInviteDialog(): Promise<boolean>;
  send(to: string, channel: 'reliable' | 'disposable', raw: string): Promise<boolean>;
  poll(): Promise<SteamPoll>;
}

/** Native capabilities. A missing capability is reported as `false`, never faked. */
export interface PlatformCapabilities {
  readonly desktopShell: boolean;
  readonly steam: boolean;
  readonly nativeSaves: boolean;
}

/** Typed platform boundary the game depends on instead of Electron or browser globals. */
export interface PlatformAdapter {
  readonly kind: 'electron' | 'browser';
  readonly capabilities: PlatformCapabilities;

  /** Resolves to `null` when the platform cannot provide app details. */
  getAppInfo(): Promise<AppInfo | null>;
  /** The Steam bridge only when Steam actually initialized; `null` otherwise (the game runs without it). */
  getSteam(): Promise<SteamBridge | null>;
}

declare global {
  interface Window {
    martianPlatform?: PlatformBridge;
    martianSteam?: SteamBridge;
    martianPlaytest?: PlaytestBridge;
  }
}
