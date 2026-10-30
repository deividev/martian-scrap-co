import { BoxGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { cloneMaterial, mergeStatic } from '../../src/models/mergeStatic';

const meshes = (root: Group): Mesh[] => root.children.filter((child): child is Mesh => child instanceof Mesh);

describe('mergeStatic', () => {
  it('bakes different plain finishes and emissive parts into one mesh', () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: '#ff0000', roughness: 0.2 })));
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: '#00ff00', metalness: 0.8 })));
    root.add(
      new Mesh(
        new BoxGeometry(),
        new MeshStandardMaterial({ color: '#0000ff', emissive: '#ffffff', emissiveIntensity: 0.5, flatShading: true }),
      ),
    );
    mergeStatic(root);
    const [batch, ...rest] = meshes(root);
    expect(rest).toHaveLength(0);
    const finish = batch?.geometry.getAttribute('finish');
    const glow = batch?.geometry.getAttribute('glow');
    const perBox = 36;
    expect(finish?.getX(0)).toBeCloseTo(0.2);
    expect(finish?.getY(perBox)).toBeCloseTo(0.8);
    expect(glow?.getX(0)).toBe(0);
    expect(glow?.getX(perBox * 2)).toBeCloseTo(0.5);
  });

  it('keeps separate meshes per face side, for transparent materials and for kept pivots', () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ side: DoubleSide })));
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ transparent: true, opacity: 0.5 })));
    const pivot = new Group();
    pivot.name = 'pivot';
    pivot.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    pivot.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ roughness: 0.1 })));
    root.add(pivot);
    mergeStatic(root, (object) => object.name === 'pivot');
    expect(meshes(root)).toHaveLength(3);
    expect(meshes(pivot)).toHaveLength(1);
  });

  it('clones a baked material with its shader patch', () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
    mergeStatic(root);
    const source = meshes(root)[0]?.material as MeshStandardMaterial;
    const clone = cloneMaterial(source);
    expect(clone).not.toBe(source);
    expect(clone.userData['bakedFinish']).toBe(true);
    expect(clone.customProgramCacheKey()).toBe('baked-finish');
  });
});
