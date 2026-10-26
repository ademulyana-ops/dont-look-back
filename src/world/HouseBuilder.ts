import * as THREE from 'three';
import { CollisionSystem } from './CollisionSystem';
import { TextureGenerator } from './TextureGenerator';

export interface HouseLights {
  kitchenLight: THREE.PointLight;
  hallwayLight: THREE.PointLight;
  tvLight: THREE.PointLight;
  basementLight: THREE.PointLight;
  frontDoorLight: THREE.PointLight;
  updateTVStatic: () => void;
}

export class HouseBuilder {
  private scene: THREE.Scene;
  private collision: CollisionSystem;
  private texGen: TextureGenerator;

  // Shared materials
  private matWall!: THREE.MeshStandardMaterial;
  private matTileWall!: THREE.MeshStandardMaterial;
  private matConcrete!: THREE.MeshStandardMaterial;
  private matWoodFloor!: THREE.MeshStandardMaterial;
  private matTileFloor!: THREE.MeshStandardMaterial;
  private matCeiling!: THREE.MeshStandardMaterial;
  private matDarkWood!: THREE.MeshStandardMaterial;
  private matWarmWood!: THREE.MeshStandardMaterial;
  private matFabricSofa!: THREE.MeshStandardMaterial;
  private matFabricBed!: THREE.MeshStandardMaterial;
  private matMetalRust!: THREE.MeshStandardMaterial;
  private matPorcelain!: THREE.MeshStandardMaterial;
  private matMirror!: THREE.MeshStandardMaterial;

  public frontDoorGroup!: THREE.Group;
  public frontDoorHingeGroup!: THREE.Group;
  public frontDoorBoards: THREE.Mesh[] = [];
  public frontDoorLockMesh!: THREE.Mesh;
  public frontDoorSocketShards: THREE.Mesh[] = [];
  public pendantPickupShardTextures: THREE.CanvasTexture[] = [];
  public mirrorSilhouetteMesh!: THREE.Mesh;

  // Basement Main Power Breaker Switch
  public breakerLeverGroup!: THREE.Group;
  public breakerLedMesh!: THREE.Mesh;
  public breakerLight!: THREE.PointLight;

  // Front Yard Rain System
  private rainLines!: THREE.LineSegments;
  private rainCount = 550;

  // 3D Collectible Paper Notes (#RICK)
  private noteMeshes: Map<string, THREE.Group> = new Map();
  private notePaperTex: THREE.CanvasTexture | null = null;

  constructor(scene: THREE.Scene, collision: CollisionSystem, texGen: TextureGenerator) {
    this.scene = scene;
    this.collision = collision;
    this.texGen = texGen;
    this.initMaterials();
  }

