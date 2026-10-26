import * as THREE from 'three';
import { SurfaceType } from '../audio/AudioManager';

export interface BoxCollider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  tag?: string;
  disabled?: boolean;
}

export class CollisionSystem {
  public colliders: BoxCollider[] = [];
  public occluderMeshes: THREE.Object3D[] = [];

  public clear(): void {
    this.colliders = [];
    this.occluderMeshes = [];
  }

  public setColliderEnabledByTag(tag: string, enabled: boolean): void {
    for (let i = 0; i < this.colliders.length; i++) {
      if (this.colliders[i].tag === tag) {
        this.colliders[i].disabled = !enabled;
      }
    }
  }

  public addBoxCollider(
    centerX: number,
    centerY: number,
    centerZ: number,
    width: number,
    height: number,
    depth: number,
    tag?: string
  ): void {
    this.colliders.push({
      minX: centerX - width / 2,
      maxX: centerX + width / 2,
      minY: centerY - height / 2,
      maxY: centerY + height / 2,
      minZ: centerZ - depth / 2,
      maxZ: centerZ + depth / 2,
      tag,
      disabled: false,
    });
  }

  public addMeshCollider(mesh: THREE.Mesh, isOccluder = true, pad = 0): void {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    this.colliders.push({
      minX: box.min.x - pad,
      maxX: box.max.x + pad,
      minY: box.min.y,
      maxY: box.max.y,
      minZ: box.min.z - pad,
      maxZ: box.max.z + pad,
    });
    if (isOccluder) {
      this.occluderMeshes.push(mesh);
    }
  }

  /**
   * Returns floor height Y at given (x, z) world position.
   * Ground floor = 0.0
   * Basement stairs: X in [-2.2, 2.2], Z from -10.0 (Y=0) down to -16.4 (Y=-3.2)
   * Basement floor: Z <= -16.4 -> Y = -3.2
   */
  public getFloorHeight(x: number, z: number): number {
    if (z <= -16.4) {
      return -3.2;
    }
    if (z < -10.0 && z > -16.4) {
      const t = (-10.0 - z) / 6.4; // 0 at top (-10), 1 at bottom (-16.4)
      return -3.2 * Math.max(0, Math.min(1, t));
    }
    return 0.0;
  }

  public getSurfaceType(x: number, z: number): SurfaceType {
    if (z < -11.0 || z > 8.1) {
      return 'concrete';
    }
    // Bathroom area: X in [-8.5, -2.5], Z in [-8.0, -1.0]
    if (x < -2.5 && z < -0.8 && z >= -8.5) {
      return 'tile';
    }
    return 'wood';
  }

  public getRoomName(x: number, z: number): string {
    if (z > 8.1) return 'Front Yard';
    if (z < -15.5) return 'Basement';
    if (z < -10.0) return 'Basement Stairs';
    if (x < -2.5) {
      return z >= -0.5 ? 'Bedroom' : 'Bathroom';
    }
    if (x > 2.5) {
      return z >= -1.0 ? 'Living Room' : 'Kitchen';
    }
    return z > 3.5 ? 'Front Entrance' : 'Central Hallway';
  }

  /**
   * Resolves horizontal movement using iterative circle-vs-AABB push-out
   * resolution so the player or monster slides smoothly along walls and can
   * never get locked inside a collider margin.
   */
  public resolveMovement(
    currentPos: THREE.Vector3,
    desiredX: number,
    desiredZ: number,
    radius: number,
    entityHeight = 1.6
  ): { x: number; y: number; z: number } {
    const floorY = this.getFloorHeight(currentPos.x, currentPos.z);
    const minY = floorY + 0.2;
    const maxY = floorY + entityHeight;

    let rx = desiredX;
    let rz = desiredZ;

    // 3 solver passes ensure clean resolution even at multi-wall corners
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (c.disabled) continue;
        if (maxY <= c.minY || minY >= c.maxY) continue;

        const closestX = Math.max(c.minX, Math.min(rx, c.maxX));
        const closestZ = Math.max(c.minZ, Math.min(rz, c.maxZ));

        const dx = rx - closestX;
        const dz = rz - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          if (distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const overlap = radius - dist;
            rx += (dx / dist) * overlap;
            rz += (dz / dist) * overlap;
          } else {
            // Center is inside the AABB: push out along shallowest penetration axis
            const penLeft = Math.abs(rx - c.minX);
            const penRight = Math.abs(c.maxX - rx);
            const penBack = Math.abs(rz - c.minZ);
            const penFront = Math.abs(c.maxZ - rz);
            const minPen = Math.min(penLeft, penRight, penBack, penFront);

            if (minPen === penLeft) rx = c.minX - radius;
            else if (minPen === penRight) rx = c.maxX + radius;
            else if (minPen === penBack) rz = c.minZ - radius;
            else rz = c.maxZ + radius;
          }
        }
      }
    }

    const newFloorY = this.getFloorHeight(rx, rz);
    return { x: rx, y: newFloorY, z: rz };
  }
}
