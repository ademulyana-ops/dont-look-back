import * as THREE from 'three';
import { InteractableSystem } from '../world/Interactable';

export interface PendantLocation {
  id: string;
  roomName: string;
  position: THREE.Vector3;
  hint: string;
}

export class PendantManager {
  private scene: THREE.Scene;
  private interactables: InteractableSystem;
  private shardTextures: THREE.CanvasTexture[];
  private onCollectCallback: (pieceNumber: number, roomName: string) => void;

  private meshes: Map<string, THREE.Group> = new Map();
  private activeSequence: PendantLocation[] = [];
  private currentPieceIndex = 0; // Which piece (0..4) is currently active in the house
  private insertedCount = 0; // How many pieces (0..5) have been inserted into the Front Door
  private carryingPiece = false; // True when player is carrying the current piece to the Front Door

  // Pool of candidate hiding spots per room (1 spot chosen per room, then shuffled randomly each game)
  private readonly roomCandidatePools: PendantLocation[][] = [
    // Bedroom candidates
    [
      {
        id: 'pendant_bedroom_drawer',
        roomName: 'Bedroom',
        position: new THREE.Vector3(-9.22, 0.65, 2.5),
        hint: 'Inside the bedroom nightstand drawer',
      },
      {
        id: 'pendant_bedroom_wardrobe',
        roomName: 'Bedroom',
        position: new THREE.Vector3(-4.15, 0.35, 6.72),
        hint: 'Inside the ajar wooden wardrobe in the bedroom',
      },
    ],
    // Living Room candidates
    [
      {
        id: 'pendant_living_table',
        roomName: 'Living Room',
        position: new THREE.Vector3(7.0, 0.22, 3.65),
        hint: 'Underneath the living room coffee table',
      },
      {
        id: 'pendant_living_shelf',
        roomName: 'Living Room',
        position: new THREE.Vector3(10.35, 0.92, 0.9),
        hint: 'On the living room bookshelf near the TV',
      },
    ],
    // Kitchen candidates
    [
      {
        id: 'pendant_kitchen_cabinet',
        roomName: 'Kitchen',
        position: new THREE.Vector3(9.92, 0.45, -6.2),
        hint: 'Inside the open lower kitchen cabinet',
      },
      {
        id: 'pendant_kitchen_table',
        roomName: 'Kitchen',
        position: new THREE.Vector3(6.6, 0.88, -4.8),
        hint: 'On top of the kitchen dining table',
      },
    ],
    // Bathroom candidates
    [
      {
        id: 'pendant_bathroom_sink',
        roomName: 'Bathroom',
        position: new THREE.Vector3(-5.25, 0.96, -1.25),
        hint: 'On the bathroom sink basin under the mirror',
      },
      {
        id: 'pendant_bathroom_tub',
        roomName: 'Bathroom',
        position: new THREE.Vector3(-7.1, 0.76, -5.35),
        hint: 'On the rim of the old bathtub',
      },
    ],
    // Basement candidates
    [
      {
        id: 'pendant_basement_crate',
        roomName: 'Basement',
        position: new THREE.Vector3(3.8, -2.24, -22.2),
        hint: 'On top of the storage crate in the basement',
      },
      {
        id: 'pendant_basement_shelf',
        roomName: 'Basement',
        position: new THREE.Vector3(0.0, -2.05, -24.35),
        hint: 'On the dark wooden storage shelf at the back of the basement',
      },
    ],
  ];

  constructor(
    scene: THREE.Scene,
    interactables: InteractableSystem,
    shardTextures: THREE.CanvasTexture[],
    onCollect: (pieceNumber: number, roomName: string) => void
  ) {
    this.scene = scene;
    this.interactables = interactables;
    this.shardTextures = shardTextures;
    this.onCollectCallback = onCollect;
  }

  private buildRandomSequence(): PendantLocation[] {
    // Pick 1 random spot from each of the 5 rooms
    const chosen: PendantLocation[] = this.roomCandidatePools.map((pool) => {
      const randIdx = Math.floor(Math.random() * pool.length);
      return pool[randIdx];
    });

    // Fisher-Yates shuffle so the room order is completely random every game
    for (let i = chosen.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = chosen[i];
      chosen[i] = chosen[j];
      chosen[j] = temp;
    }

    return chosen;
  }

