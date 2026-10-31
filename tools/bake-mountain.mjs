// Settles the scrap mountain with the game's own physics and writes the committed data file
// (src/simulation/yard/scrapMountain.baked.json). Usage: npm run bake:mountain
// `npm run bake:mountain -- --resettle` only re-runs the joint passes on the committed data (much faster).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const load = async (path) => (await runnerImport(path)).module;
const { createRapierWorld } = await load('/src/simulation/physics/rapierWorld.ts');
const { addBackdropColliders, createBackdropLayout } = await load('/src/simulation/yard/backdrop.ts');
const { bakeScrapMountain, resettleBakedMountain } = await load('/src/simulation/yard/mountainBake.ts');
const out = fileURLToPath(new URL('../src/simulation/yard/scrapMountain.baked.json', import.meta.url));

const started = Date.now();
const world = await createRapierWorld();
const backdrop = createBackdropLayout();
addBackdropColliders(world, backdrop);
const report = (progress) => {
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${progress.wave}: kept ${progress.kept}/${progress.spawned} after ${progress.steps} steps, worst move ${progress.worstMove.toFixed(3)} m (${seconds} s)`,
  );
};
const baked = process.argv.includes('--resettle')
  ? resettleBakedMountain(world, JSON.parse(readFileSync(out, 'utf8')), undefined, report)
  : bakeScrapMountain(world, backdrop.station.position, undefined, report);
world.dispose();

// One piece per line keeps the file reviewable in diffs.
const lines = baked.pieces.map((piece) => JSON.stringify(piece));
const json = [
  '{',
  `  "format": ${baked.format},`,
  `  "seed": ${baked.seed},`,
  `  "materials": ${JSON.stringify(baked.materials)},`,
  '  "pieces": [',
  lines.map((line, index) => `    ${line}${index < lines.length - 1 ? ',' : ''}`).join('\n'),
  '  ]',
  '}',
  '',
].join('\n');
writeFileSync(out, json);
const count = (size) => baked.pieces.filter((piece) => piece.s === size).length;
console.log(`wrote ${baked.pieces.length} pieces (large ${count(2)}, medium ${count(1)}, small ${count(0)})`);
