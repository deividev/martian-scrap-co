import path from 'node:path';

export interface AppPathInput {
  /** `app.getAppPath()`: project root when unpackaged, `.../resources/app.asar` when packaged. */
  readonly appPath: string;
  /** `process.resourcesPath`: the packaged `resources` folder. */
  readonly resourcesPath: string;
  readonly isPackaged: boolean;
  /** Directory of the compiled main module (`dist-electron/electron`). */
  readonly mainDir: string;
}

export interface AppPaths {
  readonly indexHtml: string;
  readonly preload: string;
  /** Unpacked location for future native modules; `.node` files cannot load from inside asar. */
  readonly nativeDir: string;
}

/** Resolves every runtime path from Electron-provided roots, never from the working directory. */
export function resolveAppPaths(input: AppPathInput): AppPaths {
  return {
    indexHtml: path.join(input.appPath, 'dist', 'index.html'),
    preload: path.join(input.mainDir, 'preload.cjs'),
    nativeDir: input.isPackaged
      ? path.join(input.resourcesPath, 'app.asar.unpacked', 'native')
      : path.join(input.appPath, 'native'),
  };
}
