import type { RawContentPack } from './schema';

/**
 * Provisional first-pass content approved at MSC-002 for building and testing.
 * Sale values and masses are PLACEHOLDERS until the economy audit (MSC-058); names may change.
 * `hands` is the bare-hands affordance every robot has, not a seventh purchasable tool family.
 * The portable container (MSC-015) and base facilities (MSC-031+) are storage/processing, not handling tools.
 */
export const FIRST_PASS_CONTENT = {
  schemaVersion: 1,
  tools: [
    { id: 'hands', displayName: 'Hands', handles: ['small', 'medium'], freeBaseline: true },
    { id: 'magnetic-collector', displayName: 'Magnetic Collector', handles: ['small'], freeBaseline: true },
    { id: 'grabber', displayName: 'Grabber', handles: ['small', 'medium'], freeBaseline: false },
    { id: 'cutter', displayName: 'Cutter', handles: ['large'], freeBaseline: false },
    { id: 'cart', displayName: 'Cart', handles: ['medium'], freeBaseline: true },
  ],
  materials: [
    {
      id: 'ferrous',
      displayName: 'Ferrous Scrap',
      symbol: 'Fe',
      fictional: false,
      collectableBy: ['magnetic-collector', 'hands'],
      saleValuePerUnit: 4,
      massPerUnit: 8,
    },
    {
      id: 'aluminum',
      displayName: 'Aluminum',
      symbol: 'Al',
      fictional: false,
      collectableBy: ['hands', 'grabber'],
      saleValuePerUnit: 6,
      massPerUnit: 3,
    },
    {
      id: 'copper',
      displayName: 'Copper',
      symbol: 'Cu',
      fictional: false,
      collectableBy: ['hands', 'grabber'],
      saleValuePerUnit: 10,
      massPerUnit: 9,
    },
    {
      id: 'polymer',
      displayName: 'Polymer',
      symbol: 'Pl',
      fictional: false,
      collectableBy: ['hands', 'grabber'],
      saleValuePerUnit: 3,
      massPerUnit: 1.5,
    },
    {
      id: 'heliofoil',
      displayName: 'Heliofoil',
      symbol: 'Hf',
      fictional: true,
      collectableBy: ['hands', 'grabber'],
      saleValuePerUnit: 9,
      massPerUnit: 2,
    },
    {
      id: 'regolith-ceramic',
      displayName: 'Regolith Ceramic',
      symbol: 'Rc',
      fictional: true,
      collectableBy: ['hands', 'grabber'],
      saleValuePerUnit: 7,
      massPerUnit: 5,
    },
  ],
} satisfies RawContentPack;