  public init(): void {
    this.clear();
    this.activeSequence = this.buildRandomSequence();

    this.activeSequence.forEach((loc, index) => {
      const group = new THREE.Group();
      group.position.copy(loc.position);

      const shardMat = new THREE.MeshBasicMaterial({
        map: this.shardTextures[index],
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      // Front and slightly offset back plane to give 3D thickness to the image shard
      const frontShard = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), shardMat);
      frontShard.position.z = 0.008;

      const backShard = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), shardMat);
      backShard.position.z = -0.008;

      // Subtle warm orange glow matching the orange pendant emblem
      const glow = new THREE.PointLight(0xff6b00, 0.55, 2.6, 2);
      glow.position.set(0, 0.08, 0);

      group.add(frontShard, backShard, glow);
      // Strictly ONLY the current active piece (index 0 at start) is visible!
      group.visible = index === 0;
      this.scene.add(group);
      this.meshes.set(loc.id, group);

      this.interactables.register({
        id: loc.id,
        position: loc.position,
        interactionRadius: 2.35,
        isEnabled: () =>
          index === this.currentPieceIndex &&
          !this.carryingPiece &&
          this.insertedCount < this.activeSequence.length,
        getPrompt: () =>
          `PRESS E TO TAKE PENDANT PIECE #${index + 1}/5 (${loc.roomName.toUpperCase()})`,
        onInteract: () => this.collectPiece(loc, index),
      });
    });
  }

  private collectPiece(loc: PendantLocation, index: number): void {
    if (index !== this.currentPieceIndex || this.carryingPiece) return;
    this.carryingPiece = true;

    const meshGroup = this.meshes.get(loc.id);
    if (meshGroup) {
      meshGroup.visible = false;
    }

    this.onCollectCallback(index + 1, loc.roomName);
  }

  /**
   * Inserts the currently carried pendant piece into the Front Door seal
   * and activates the next randomized pendant location in sequence (if < 5).
   */
  public insertCarriedPieceAtDoor(): {
    insertedCount: number;
    nextLocation: PendantLocation | null;
  } {
    if (!this.carryingPiece) {
      return {
        insertedCount: this.insertedCount,
        nextLocation: this.getCurrentTargetLocation(),
      };
    }

    this.carryingPiece = false;
    this.insertedCount += 1;

    if (this.insertedCount < this.activeSequence.length) {
      this.currentPieceIndex = this.insertedCount;
      const nextLoc = this.activeSequence[this.currentPieceIndex];
      const nextMesh = this.meshes.get(nextLoc.id);
      if (nextMesh) {
        nextMesh.visible = true;
      }
      return { insertedCount: this.insertedCount, nextLocation: nextLoc };
    }

    return { insertedCount: this.insertedCount, nextLocation: null };
  }

  public update(elapsedTime: number): void {
    if (this.carryingPiece || this.insertedCount >= this.activeSequence.length) return;
    const activeLoc = this.activeSequence[this.currentPieceIndex];
    if (!activeLoc) return;

    const group = this.meshes.get(activeLoc.id);
    if (group && group.visible) {
      group.rotation.y = elapsedTime * 1.4;
      group.position.y = activeLoc.position.y + Math.sin(elapsedTime * 2.5) * 0.035;
    }
  }

  public isCarryingPiece(): boolean {
    return this.carryingPiece;
  }

  public getInsertedCount(): number {
    return this.insertedCount;
  }

  public getCollectedCount(): number {
    return this.insertedCount + (this.carryingPiece ? 1 : 0);
  }

  public getCurrentTargetLocation(): PendantLocation | null {
    if (this.insertedCount >= this.activeSequence.length) return null;
    return this.activeSequence[this.currentPieceIndex] || null;
  }

  public clear(): void {
    this.meshes.forEach((group) => {
      this.scene.remove(group);
    });
    this.meshes.clear();
    this.activeSequence = [];
    this.currentPieceIndex = 0;
    this.insertedCount = 0;
    this.carryingPiece = false;
  }
}
