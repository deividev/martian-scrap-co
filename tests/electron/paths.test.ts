import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppPaths } from '../../electron/paths';

describe('resolveAppPaths', () => {
  it('resolves packaged paths inside app.asar and native modules outside it', () => {
    const resources = path.join('C:', 'Games', 'Martian Scrap Co', 'resources');
    const appPath = path.join(resources, 'app.asar');
    const paths = resolveAppPaths({
      appPath,
      resourcesPath: resources,
      isPackaged: true,
      mainDir: path.join(appPath, 'dist-electron', 'electron'),
    });
    expect(paths.indexHtml).toBe(path.join(appPath, 'dist', 'index.html'));
    expect(paths.preload).toBe(path.join(appPath, 'dist-electron', 'electron', 'preload.cjs'));
    expect(paths.nativeDir).toBe(path.join(resources, 'app.asar.unpacked', 'native'));
  });

  it('resolves development paths from the project root', () => {
    const root = path.join('C:', 'dev', 'martian');
    const paths = resolveAppPaths({
      appPath: root,
      resourcesPath: path.join(root, 'node_modules', 'electron', 'dist', 'resources'),
      isPackaged: false,
      mainDir: path.join(root, 'dist-electron', 'electron'),
    });
    expect(paths.indexHtml).toBe(path.join(root, 'dist', 'index.html'));
    expect(paths.nativeDir).toBe(path.join(root, 'native'));
  });

  it('never depends on the process working directory', () => {
    const before = resolveAppPaths({ appPath: 'X:/a', resourcesPath: 'X:/r', isPackaged: true, mainDir: 'X:/m' });
    const cwd = process.cwd();
    process.chdir(path.parse(cwd).root);
    try {
      expect(resolveAppPaths({ appPath: 'X:/a', resourcesPath: 'X:/r', isPackaged: true, mainDir: 'X:/m' })).toEqual(before);
    } finally {
      process.chdir(cwd);
    }
  });
});
