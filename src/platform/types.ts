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
}

declare global {
  interface Window {
    martianPlatform?: PlatformBridge;
  }
}
