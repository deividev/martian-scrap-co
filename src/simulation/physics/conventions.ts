/**
 * World conventions shared by physics, rendering and content (documented in the MSC-011 record).
 * Y is up, units are SI, and the default gravity is Mars surface gravity. Feel tuning happens at MSC-020.
 */
export const PHYSICS_CONVENTIONS = Object.freeze({
  upAxis: 'y',
  lengthUnit: 'm',
  massUnit: 'kg',
  timeUnit: 's',
  /** Mars mean surface gravity, m/s². */
  marsGravity: 3.721,
  /** Fixed simulation rate; rendering interpolates between steps. */
  fixedStepSeconds: 1 / 60,
});