  private initMaterials(): void {
    const woodTex = this.texGen.createWoodFloorTexture(6, 6);
    const wallTex = this.texGen.createWallpaperTexture(5, 1.5);
    const tileTex = this.texGen.createTileTexture(4, 4);
    const concreteTex = this.texGen.createConcreteTexture(5, 5);

    this.matWoodFloor = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.82,
      metalness: 0.05,
    });

    this.matWall = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.9,
      metalness: 0.02,
    });

    this.matTileFloor = new THREE.MeshStandardMaterial({
      map: tileTex,
      roughness: 0.55,
      metalness: 0.1,
    });

    this.matTileWall = new THREE.MeshStandardMaterial({
      map: tileTex,
      color: new THREE.Color(0x9aa6a8),
      roughness: 0.6,
      metalness: 0.08,
    });

    this.matConcrete = new THREE.MeshStandardMaterial({
      map: concreteTex,
      roughness: 0.92,
      metalness: 0.05,
    });

    this.matCeiling = new THREE.MeshStandardMaterial({
      color: 0x1e1d1b,
      roughness: 0.95,
      metalness: 0.0,
    });

    this.matDarkWood = new THREE.MeshStandardMaterial({
      color: 0x2c1d12,
      roughness: 0.75,
      metalness: 0.06,
    });

    this.matWarmWood = new THREE.MeshStandardMaterial({
      color: 0x4a3221,
      roughness: 0.68,
      metalness: 0.08,
    });

    this.matFabricSofa = new THREE.MeshStandardMaterial({
      color: 0x2f3b37,
      roughness: 0.92,
      metalness: 0.0,
    });

    this.matFabricBed = new THREE.MeshStandardMaterial({
      color: 0x3b2d31,
      roughness: 0.9,
      metalness: 0.0,
    });

    this.matMetalRust = new THREE.MeshStandardMaterial({
      color: 0x483c36,
      roughness: 0.45,
      metalness: 0.78,
    });

    this.matPorcelain = new THREE.MeshStandardMaterial({
      color: 0x9ea4a2,
      roughness: 0.32,
      metalness: 0.12,
    });

    this.matMirror = new THREE.MeshStandardMaterial({
      color: 0x455259,
      roughness: 0.12,
      metalness: 0.88,
    });
  }

  public build(): HouseLights {
    this.buildFloorsAndCeilings();
    this.buildWalls();
    this.buildBedroomProps();
    const { tvLight, updateTVStatic } = this.buildLivingRoomProps();
    const kitchenLight = this.buildKitchenProps();
    this.buildBathroomProps();
    const basementLight = this.buildBasementAndStairs();
    const { hallwayLight, frontDoorLight } = this.buildFrontEntranceProps();

    return {
      kitchenLight,
      hallwayLight,
      tvLight,
      basementLight,
      frontDoorLight,
      updateTVStatic,
    };
  }

  private addSolidWall(
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material = this.matWall
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.collision.addMeshCollider(mesh, true, 0.02);
    return mesh;
  }

  /**
   * Builds a wall along the Z axis (thin in X) with a doorway opening
   */
  private addZWallWithDoor(
    x: number,
    zStart: number,
    zEnd: number,
    doorZCenter: number,
    doorWidth = 1.8,
    wallHeight = 3.4,
    doorHeight = 2.45,
    mat: THREE.Material = this.matWall
  ): void {
    const thickness = 0.24;
    const zMin = Math.min(zStart, zEnd);
    const zMax = Math.max(zStart, zEnd);
    const dMin = doorZCenter - doorWidth / 2;
    const dMax = doorZCenter + doorWidth / 2;

    // Segment 1: zMin to dMin
    if (dMin > zMin + 0.05) {
      const len1 = dMin - zMin;
      this.addSolidWall(x, wallHeight / 2, zMin + len1 / 2, thickness, wallHeight, len1, mat);
    }
    // Segment 2: dMax to zMax
    if (zMax > dMax + 0.05) {
      const len2 = zMax - dMax;
      this.addSolidWall(x, wallHeight / 2, dMax + len2 / 2, thickness, wallHeight, len2, mat);
    }
    // Header above doorway
    const headerH = wallHeight - doorHeight;
    if (headerH > 0.05) {
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(thickness, headerH, doorWidth),
        mat
      );
      header.position.set(x, doorHeight + headerH / 2, doorZCenter);
      this.scene.add(header);
      this.collision.occluderMeshes.push(header);
    }

    // Wooden doorframe trim
    this.addDoorFrameZ(x, doorZCenter, doorWidth, doorHeight);
  }

  /**
   * Builds a wall along the X axis (thin in Z) with a doorway opening
   */
  private addXWallWithDoor(
    z: number,
    xStart: number,
    xEnd: number,
    doorXCenter: number,
    doorWidth = 1.8,
    wallHeight = 3.4,
    doorHeight = 2.45,
    mat: THREE.Material = this.matWall
  ): void {
    const thickness = 0.24;
    const xMin = Math.min(xStart, xEnd);
    const xMax = Math.max(xStart, xEnd);
    const dMin = doorXCenter - doorWidth / 2;
    const dMax = doorXCenter + doorWidth / 2;

    if (dMin > xMin + 0.05) {
      const len1 = dMin - xMin;
      this.addSolidWall(xMin + len1 / 2, wallHeight / 2, z, len1, wallHeight, thickness, mat);
    }
    if (xMax > dMax + 0.05) {
      const len2 = xMax - dMax;
      this.addSolidWall(dMax + len2 / 2, wallHeight / 2, z, len2, wallHeight, thickness, mat);
    }
    const headerH = wallHeight - doorHeight;
    if (headerH > 0.05) {
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth, headerH, thickness),
        mat
      );
      header.position.set(doorXCenter, doorHeight + headerH / 2, z);
      this.scene.add(header);
      this.collision.occluderMeshes.push(header);
    }

    this.addDoorFrameX(doorXCenter, z, doorWidth, doorHeight);
  }

  private addDoorFrameZ(x: number, zCenter: number, width: number, height: number): void {
    const frameGroup = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.28, height, 0.1);
    const leftPost = new THREE.Mesh(postGeo, this.matDarkWood);
    leftPost.position.set(x, height / 2, zCenter - width / 2 + 0.05);
    const rightPost = new THREE.Mesh(postGeo, this.matDarkWood);
    rightPost.position.set(x, height / 2, zCenter + width / 2 - 0.05);
    const topLintel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, width + 0.1), this.matDarkWood);
    topLintel.position.set(x, height - 0.04, zCenter);
    frameGroup.add(leftPost, rightPost, topLintel);
    this.scene.add(frameGroup);
  }

  private addDoorFrameX(xCenter: number, z: number, width: number, height: number): void {
    const frameGroup = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.1, height, 0.28);
    const leftPost = new THREE.Mesh(postGeo, this.matDarkWood);
    leftPost.position.set(xCenter - width / 2 + 0.05, height / 2, z);
    const rightPost = new THREE.Mesh(postGeo, this.matDarkWood);
    rightPost.position.set(xCenter + width / 2 - 0.05, height / 2, z);
    const topLintel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.12, 0.3), this.matDarkWood);
    topLintel.position.set(xCenter, height - 0.04, z);
    frameGroup.add(leftPost, rightPost, topLintel);
    this.scene.add(frameGroup);
  }

  private buildFloorsAndCeilings(): void {
    // Main Wood Floor (Bedroom, Hallway, Living Room, Kitchen — reaches Z = -10.0 seamlessly)
    const mainFloor = new THREE.Mesh(new THREE.BoxGeometry(22.5, 0.2, 18.4), this.matWoodFloor);
    mainFloor.position.set(0.5, -0.1, -0.8);
    mainFloor.receiveShadow = true;
    this.scene.add(mainFloor);
    this.collision.occluderMeshes.push(mainFloor);

    // Bathroom Tile Floor (offset +0.015 on Y to prevent coplanar Z-fighting)
    const bathFloor = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.04, 7.0), this.matTileFloor);
    bathFloor.position.set(-5.5, 0.01, -4.5);
    bathFloor.receiveShadow = true;
    this.scene.add(bathFloor);

    // Main Ground Floor Ceiling (extends over the stairwell to Z = -16.6 so stairs have full headroom)
    const mainCeiling = new THREE.Mesh(new THREE.BoxGeometry(23.0, 0.2, 25.0), this.matCeiling);
    mainCeiling.position.set(0.5, 3.5, -4.0);
    this.scene.add(mainCeiling);

    // Basement Floor (Y = -3.2, extends from Z = -10.0 under stairs to Z = -25.8)
    const basementFloor = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.25, 16.0), this.matConcrete);
    basementFloor.position.set(0, -3.325, -18.0);
    basementFloor.receiveShadow = true;
    this.scene.add(basementFloor);
    this.collision.occluderMeshes.push(basementFloor);

    // Basement Ceiling (ONLY covers Z = -16.4 to -25.8 so it never blocks the stairwell opening!)
    const basementCeiling = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.25, 9.4), this.matConcrete);
    basementCeiling.position.set(0, 0.25, -21.1);
    this.scene.add(basementCeiling);
    this.collision.occluderMeshes.push(basementCeiling);

    // Upper bulkhead wall at Z = -16.4 closing the gap between basement ceiling (Y=0.25) and upper stairwell ceiling (Y=3.5)
    const stairwellBulkhead = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.25, 0.28), this.matConcrete);
    stairwellBulkhead.position.set(0, 1.85, -16.4);
    this.scene.add(stairwellBulkhead);
    this.collision.occluderMeshes.push(stairwellBulkhead);
  }

  private buildWalls(): void {
    const H = 3.4;

    // 1. Front Entrance South Wall (Z = 8.0, X from -10.5 to 11.5) with Front Doorway at X = 0.0
    this.addXWallWithDoor(8.0, -10.5, 11.5, 0.0, 1.68, H, 2.58, this.matWall);

    // 2. Bedroom West Outer Wall (X = -10.5, Z from 0.0 to 8.0)
    this.addSolidWall(-10.5, H / 2, 4.0, 0.26, H, 8.2, this.matWall);

    // 3. Wall between Bedroom and Bathroom (Z = -0.5, X from -10.5 to -2.5)
    this.addSolidWall(-6.5, H / 2, -0.5, 8.2, H, 0.24, this.matWall);

    // 4. Bathroom West Outer Wall (X = -8.5, Z from -8.0 to -0.5)
    this.addSolidWall(-8.5, H / 2, -4.25, 0.26, H, 7.6, this.matTileWall);

    // 5. Bathroom North Outer Wall (Z = -8.0, X from -8.5 to -2.5)
    this.addSolidWall(-5.5, H / 2, -8.0, 6.2, H, 0.26, this.matTileWall);

    // 6. West Hallway Wall (X = -2.5)
    // Bedroom portion (Z: -0.5 to 8.0) with doorway at Z = 4.0
    this.addZWallWithDoor(-2.5, -0.5, 8.0, 4.0, 1.85, H, 2.45, this.matWall);
    // Bathroom portion (Z: -8.0 to -0.5) with doorway at Z = -4.2
    this.addZWallWithDoor(-2.5, -8.0, -0.5, -4.2, 1.75, H, 2.45, this.matWall);
    // Hallway North-West extension (Z: -10.0 to -8.0)
    this.addSolidWall(-2.5, H / 2, -9.0, 0.24, H, 2.1, this.matWall);

    // 7. East Hallway Wall (X = 2.5)
    // Living Room portion (Z: -1.0 to 8.0) with wide archway at Z = 3.5
    this.addZWallWithDoor(2.5, -1.0, 8.0, 3.5, 2.2, H, 2.55, this.matWall);
    // Kitchen portion (Z: -9.0 to -1.0) with doorway at Z = -5.0
    this.addZWallWithDoor(2.5, -9.0, -1.0, -5.0, 1.85, H, 2.45, this.matWall);
    // Hallway North-East extension (Z: -10.0 to -9.0)
    this.addSolidWall(2.5, H / 2, -9.5, 0.24, H, 1.1, this.matWall);

    // 8. Living Room & Kitchen East Outer Wall (X = 11.5, Z from -9.0 to 8.0)
    this.addSolidWall(11.5, H / 2, -0.5, 0.26, H, 17.2, this.matWall);

    // 9. Wall between Living Room and Kitchen (Z = -1.0, X from 2.5 to 11.5) with doorway at X = 7.0
    this.addXWallWithDoor(-1.0, 2.5, 11.5, 7.0, 1.9, H, 2.45, this.matWall);

    // 10. Kitchen North Outer Wall (Z = -9.0, X from 2.5 to 11.5)
    this.addSolidWall(7.0, H / 2, -9.0, 9.2, H, 0.26, this.matWall);

    // 11. Hallway North Wall (Z = -10.0, X from -2.5 to 2.5) with wide 2.6m archway to Basement Stairs at X = 0
    this.addXWallWithDoor(-10.0, -2.5, 2.5, 0.0, 2.6, H, 2.75, this.matWall);
  }

  private buildBedroomProps(): void {
    // 1. Old Wooden Bed (Composite Group: frame, headboard, footboard, 4 posts, mattress, pillow, blanket)
    const bedGroup = new THREE.Group();
    bedGroup.position.set(-8.4, 0, 5.8);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 1.9), this.matDarkWood);
    frame.position.y = 0.28;
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.35, 1.95), this.matDarkWood);
    headboard.position.set(-1.22, 0.72, 0);
    const footboard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, 1.95), this.matDarkWood);
    footboard.position.set(1.24, 0.45, 0);

    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.26, 1.76), this.matPorcelain);
    mattress.position.set(0.02, 0.54, 0);

    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.28, 1.8), this.matFabricBed);
    blanket.position.set(0.32, 0.55, 0);

    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 1.1), this.matPorcelain);
    pillow.position.set(-0.85, 0.7, 0);
    pillow.rotation.z = 0.12;

    bedGroup.add(frame, headboard, footboard, mattress, blanket, pillow);
    bedGroup.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    this.scene.add(bedGroup);
    this.collision.addBoxCollider(-8.4, 0.6, 5.8, 2.7, 1.3, 2.0, 'bed');

    // 2. Nightstand with open drawer & extinguished candle at (-9.6, 0, 2.5)
    const standGroup = new THREE.Group();
    standGroup.position.set(-9.6, 0, 2.5);

    const standBody = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.85), this.matWarmWood);
    standBody.position.y = 0.38;
    const standTop = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.95), this.matDarkWood);
    standTop.position.y = 0.78;

    // Pulled-out drawer (sticking out toward +X so player sees inside)
    const drawerBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.68), this.matWarmWood);
    drawerBox.position.set(0.38, 0.56, 0);
    const drawerHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16), this.matMetalRust);
    drawerHandle.rotation.x = Math.PI / 2;
    drawerHandle.position.set(0.67, 0.56, 0);

    // Candle on top
    const candleHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 12), this.matMetalRust);
    candleHolder.position.set(-0.1, 0.82, -0.15);
    const candleWax = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.045, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: 0xc2b8a3, roughness: 0.6 })
    );
    candleWax.position.set(-0.1, 0.92, -0.15);

    standGroup.add(standBody, standTop, drawerBox, drawerHandle, candleHolder, candleWax);
    this.scene.add(standGroup);
    this.collision.addBoxCollider(-9.5, 0.45, 2.5, 1.1, 0.9, 0.95, 'nightstand');

    // Warm dim bedroom lamp light
    const bedroomLight = new THREE.PointLight(0xffb46b, 0.45, 7.5, 2);
    bedroomLight.position.set(-6.5, 2.9, 4.0);
    this.scene.add(bedroomLight);

    // 3. Slightly Open Wardrobe at (-4.3, 0, 7.1)
    const wardrobe = new THREE.Group();
    wardrobe.position.set(-4.3, 0, 7.1);
    const wBody = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.35, 0.95), this.matDarkWood);
    wBody.position.y = 1.18;
    const wDoorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.82, 2.2, 0.06), this.matWarmWood);
    wDoorLeft.position.set(-0.42, 1.18, -0.5);
    const wDoorRight = new THREE.Mesh(new THREE.BoxGeometry(0.82, 2.2, 0.06), this.matWarmWood);
    wDoorRight.position.set(0.52, 1.18, -0.68);
    wDoorRight.rotation.y = -0.48; // slightly ajar
    wardrobe.add(wBody, wDoorLeft, wDoorRight);
    this.scene.add(wardrobe);
    this.collision.addBoxCollider(-4.3, 1.2, 7.1, 1.8, 2.4, 1.15, 'wardrobe');
    this.collision.occluderMeshes.push(wBody);

    // 4. Pile of Human Bones (Setumpuk Tulang Belulang Manusia) at (-7.25, 0, 1.05)
    this.buildBedroomSkeletonPile();
  }

  private buildBedroomSkeletonPile(): void {
    const pileGroup = new THREE.Group();
    pileGroup.position.set(-7.25, 0, 1.05);

    const matBoneLight = new THREE.MeshStandardMaterial({
      color: 0xd8ceb8,
      roughness: 0.82,
      metalness: 0.05,
    });
    const matBoneAged = new THREE.MeshStandardMaterial({
      color: 0xb5a689,
      roughness: 0.9,
      metalness: 0.04,
    });
    const matSocketDark = new THREE.MeshBasicMaterial({ color: 0x050303 });
    const matBloodStain = new THREE.MeshStandardMaterial({
      color: 0x240707,
      roughness: 0.95,
      metalness: 0.05,
    });

    // Dark dried blood & decay stain beneath the bone pile
    const mainStain = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), matBloodStain);
    mainStain.rotation.x = -Math.PI / 2;
    mainStain.position.set(0, 0.012, 0);
    mainStain.scale.set(1.25, 0.92, 1);
    pileGroup.add(mainStain);

    const subStain = new THREE.Mesh(new THREE.CircleGeometry(0.48, 16), matBloodStain);
    subStain.rotation.x = -Math.PI / 2;
    subStain.position.set(0.55, 0.013, 0.38);
    pileGroup.add(subStain);

    // Helper to create an anatomical long bone (femur, tibia, humerus, radius) with condyle joints at both ends
    const createLongBone = (length: number, radius: number, mat: THREE.Material): THREE.Group => {
      const bone = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.78, radius * 0.85, length, 8),
        mat
      );
      shaft.rotation.z = Math.PI / 2;
      bone.add(shaft);

      const jointGeo = new THREE.SphereGeometry(radius * 1.35, 8, 8);
      const halfL = length * 0.5;
      [-1, 1].forEach((endSign) => {
        const knob1 = new THREE.Mesh(jointGeo, mat);
        knob1.position.set(endSign * halfL, radius * 0.42, radius * 0.35);
        const knob2 = new THREE.Mesh(jointGeo, mat);
        knob2.position.set(endSign * halfL, -radius * 0.35, -radius * 0.42);
        bone.add(knob1, knob2);
      });
      return bone;
    };

    // Helper to create a detailed 3D human skull with hollow eye sockets, nasal cavity, cheekbones & jaw
    const createHumanSkull = (mat: THREE.Material, jawOpenAngle = 0.28): THREE.Group => {
      const skull = new THREE.Group();

      // Cranium dome
      const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), mat);
      cranium.scale.set(0.92, 1.02, 1.15);
      cranium.position.set(0, 0.13, -0.02);

      // Upper face / maxilla
      const faceBlock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.12), mat);
      faceBlock.position.set(0, 0.075, 0.085);

      // Cheekbones (zygomatic arches)
      const cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 0.06), mat);
      cheekL.position.set(0, 0.085, 0.075);

      // Hollow black eye sockets
      const eyeSocketGeo = new THREE.SphereGeometry(0.033, 10, 10);
      const leftEye = new THREE.Mesh(eyeSocketGeo, matSocketDark);
      leftEye.scale.set(1.0, 0.88, 0.65);
      leftEye.position.set(-0.042, 0.105, 0.128);

      const rightEye = new THREE.Mesh(eyeSocketGeo, matSocketDark);
      rightEye.scale.set(1.0, 0.88, 0.65);
      rightEye.position.set(0.042, 0.105, 0.128);

      // Hollow nasal cavity
      const noseHole = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.045, 3), matSocketDark);
      noseHole.rotation.x = Math.PI / 2;
      noseHole.position.set(0, 0.068, 0.138);

      // Lower jaw / mandible
      const jawGroup = new THREE.Group();
      jawGroup.position.set(0, 0.04, 0.04);
      jawGroup.rotation.x = jawOpenAngle;
      const mandible = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.042, 0.12), mat);
      mandible.position.set(0, -0.015, 0.05);

      // Upper & lower teeth rows
      for (let t = -3; t <= 3; t++) {
        const toothU = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.018, 0.014), matBoneLight);
        toothU.position.set(t * 0.017, 0.022, 0.138 - Math.abs(t) * 0.005);
        skull.add(toothU);

        const toothL = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.016, 0.013), matBoneLight);
        toothL.position.set(t * 0.016, 0.008, 0.102 - Math.abs(t) * 0.004);
        jawGroup.add(toothL);
      }

      jawGroup.add(mandible);
      skull.add(cranium, faceBlock, cheekL, leftEye, rightEye, noseHole, jawGroup);
      return skull;
    };

    // 1. Base Mound of Crossed Long Bones (Femurs, Tibias, Humeri, Forearms)
    const bonePlacements: Array<{
      len: number;
      rad: number;
      pos: [number, number, number];
      rot: [number, number, number];
      aged?: boolean;
    }> = [
      // Bottom layer scattered wide
      { len: 0.56, rad: 0.028, pos: [-0.35, 0.035, 0.22], rot: [0.05, 0.45, -0.06] },
      { len: 0.54, rad: 0.027, pos: [0.32, 0.035, -0.18], rot: [-0.04, -0.62, 0.05], aged: true },
      { len: 0.48, rad: 0.024, pos: [-0.18, 0.032, -0.36], rot: [0.02, 1.15, 0.04] },
      { len: 0.52, rad: 0.026, pos: [0.25, 0.035, 0.34], rot: [0.06, -0.28, -0.04] },
      { len: 0.44, rad: 0.022, pos: [-0.52, 0.03, -0.08], rot: [-0.03, 0.88, 0.02], aged: true },
      { len: 0.46, rad: 0.023, pos: [0.54, 0.03, 0.12], rot: [0.04, -1.05, -0.03] },
      { len: 0.38, rad: 0.019, pos: [0.08, 0.028, 0.52], rot: [0.02, 0.18, 0.03], aged: true },
      { len: 0.42, rad: 0.021, pos: [-0.12, 0.03, -0.52], rot: [-0.02, -0.4, 0.02] },
      // Middle stacked layer
      { len: 0.55, rad: 0.028, pos: [-0.14, 0.085, 0.08], rot: [0.18, -0.52, 0.14] },
      { len: 0.50, rad: 0.025, pos: [0.16, 0.09, -0.06], rot: [-0.15, 0.74, -0.12], aged: true },
      { len: 0.46, rad: 0.023, pos: [0.02, 0.11, 0.20], rot: [0.22, 1.32, -0.18] },
      { len: 0.48, rad: 0.024, pos: [-0.22, 0.10, -0.16], rot: [-0.2, -1.1, 0.16], aged: true },
      { len: 0.40, rad: 0.020, pos: [0.26, 0.08, 0.16], rot: [0.14, 0.25, -0.22] },
      { len: 0.42, rad: 0.021, pos: [-0.06, 0.13, -0.12], rot: [0.28, -0.15, 0.24] },
      // Upper crossed bones
      { len: 0.52, rad: 0.026, pos: [0.08, 0.16, 0.04], rot: [-0.25, 0.95, 0.22] },
      { len: 0.45, rad: 0.022, pos: [-0.12, 0.17, 0.06], rot: [0.32, -0.78, -0.2] },
      { len: 0.38, rad: 0.018, pos: [0.18, 0.14, -0.15], rot: [-0.18, 0.42, 0.28], aged: true },
      // Outlier bones spilled toward player spawn
      { len: 0.50, rad: 0.025, pos: [0.68, 0.026, 0.58], rot: [0.0, -0.55, 0.02] },
      { len: 0.36, rad: 0.018, pos: [0.42, 0.022, 0.72], rot: [0.0, 0.35, -0.02], aged: true },
    ];

    bonePlacements.forEach((b) => {
      const mesh = createLongBone(b.len, b.rad, b.aged ? matBoneAged : matBoneLight);
      mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
      mesh.rotation.set(b.rot[0], b.rot[1], b.rot[2]);
      pileGroup.add(mesh);
    });

    // 2. Broken Ribcage & Spine (Tulang Rusuk & Tulang Belakang) resting on the mound
    const ribcageGroup = new THREE.Group();
    ribcageGroup.position.set(-0.08, 0.18, -0.04);
    ribcageGroup.rotation.set(0.25, 0.65, -0.18);

    // Vertebrae column
    for (let v = 0; v < 9; v++) {
      const vert = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.028, 0.036, 8),
        v % 2 === 0 ? matBoneLight : matBoneAged
      );
      vert.rotation.x = Math.PI / 2;
      vert.position.set(0, -0.04 + Math.sin(v * 0.25) * 0.02, (v - 4) * 0.048);

      const spineProcess = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.02), matBoneAged);
      spineProcess.position.set(0, -0.06, (v - 4) * 0.048);
      ribcageGroup.add(vert, spineProcess);
    }

    // Curved Pairs of Ribs
    for (let r = 0; r < 7; r++) {
      const ribScale = 1.0 - Math.abs(r - 3) * 0.11;
      [-1, 1].forEach((side) => {
        const ribArc = new THREE.Mesh(
          new THREE.TorusGeometry(0.13 * ribScale, 0.011, 6, 12, Math.PI * 0.78),
          r % 2 === 0 ? matBoneLight : matBoneAged
        );
        ribArc.position.set(side * 0.02, 0.02, (r - 3) * 0.05);
        ribArc.rotation.y = side > 0 ? Math.PI * 0.08 : Math.PI * 0.92;
        ribArc.rotation.z = side * 0.18;
        ribcageGroup.add(ribArc);
      });
    }

    // Sternum bone on top of ribcage
    const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.016, 0.24), matBoneLight);
    sternum.position.set(0, 0.13, 0.0);
    ribcageGroup.add(sternum);
    pileGroup.add(ribcageGroup);

    // 3. Pelvis / Hip Bone Structure (Tulang Panggul)
    const pelvisGroup = new THREE.Group();
    pelvisGroup.position.set(-0.28, 0.11, 0.24);
    pelvisGroup.rotation.set(-0.35, 0.85, 0.22);
    const leftIlium = new THREE.Mesh(
      new THREE.TorusGeometry(0.095, 0.022, 7, 12, Math.PI * 1.25),
      matBoneAged
    );
    leftIlium.position.set(-0.08, 0, 0);
    const rightIlium = new THREE.Mesh(
      new THREE.TorusGeometry(0.095, 0.022, 7, 12, Math.PI * 1.25),
      matBoneAged
    );
    rightIlium.position.set(0.08, 0, 0);
    rightIlium.rotation.y = Math.PI;
    const sacrum = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 5), matBoneLight);
    sacrum.rotation.x = Math.PI;
    pelvisGroup.add(leftIlium, rightIlium, sacrum);
    pileGroup.add(pelvisGroup);

    // 4. Primary Human Skull atop the bone pile staring toward the player's starting spot
    const mainSkull = createHumanSkull(matBoneLight, 0.34);
    mainSkull.position.set(0.04, 0.27, 0.06);
    mainSkull.rotation.set(-0.14, 0.58, 0.08);
    pileGroup.add(mainSkull);

    // 5. Second Cracked/Aged Human Skull lying on its side at the base of the pile
    const sideSkull = createHumanSkull(matBoneAged, 0.18);
    sideSkull.position.set(-0.38, 0.09, -0.18);
    sideSkull.rotation.set(0.42, 1.35, -0.78);
    pileGroup.add(sideSkull);

    // 6. Skeletal Hand & Finger Bones (Tulang Tangan) reaching across the floorboards
    const handGroup = new THREE.Group();
    handGroup.position.set(0.56, 0.018, 0.48);
    handGroup.rotation.y = 0.62;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.085), matBoneLight);
    handGroup.add(palm);
    for (let f = 0; f < 5; f++) {
      const angle = (f - 2) * 0.16;
      const fingerLen = f === 0 ? 0.055 : 0.085 - Math.abs(f - 2) * 0.01;
      const finger = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.0065, fingerLen, 6),
        matBoneLight
      );
      finger.rotation.x = Math.PI / 2;
      finger.rotation.z = -angle;
      finger.position.set((f - 2) * 0.018, 0.002, 0.045 + fingerLen * 0.5);
      handGroup.add(finger);
    }
    pileGroup.add(handGroup);

    pileGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.scene.add(pileGroup);

    // Subtle eerie highlight on the bone pile so it stands out in the dim bedroom
    const boneLight = new THREE.PointLight(0xd9a066, 0.32, 3.2, 2);
    boneLight.position.set(-7.2, 0.85, 1.15);
    this.scene.add(boneLight);

    // Low floor collider for the bone heap
    this.collision.addBoxCollider(-7.25, 0.25, 1.05, 0.95, 0.5, 0.95, 'bedroom_bone_pile');

    // Rick's Note #1 resting right on the human bone pile
    this.createPaperNoteMesh(
      'note_bedroom_bones',
      new THREE.Vector3(-7.05, 0.21, 1.25),
      new THREE.Euler(-0.18, 0.55, 0.08)
    );
  }

  private buildLivingRoomProps(): { tvLight: THREE.PointLight; updateTVStatic: () => void } {
    // 1. Dusty Rug (offset Y = 0.015 to avoid Z-fighting)
    const rugTex = this.texGen.createRugTexture();
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 3.2),
      new THREE.MeshStandardMaterial({ map: rugTex, roughness: 0.95 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(7.0, 0.015, 4.2);
    rug.receiveShadow = true;
    this.scene.add(rug);

    // 2. Worn Sofa at (7.0, 0, 6.5) facing North (-Z)
    const sofaGroup = new THREE.Group();
    sofaGroup.position.set(7.0, 0, 6.5);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.42, 0.95), this.matFabricSofa);
    seat.position.y = 0.28;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.65, 0.25), this.matFabricSofa);
    back.position.set(0, 0.68, 0.36);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 1.0), this.matFabricSofa);
    armL.position.set(-1.32, 0.42, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 1.0), this.matFabricSofa);
    armR.position.set(1.32, 0.42, 0);
    sofaGroup.add(seat, back, armL, armR);
    this.scene.add(sofaGroup);
    this.collision.addBoxCollider(7.0, 0.5, 6.5, 2.95, 1.0, 1.1, 'sofa');

    // Rick's Note #2 resting on the Living Room sofa seat cushion
    this.createPaperNoteMesh(
      'note_living_sofa',
      new THREE.Vector3(6.65, 0.505, 6.38),
      new THREE.Euler(0, 0.28, 0)
    );

    // 3. Coffee Table at (7.0, 0, 3.9) with open space underneath for Pendant #2
    const tableGroup = new THREE.Group();
    tableGroup.position.set(7.0, 0, 3.9);
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.07, 0.9), this.matWarmWood);
    tableTop.position.y = 0.52;
    const lowerShelf = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.72), this.matDarkWood);
    lowerShelf.position.y = 0.14;

    const legGeo = new THREE.BoxGeometry(0.07, 0.52, 0.07);
    const positions = [
      [-0.74, 0.26, -0.38],
      [0.74, 0.26, -0.38],
      [-0.74, 0.26, 0.38],
      [0.74, 0.26, 0.38],
    ];
    positions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, this.matDarkWood);
      leg.position.set(lx, ly, lz);
      tableGroup.add(leg);
    });
    tableGroup.add(tableTop, lowerShelf);
    this.scene.add(tableGroup);
    this.collision.addBoxCollider(7.0, 0.3, 3.9, 1.7, 0.6, 0.95, 'coffee_table');

    // 4. Old CRT Television on stand at (10.5, 0, 3.9) facing West (-X)
    const tvGroup = new THREE.Group();
    tvGroup.position.set(10.5, 0, 3.9);

    const tvStand = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 1.3), this.matDarkWood);
    tvStand.position.y = 0.325;

    const tvCasing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.76), this.matWarmWood);
    tvCasing.position.set(0, 0.94, 0);

    const { texture: staticTex, update: updateTVStatic } = this.texGen.createTVStaticTexture();
    const screenMat = new THREE.MeshBasicMaterial({ map: staticTex });
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.44), screenMat);
    tvScreen.rotation.y = -Math.PI / 2;
    tvScreen.position.set(-0.315, 0.95, 0);

    // Rabbit-ear antenna
    const antGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.45);
    const ant1 = new THREE.Mesh(antGeo, this.matMetalRust);
    ant1.position.set(0, 1.38, -0.12);
    ant1.rotation.x = -0.4;
    const ant2 = new THREE.Mesh(antGeo, this.matMetalRust);
    ant2.position.set(0, 1.38, 0.12);
    ant2.rotation.x = 0.4;

    tvGroup.add(tvStand, tvCasing, tvScreen, ant1, ant2);
    this.scene.add(tvGroup);
    this.collision.addBoxCollider(10.5, 0.7, 3.9, 0.95, 1.4, 1.35, 'tv_stand');

    const tvLight = new THREE.PointLight(0x9bc4e2, 0.65, 6.5, 2);
    tvLight.position.set(9.8, 1.0, 3.9);
    this.scene.add(tvLight);

    // 5. Bookshelf along East wall at (10.7, 0, 0.9)
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(10.7, 0, 0.9);
    const shelfBack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.1, 1.6), this.matDarkWood);
    shelfBack.position.y = 1.05;
    shelfGroup.add(shelfBack);
    this.scene.add(shelfGroup);
    this.collision.addBoxCollider(10.7, 1.05, 0.9, 0.55, 2.1, 1.65, 'bookshelf');

    return { tvLight, updateTVStatic };
  }

  private buildKitchenProps(): THREE.PointLight {
    // 1. Kitchen Counters along East wall (X = 10.6, Z from -8.5 to -3.0)
    const counterGroup = new THREE.Group();
    const mainCounter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 4.2), this.matWarmWood);
    mainCounter.position.set(10.6, 0.45, -5.8);
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.06, 4.3), this.matPorcelain);
    counterTop.position.set(10.6, 0.92, -5.8);

    // Ajar Lower Cabinet Door at Z = -6.2 for Pendant #3
    const cabinetRecess = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.65, 0.75),
      new THREE.MeshStandardMaterial({ color: 0x150d08, roughness: 0.95 })
    );
    cabinetRecess.position.set(10.12, 0.42, -6.2);

    const openCabDoor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.68, 0.65), this.matDarkWood);
    openCabDoor.position.set(9.78, 0.42, -5.92);
    openCabDoor.rotation.y = 0.85;

    // Upper hanging cabinet
    const upperCab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 3.2), this.matDarkWood);
    upperCab.position.set(10.85, 2.25, -5.5);

    counterGroup.add(mainCounter, counterTop, cabinetRecess, openCabDoor, upperCab);
    this.scene.add(counterGroup);
    this.collision.addBoxCollider(10.6, 0.5, -5.8, 1.25, 1.0, 4.3, 'kitchen_counter');

    // 2. Old Refrigerator at (4.1, 0, -8.1)
    const fridgeGroup = new THREE.Group();
    fridgeGroup.position.set(4.1, 0, -8.1);
    const fridgeBody = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.05, 0.95), this.matPorcelain);
    fridgeBody.position.y = 1.025;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.06), this.matMetalRust);
    handle.position.set(0.4, 1.15, 0.5);
    fridgeGroup.add(fridgeBody, handle);
    this.scene.add(fridgeGroup);
    this.collision.addBoxCollider(4.1, 1.0, -8.1, 1.15, 2.1, 1.05, 'fridge');
    this.collision.occluderMeshes.push(fridgeBody);

    // 3. Dining Table with Tipped Chair at (6.6, 0, -4.8)
    const diningGroup = new THREE.Group();
    diningGroup.position.set(6.6, 0, -4.8);
    const dTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.25), this.matWarmWood);
    dTop.position.y = 0.78;
    const dLegGeo = new THREE.BoxGeometry(0.08, 0.78, 0.08);
    [
      [-0.75, 0.39, -0.52],
      [0.75, 0.39, -0.52],
      [-0.75, 0.39, 0.52],
      [0.75, 0.39, 0.52],
    ].forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(dLegGeo, this.matDarkWood);
      leg.position.set(lx, ly, lz);
      diningGroup.add(leg);
    });

    // Tipped chair on floor nearby
    const tippedChair = new THREE.Group();
    tippedChair.position.set(-1.15, 0.25, 0.4);
    tippedChair.rotation.z = Math.PI / 2.1;
    tippedChair.rotation.y = 0.35;
    const cSeat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), this.matDarkWood);
    const cBack = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.52, 0.46), this.matDarkWood);
    cBack.position.set(-0.21, 0.26, 0);
    tippedChair.add(cSeat, cBack);

    diningGroup.add(dTop, tippedChair);
    this.scene.add(diningGroup);
    this.collision.addBoxCollider(6.6, 0.45, -4.8, 1.8, 0.9, 1.35, 'dining_table');

    // Flickering Kitchen Overhead Light
    const kitchenLight = new THREE.PointLight(0xffe0a3, 0.55, 8.5, 2);
    kitchenLight.position.set(7.0, 3.1, -5.0);
    this.scene.add(kitchenLight);

    return kitchenLight;
  }

  private buildBathroomProps(): void {
    // 1. Bathtub at (-7.2, 0, -6.2)
    const tubGroup = new THREE.Group();
    tubGroup.position.set(-7.2, 0, -6.2);
    const tubOuter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 2.1), this.matPorcelain);
    tubOuter.position.y = 0.35;
    const tubInner = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.1, 1.82),
      new THREE.MeshStandardMaterial({ color: 0x262e2e, roughness: 0.4 })
    );
    tubInner.position.y = 0.64;
    const faucet = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.12), this.matMetalRust);
    faucet.position.set(0, 0.74, -0.95);
    tubGroup.add(tubOuter, tubInner, faucet);
    this.scene.add(tubGroup);
    this.collision.addBoxCollider(-7.2, 0.4, -6.2, 1.2, 0.8, 2.2, 'bathtub');

    // 2. Pedestal Sink & Mirror at (-5.5, 0, -1.55) against North side of Bathroom wall (Z = -0.5)
    const sinkGroup = new THREE.Group();
    sinkGroup.position.set(-5.5, 0, -1.25);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.82, 12), this.matPorcelain);
    pedestal.position.y = 0.41;
    const basin = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.58), this.matPorcelain);
    basin.position.y = 0.84;
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), this.matMetalRust);
    tap.position.set(0, 0.98, 0.18);

    // Old Mirror above sink
    const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.15, 0.06), this.matDarkWood);
    mirrorFrame.position.set(0, 1.68, 0.48);
    const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.0), this.matMirror);
    mirrorGlass.rotation.y = Math.PI;
    mirrorGlass.position.set(0, 1.68, 0.44);

    // Hidden eerie silhouette inside the mirror for brief horror event
    this.mirrorSilhouetteMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.78),
      new THREE.MeshBasicMaterial({
        color: 0x050507,
        transparent: true,
        opacity: 0.0,
      })
    );
    this.mirrorSilhouetteMesh.rotation.y = Math.PI;
    this.mirrorSilhouetteMesh.position.set(0, 1.6, 0.435);

    sinkGroup.add(pedestal, basin, tap, mirrorFrame, mirrorGlass, this.mirrorSilhouetteMesh);
    this.scene.add(sinkGroup);
    this.collision.addBoxCollider(-5.5, 0.5, -1.25, 0.95, 1.0, 0.7, 'sink');

    // Dim cold bathroom bulb
    const bathLight = new THREE.PointLight(0xa3c9d9, 0.35, 6.0, 2);
    bathLight.position.set(-5.5, 2.9, -4.2);
    this.scene.add(bathLight);
  }

  private buildBasementAndStairs(): THREE.PointLight {
    // 1. Staircase descending from Z = -10.0 (Y = 0) to Z = -16.4 (Y = -3.2)
    // Width = 2.6m (X from -1.3 to +1.3), flush with the Z = -10.0 doorway
    const stepCount = 16;
    const totalRun = 6.4;
    const totalDrop = 3.2;
    const stepDepth = totalRun / stepCount;
    const stepDrop = totalDrop / stepCount;

    for (let i = 0; i < stepCount; i++) {
      const topY = -i * stepDrop;
      const stepHeight = Math.max(0.45, topY - -3.35);
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, stepHeight, stepDepth + 0.05),
        this.matDarkWood
      );
      const sz = -10.0 - (i + 0.5) * stepDepth;
      const sy = topY - stepHeight / 2;
      step.position.set(0, sy, sz);
      step.receiveShadow = true;
      step.castShadow = true;
      this.scene.add(step);
    }

    // Wooden handrails along both sides of the staircase
    const railLength = Math.hypot(totalRun, totalDrop);
    const railAngle = Math.atan2(totalDrop, totalRun);
    [-1.22, 1.22].forEach((rx) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.08, railLength),
        this.matWarmWood
      );
      rail.position.set(rx, -1.6 + 0.9, -13.2);
      rail.rotation.x = -railAngle;
      this.scene.add(rail);
    });

    // Stairwell enclosing side walls (inner faces at X = -1.3 and X = +1.3, Z from -10.0 to -16.4)
    this.addSolidWall(-1.45, 0.1, -13.2, 0.3, 6.8, 6.6, this.matConcrete);
    this.addSolidWall(1.45, 0.1, -13.2, 0.3, 6.8, 6.6, this.matConcrete);

    // Dedicated Stairwell Overhead Light so the stairs are clearly visible
    const stairLight = new THREE.PointLight(0xffbe7a, 0.5, 8.0, 2);
    stairLight.position.set(0, 2.2, -13.0);
    this.scene.add(stairLight);

    // 2. Basement Perimeter Concrete Walls (Floor Y = -3.2, Ceiling Y = +0.25)
    const bY = -1.45;
    const bH = 3.6;
    // South wall flanks on either side of the 2.6m staircase landing at Z = -16.4
    this.addSolidWall(-4.4, bY, -16.4, 6.2, bH, 0.3, this.matConcrete);
    this.addSolidWall(4.4, bY, -16.4, 6.2, bH, 0.3, this.matConcrete);
    // West wall (X = -7.5, Z from -25.5 to -16.4)
    this.addSolidWall(-7.5, bY, -21.0, 0.3, bH, 9.4, this.matConcrete);
    // East wall (X = 7.5, Z from -25.5 to -16.4)
    this.addSolidWall(7.5, bY, -21.0, 0.3, bH, 9.4, this.matConcrete);
    // North back wall (Z = -25.5, X from -7.5 to 7.5)
    this.addSolidWall(0.0, bY, -25.5, 15.3, bH, 0.3, this.matConcrete);

    // 3. Wooden Support Columns & Crossbeams in Basement
    const beamCoords = [
      [-3.5, -20.5],
      [3.5, -20.5],
    ];
    beamCoords.forEach(([bx, bz]) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 3.45, 0.36), this.matDarkWood);
      pillar.position.set(bx, -1.48, bz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.scene.add(pillar);
      this.collision.addMeshCollider(pillar, true, 0.04);
    });

    const ceilingBeam = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.24, 0.32), this.matDarkWood);
    ceilingBeam.position.set(0, 0.02, -20.5);
    this.scene.add(ceilingBeam);

    // 4. Old Rusted Boiler / Furnace in North-West Basement Corner
    const boilerGroup = new THREE.Group();
    boilerGroup.position.set(-5.8, -3.2, -18.6);
    const boilerTank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.68, 2.2, 14),
      this.matMetalRust
    );
    boilerTank.position.y = 1.1;
    const boilerPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 1.4, 10),
      this.matMetalRust
    );
    boilerPipe.position.set(0.1, 2.6, 0);
    boilerGroup.add(boilerTank, boilerPipe);
    this.scene.add(boilerGroup);
    this.collision.addBoxCollider(-5.8, -2.0, -18.6, 1.45, 2.5, 1.45, 'boiler');

    // 5. Storage Crates in Basement
    // Hero Crate holding Pendant #5 at (3.8, -3.2, -22.2)
    const heroCrate = new THREE.Group();
    heroCrate.position.set(3.8, -3.2, -22.2);
    const crateBox = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.88, 1.05), this.matWarmWood);
    crateBox.position.y = 0.44;
    const crateRim = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 1.1), this.matDarkWood);
    crateRim.position.y = 0.86;
    heroCrate.add(crateBox, crateRim);
    this.scene.add(heroCrate);
    this.collision.addBoxCollider(3.8, -2.75, -22.2, 1.15, 0.9, 1.15, 'basement_crate');

    // Secondary stacked crates on West side of basement
    const stackCrate1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), this.matDarkWood);
    stackCrate1.position.set(-5.2, -2.7, -22.8);
    const stackCrate2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.9), this.matWarmWood);
    stackCrate2.position.set(-5.1, -1.78, -22.7);
    stackCrate2.rotation.y = 0.3;
    this.scene.add(stackCrate1, stackCrate2);
    this.collision.addBoxCollider(-5.2, -2.2, -22.8, 1.3, 2.0, 1.3, 'basement_stack');

    // Old Wooden Storage Shelf against North Wall at (0, -3.2, -24.7)
    const northShelf = new THREE.Group();
    northShelf.position.set(0, -3.2, -24.7);
    const shelfFrame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 0.65), this.matDarkWood);
    shelfFrame.position.y = 1.05;
    northShelf.add(shelfFrame);
    this.scene.add(northShelf);
    this.collision.addBoxCollider(0, -2.15, -24.7, 3.3, 2.1, 0.75, 'basement_shelf');

    // 6. Main Electrical Power Breaker Box (Saklar Kelistrikan) on Basement North Wall at (-2.5, -1.65, -25.25)
    const breakerBoxGroup = new THREE.Group();
    breakerBoxGroup.position.set(-2.5, -1.65, -25.25);

    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.74, 0.18),
      this.matMetalRust
    );
    const conduitPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.6, 8),
      this.matMetalRust
    );
    conduitPipe.position.set(0, 1.1, -0.02);

    // Warning stripe plate
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.14, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
    );
    plate.position.set(0, 0.2, 0.095);

    // Status LED on Breaker Box (Red when OFF, Emerald Green when ON)
    this.breakerLedMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 1.4,
      })
    );
    this.breakerLedMesh.position.set(-0.14, 0.02, 0.1);

    this.breakerLight = new THREE.PointLight(0xef4444, 0.65, 4.5, 2);
    this.breakerLight.position.set(-2.5, -1.6, -24.85);
    this.scene.add(this.breakerLight);

    // Heavy Lever Switch Handle (rotates from DOWN +0.65 rad to UP -0.65 rad)
    this.breakerLeverGroup = new THREE.Group();
    this.breakerLeverGroup.position.set(0.06, -0.05, 0.09);
    this.breakerLeverGroup.rotation.x = 0.65; // OFF (down position)

    const leverArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.24, 0.04),
      this.matMetalRust
    );
    leverArm.position.set(0, 0.1, 0.04);
    const leverGrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.4 })
    );
    leverGrip.position.set(0, 0.21, 0.06);
    this.breakerLeverGroup.add(leverArm, leverGrip);

    breakerBoxGroup.add(cabinet, conduitPipe, plate, this.breakerLedMesh, this.breakerLeverGroup);
    this.scene.add(breakerBoxGroup);

    // Central Basement Overhead Light + Subtle Crate Area Fill Light
    const basementLight = new THREE.PointLight(0xd99b66, 0.52, 10.5, 2);
    basementLight.position.set(0, -0.15, -20.0);
    this.scene.add(basementLight);

    const crateLanternLight = new THREE.PointLight(0xffa94d, 0.35, 6.0, 2);
    crateLanternLight.position.set(3.8, -1.4, -22.2);
    this.scene.add(crateLanternLight);

    // Weathered Crate near the foot of the Basement Stairs holding Rick's Note #3 at (-1.6, -3.2, -18.2)
    const noteCrateGroup = new THREE.Group();
    noteCrateGroup.position.set(-1.6, -3.2, -18.2);
    const noteCrateBox = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.86, 0.88), this.matDarkWood);
    noteCrateBox.position.y = 0.43;
    const noteCrateTop = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 0.94), this.matWarmWood);
    noteCrateTop.position.y = 0.87;
    noteCrateGroup.add(noteCrateBox, noteCrateTop);
    this.scene.add(noteCrateGroup);
    this.collision.addBoxCollider(-1.6, -2.75, -18.2, 0.96, 0.9, 0.96, 'basement_note_crate');

    this.createPaperNoteMesh(
      'note_basement',
      new THREE.Vector3(-1.6, -2.295, -18.2),
      new THREE.Euler(0, -0.24, 0)
    );

    return basementLight;
  }

  private buildFrontEntranceProps(): {
    hallwayLight: THREE.PointLight;
    frontDoorLight: THREE.PointLight;
  } {
    // 1. Front Escape Door at (0, 0, 7.88)
    this.frontDoorGroup = new THREE.Group();
    this.frontDoorGroup.position.set(0, 0, 7.88);

    // Removable solid collider while the front door is closed
    this.collision.addBoxCollider(0, 1.3, 7.95, 1.8, 2.6, 0.35, 'front_door_panel');

    const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.65, 0.22), this.matWarmWood);
    frameLeft.position.set(-0.88, 1.325, 0);
    const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.65, 0.22), this.matWarmWood);
    frameRight.position.set(0.88, 1.325, 0);
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.22), this.matWarmWood);
    frameTop.position.set(0, 2.6, 0);

    // Hinged door leaf pivoted on left edge (x = -0.82) so it swings open into the yard
    this.frontDoorHingeGroup = new THREE.Group();
    this.frontDoorHingeGroup.position.set(-0.82, 0, 0);

    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.64, 2.55, 0.12), this.matDarkWood);
    doorPanel.position.set(0.82, 1.275, 0);
    this.frontDoorHingeGroup.add(doorPanel);

    // Wooden barricade boards across the front door
    const boardGeo = new THREE.BoxGeometry(1.88, 0.18, 0.08);
    const board1 = new THREE.Mesh(boardGeo, this.matWarmWood);
    board1.position.set(0, 1.65, -0.1);
    board1.rotation.z = 0.07;

    const board2 = new THREE.Mesh(boardGeo, this.matWarmWood);
    board2.position.set(0, 1.05, -0.1);
    board2.rotation.z = -0.05;

    this.frontDoorBoards = [board1, board2];

    // Heavy Circular Seal Frame on the hinged door leaf
    this.frontDoorLockMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.05, 28),
      new THREE.MeshStandardMaterial({
        color: 0x1e1b18,
        emissive: 0x120a08,
        emissiveIntensity: 0.4,
        roughness: 0.45,
        metalness: 0.75,
      })
    );
    this.frontDoorLockMesh.rotation.x = Math.PI / 2;
    this.frontDoorLockMesh.position.set(0.82, 1.38, -0.075);
    this.frontDoorHingeGroup.add(this.frontDoorLockMesh);

    // Load the 5 sliced pendant shards.
    const { doorShardTextures, pickupShardTextures, socketGuideTexture } =
      this.texGen.createPendantShardTextures();
    this.pendantPickupShardTextures = pickupShardTextures;

    // Recessed socket guide showing the faint 5-piece fracture outline on the door
    const guidePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.36),
      new THREE.MeshBasicMaterial({
        map: socketGuideTexture,
        transparent: true,
        depthWrite: false,
      })
    );
    guidePlane.rotation.y = Math.PI; // Faces interior hallway (-Z)
    guidePlane.position.set(0.82, 1.38, -0.105);
    this.frontDoorHingeGroup.add(guidePlane);

    // 5 puzzle shard planes on the front door seal assemble the pendant.
    this.frontDoorSocketShards = [];
    for (let i = 0; i < 5; i++) {
      const shardMat = new THREE.MeshBasicMaterial({
        map: doorShardTextures[i],
        transparent: true,
        depthWrite: false,
      });
      const shardPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), shardMat);
      shardPlane.rotation.y = Math.PI; // Faces interior hallway (-Z)
      shardPlane.position.set(0.82, 1.38, -0.108 - i * 0.001);
      shardPlane.visible = false;
      this.frontDoorSocketShards.push(shardPlane);
      this.frontDoorHingeGroup.add(shardPlane);
    }

    this.frontDoorGroup.add(
      this.frontDoorHingeGroup,
      frameLeft,
      frameRight,
      frameTop,
      board1,
      board2
    );
    this.scene.add(this.frontDoorGroup);

    // 2. Old Coat Hanger at (-1.8, 0, 6.8)
    const coatRack = new THREE.Group();
    coatRack.position.set(-1.8, 0, 6.8);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 10), this.matDarkWood);
    base.position.y = 0.04;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.85, 8), this.matDarkWood);
    pole.position.y = 0.95;
    const hook1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.04), this.matMetalRust);
    hook1.position.y = 1.75;
    coatRack.add(base, pole, hook1);
    this.scene.add(coatRack);
    this.collision.addBoxCollider(-1.8, 0.9, 6.8, 0.5, 1.8, 0.5, 'coat_rack');

    // 3. Build Exterior Front Yard (Halaman Depan) & Falling Rain (Rintik Hujan) outside Z > 8.0
    this.buildFrontYardAndRain();

    // Hallway & Front Door Lights
    const hallwayLight = new THREE.PointLight(0xffca8a, 0.38, 8.0, 2);
    hallwayLight.position.set(0, 3.0, -2.0);
    this.scene.add(hallwayLight);

    const frontDoorLight = new THREE.PointLight(0xff9466, 0.42, 6.0, 2);
    frontDoorLight.position.set(0, 2.85, 6.8);
    this.scene.add(frontDoorLight);

    return { hallwayLight, frontDoorLight };
  }

  /**
   * Builds the atmospheric exterior Front Yard (Z = 8.0 to 22.0) with wet stone walkway,
   * dark lawn, fences, dead trees, streetlamp, and 3D falling rain particles (rintik hujan).
   */
  private buildFrontYardAndRain(): void {
    const yardGroup = new THREE.Group();

    // Wet dark night grass ground
    const lawnMat = new THREE.MeshStandardMaterial({
      color: 0x0b130e,
      roughness: 0.65,
      metalness: 0.1,
    });
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(24.0, 0.2, 15.0), lawnMat);
    lawn.position.set(0, -0.12, 15.5);
    lawn.receiveShadow = true;
    yardGroup.add(lawn);

    // Wet stone walkway from front door (Z = 8.0) out to the yard gate (Z = 19.5)
    const pathMat = new THREE.MeshStandardMaterial({
      map: this.matConcrete.map,
      color: 0x3f464d,
      roughness: 0.28, // wet rain sheen
      metalness: 0.25,
    });
    const walkway = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 11.5), pathMat);
    walkway.position.set(0, -0.01, 13.75);
    walkway.receiveShadow = true;
    yardGroup.add(walkway);

    // Front Porch Overhang Roof & 2 Porch Columns
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 2.2), this.matDarkWood);
    porchRoof.position.set(0, 2.95, 9.1);
    const colL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.95, 0.18), this.matDarkWood);
    colL.position.set(-1.85, 1.47, 9.95);
    const colR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.95, 0.18), this.matDarkWood);
    colR.position.set(1.85, 1.47, 9.95);
    yardGroup.add(porchRoof, colL, colR);

    // Vintage Streetlamp in Front Yard illuminating the falling rain
    const lampPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 3.6, 10),
      this.matMetalRust
    );
    lampPost.position.set(2.1, 1.8, 13.5);
    const lampHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xdbeafe,
        emissive: 0x93c5fd,
        emissiveIntensity: 1.5,
      })
    );
    lampHead.position.set(2.1, 3.65, 13.5);
    const yardLight = new THREE.PointLight(0x93c5fd, 1.4, 16.0, 1.6);
    yardLight.position.set(2.1, 3.5, 13.5);
    yardGroup.add(lampPost, lampHead, yardLight);

    // Wrought-iron/wooden front fence & gate pillars at Z = 18.0
    const fenceLeft = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.3, 0.12), this.matDarkWood);
    fenceLeft.position.set(-5.2, 0.65, 18.0);
    const fenceRight = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.3, 0.12), this.matDarkWood);
    fenceRight.position.set(5.2, 0.65, 18.0);
    yardGroup.add(fenceLeft, fenceRight);

    // Gnarled dark trees in the rainy front yard
    [
      [-4.2, 12.8],
      [4.5, 15.2],
      [-3.6, 16.8],
    ].forEach(([tx, tz]) => {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.28, 3.8, 8),
        this.matDarkWood
      );
      trunk.position.set(tx, 1.9, tz);
      const b1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.11, 2.0, 6),
        this.matDarkWood
      );
      b1.position.set(tx + 0.45, 3.3, tz);
      b1.rotation.z = -0.6;
      const b2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.1, 1.8, 6),
        this.matDarkWood
      );
      b2.position.set(tx - 0.4, 3.1, tz + 0.2);
      b2.rotation.z = 0.55;
      yardGroup.add(trunk, b1, b2);
    });

    // 3D Falling Rain Streaks (Rintik Hujan) in Front Yard
    const rainGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.rainCount * 6); // 2 vertices per raindrop streak
    for (let i = 0; i < this.rainCount; i++) {
      const rx = (Math.random() - 0.5) * 14.0;
      const ry = Math.random() * 6.5;
      const rz = 8.2 + Math.random() * 11.5;
      const idx = i * 6;
      positions[idx] = rx;
      positions[idx + 1] = ry;
      positions[idx + 2] = rz;
      positions[idx + 3] = rx - 0.03;
      positions[idx + 4] = ry - 0.42;
      positions[idx + 5] = rz;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xbfdbfe,
      transparent: true,
      opacity: 0.58,
    });
    this.rainLines = new THREE.LineSegments(rainGeo, rainMat);
    this.rainLines.frustumCulled = false;
    yardGroup.add(this.rainLines);

    this.scene.add(yardGroup);
  }

  public updateRain(delta: number): void {
    if (!this.rainLines) return;
    const posAttr = this.rainLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const fallSpeed = 9.5 * delta;

    for (let i = 0; i < this.rainCount; i++) {
      const idx = i * 6;
      arr[idx + 1] -= fallSpeed;
      arr[idx + 4] -= fallSpeed;
      if (arr[idx + 4] < 0.0) {
        const newY = 6.2 + Math.random() * 0.8;
        arr[idx + 1] = newY;
        arr[idx + 4] = newY - 0.42;
      }
    }
    posAttr.needsUpdate = true;
  }

  public updateFrontDoorSockets(insertedCount: number): void {
    this.frontDoorSocketShards.forEach((shard, idx) => {
      shard.visible = idx < insertedCount;
    });

    if (insertedCount === 0) {
      // Reset door closed, boards intact, breaker OFF
      this.frontDoorHingeGroup.rotation.y = 0;
      this.collision.setColliderEnabledByTag('front_door_panel', true);

      if (this.frontDoorBoards.length >= 2) {
        this.frontDoorBoards[0].position.set(0, 1.65, -0.1);
        this.frontDoorBoards[0].rotation.set(0, 0, 0.07);
        this.frontDoorBoards[1].position.set(0, 1.05, -0.1);
        this.frontDoorBoards[1].rotation.set(0, 0, -0.05);
      }
      const lockMat = this.frontDoorLockMesh.material as THREE.MeshStandardMaterial;
      lockMat.color.setHex(0x451212);
      lockMat.emissive.setHex(0x2a0808);
      lockMat.emissiveIntensity = 0.6;

      if (this.breakerLeverGroup) {
        this.breakerLeverGroup.rotation.x = 0.65;
      }
      if (this.breakerLedMesh) {
        const ledMat = this.breakerLedMesh.material as THREE.MeshStandardMaterial;
        ledMat.color.setHex(0xef4444);
        ledMat.emissive.setHex(0xdc2626);
      }
      if (this.breakerLight) {
        this.breakerLight.color.setHex(0xef4444);
      }
    }
  }

  /**
   * Called when the 5th pendant is inserted into the Front Door:
   * Drops the wooden boards, lights up all 5 shards, but the door stays CLOSED
   * because the magnetic lock requires Basement Electrical Power!
   */
  public setFrontDoorSealCompleteNoPowerVisual(): void {
    this.updateFrontDoorSockets(5);
    if (this.frontDoorBoards.length >= 2) {
      this.frontDoorBoards[0].position.set(-0.2, 0.12, -0.35);
      this.frontDoorBoards[0].rotation.set(Math.PI / 2, 0.2, 0.3);
      this.frontDoorBoards[1].position.set(0.15, 0.08, -0.45);
      this.frontDoorBoards[1].rotation.set(Math.PI / 2, -0.15, -0.25);
    }
    const mat = this.frontDoorLockMesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(0xdc2626);
    mat.emissive.setHex(0x991b1b);
    mat.emissiveIntensity = 1.4;
  }

  /**
   * Called when the Basement Power Breaker Switch is turned ON after 5 pendants are inserted:
   * Flips the breaker lever UP, turns the indicator green, unlatches & swings the Front Door
   * wide open to reveal the Front Yard with falling rain!
   */
  public activateBasementPowerAndOpenFrontDoor(): void {
    if (this.breakerLeverGroup) {
      this.breakerLeverGroup.rotation.x = -0.65; // Flipped UP (ON)
    }
    if (this.breakerLedMesh) {
      const ledMat = this.breakerLedMesh.material as THREE.MeshStandardMaterial;
      ledMat.color.setHex(0x22c55e);
      ledMat.emissive.setHex(0x16a34a);
    }
    if (this.breakerLight) {
      this.breakerLight.color.setHex(0x22c55e);
      this.breakerLight.intensity = 1.1;
    }

    // Unlock and swing open the Front Door leaf to reveal the rainy Front Yard
    const mat = this.frontDoorLockMesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(0x22c55e);
    mat.emissive.setHex(0x16a34a);
    mat.emissiveIntensity = 1.3;

    this.frontDoorHingeGroup.rotation.y = -Math.PI * 0.68;
    this.collision.setColliderEnabledByTag('front_door_panel', false);
  }

  private getOrCreateNotePaperTexture(): THREE.CanvasTexture {
    if (this.notePaperTex) return this.notePaperTex;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;

    // Aged yellowed parchment background
    ctx.fillStyle = '#d9cbb3';
    ctx.fillRect(0, 0, 256, 320);

    // Dark vignette edges
    const grad = ctx.createRadialGradient(128, 160, 40, 128, 160, 190);
    grad.addColorStop(0, 'rgba(217, 203, 179, 0)');
    grad.addColorStop(1, 'rgba(65, 45, 28, 0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 320);

    // Dried blood smudge in corner
    ctx.fillStyle = 'rgba(115, 18, 18, 0.45)';
    ctx.beginPath();
    ctx.arc(205, 62, 34, 0, Math.PI * 2);
    ctx.fill();

    // Scrawled dark ink handwriting lines
    ctx.strokeStyle = '#231c18';
    ctx.lineWidth = 4;
    for (let y = 55; y <= 195; y += 26) {
      ctx.beginPath();
      ctx.moveTo(28, y);
      for (let x = 40; x <= 220; x += 18) {
        ctx.lineTo(x, y + (Math.sin(x * 0.3 + y) * 3.5));
      }
      ctx.stroke();
    }

    // Bold "#RICK" scrawl at bottom
    ctx.fillStyle = '#6e1414';
    ctx.font = 'bold 34px serif';
    ctx.fillText('#RICK', 110, 272);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.notePaperTex = tex;
    return tex;
  }

  private createPaperNoteMesh(
    id: string,
    position: THREE.Vector3,
    rotation: THREE.Euler
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);
    group.rotation.copy(rotation);

    const tex = this.getOrCreateNotePaperTexture();
    const paperMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.78,
      metalness: 0.02,
      emissive: new THREE.Color(0x3a2c1a),
      emissiveIntensity: 0.35,
    });

    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.008, 0.33), paperMat);
    sheet.castShadow = true;
    sheet.receiveShadow = true;
    group.add(sheet);

    // Subtle warm point light so the note glints in the dark room
    const glint = new THREE.PointLight(0xffcf87, 0.28, 1.8, 2);
    glint.position.set(0, 0.22, 0);
    group.add(glint);

    this.scene.add(group);
    this.noteMeshes.set(id, group);
    return group;
  }

  public setNoteCollected(id: string, collected: boolean): void {
    const mesh = this.noteMeshes.get(id);
    if (mesh) {
      mesh.visible = !collected;
    }
  }

  public resetNotes(): void {
    this.noteMeshes.forEach((mesh) => {
      mesh.visible = true;
    });
  }
}
