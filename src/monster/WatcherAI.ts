import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AudioManager } from '../audio/AudioManager';
import { MonsterState } from '../game/GameState';
import { CollisionSystem } from '../world/CollisionSystem';
import { TextureGenerator } from '../world/TextureGenerator';

interface Waypoint {
  id: string;
  pos: THREE.Vector3;
  neighbors: string[];
}

const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _toCheckPoint = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _projScreenMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();

export class WatcherAI {
  public state: MonsterState = MonsterState.DORMANT;
  public group: THREE.Group;
  public position = new THREE.Vector3(0, 0, -9.0);
  public isVisibleToPlayer = false;
  public distanceToPlayer = 99;

  private scene: THREE.Scene;
  private collision: CollisionSystem;
  private audio: AudioManager;
  private onCatchPlayer: () => void;

  private raycaster = new THREE.Raycaster();
  private checkOffsets: THREE.Vector3[] = [
    new THREE.Vector3(0, 2.22, 0), // Head (~2.43m total height)
    new THREE.Vector3(0, 1.65, 0), // Upper chest
    new THREE.Vector3(0, 1.05, 0), // Pelvis
    new THREE.Vector3(-0.36, 1.6, 0), // Left shoulder
    new THREE.Vector3(0.36, 1.6, 0), // Right shoulder
  ];

  private fallbackGroup!: THREE.Group;
  private gltfModel: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private animAction: THREE.AnimationAction | null = null;
  private eyeLight!: THREE.PointLight;

  private stepTimer = 0;
  private attackTimer = 0;
  private waypoints: Map<string, Waypoint> = new Map();

  private readonly captureDistance = 1.42;
  private readonly monsterRadius = 0.34;

  constructor(
    scene: THREE.Scene,
    collision: CollisionSystem,
    texGen: TextureGenerator,
    audio: AudioManager,
    onCatchPlayer: () => void
  ) {
    this.scene = scene;
    this.collision = collision;
    this.audio = audio;
    this.onCatchPlayer = onCatchPlayer;

    this.group = this.buildWatcherContainer(texGen);
    this.group.visible = false;
    this.scene.add(this.group);

    this.loadExternalMonsterAsset();
    this.initWaypoints();
  }

  /**
   * Creates the root container with a subtle crimson eye light and a dark fallback silhouette
   * while the sculpted 3D GLB monster asset finishes loading.
   */
  private buildWatcherContainer(texGen: TextureGenerator): THREE.Group {
    const root = new THREE.Group();

    this.eyeLight = new THREE.PointLight(0xff1e1e, 0.55, 1.6, 2.0);
    this.eyeLight.position.set(0, 2.16, 0.24);
    root.add(this.eyeLight);

    // Minimal temporary silhouette until GLTF finishes loading (<100ms)
    this.fallbackGroup = new THREE.Group();
    const { map, bumpMap } = texGen.createWatcherSkinTextures();
    const mat = new THREE.MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: 0.03,
      color: 0x141416,
      roughness: 0.45,
      metalness: 0.15,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.9, 8, 12), mat);
    body.position.y = 1.2;
    this.fallbackGroup.add(body);
    root.add(this.fallbackGroup);

    return root;
  }

  /**
   * Loads the sculpted, rigged, and animated 3D horror creature asset (/assets/models/watcher.glb),
   * scales it to ~2.43m tall, applies dark obsidian horror shading, and attaches glowing red eyes
   * directly to the Mixamo head bone.
   */
  private loadExternalMonsterAsset(): void {
    const loader = new GLTFLoader();
    loader.load(
      '/assets/models/watcher.glb',
      (gltf) => {
        const model = gltf.scene;

        // Base GLB height is 1.784m; scaling Y by 1.36 brings total height to ~2.43m
        // while X/Z at 1.18 gives an elongated, towering, gaunt horror proportion.
        model.scale.set(1.18, 1.36, 1.18);
        model.position.set(0, 0, 0);

        let headBone: THREE.Object3D | null = null;

        model.traverse((obj) => {
          if (obj.name === 'mixamorig:Head_06' || obj.name.includes('Head_06')) {
            headBone = obj;
          }

          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            // Prevent skinned mesh from disappearing at camera frustum edges
            mesh.frustumCulled = false;

            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((m) => {
              const stdMat = m as THREE.MeshStandardMaterial;
              if (stdMat && stdMat.isMeshStandardMaterial) {
                // Darken the sculpted PBR flesh into charred obsidian while keeping normal/AO detail
                stdMat.color.setHex(0x3a3235);
                stdMat.roughness = 0.46;
                stdMat.metalness = 0.18;
                stdMat.needsUpdate = true;
              }
            });
          }
        });

        // Attach subtle glowing crimson pinprick eyes to the creature's animated head bone
        const eyeCoreMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
        const eyeHaloMat = new THREE.MeshBasicMaterial({
          color: 0xb91c1c,
          transparent: true,
          opacity: 0.45,
        });

        if (headBone) {
          // Note: Mixamo skeleton inside watcher.glb is in centimeter units (scaled by 0.01 at root)
          const eyeRig = new THREE.Group();
          eyeRig.position.set(0, 10.5, 11.4);

          const leftPin = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 8), eyeCoreMat);
          leftPin.position.set(-3.4, 0, 0);
          const rightPin = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 8), eyeCoreMat);
          rightPin.position.set(3.4, 0, 0);

          const leftHalo = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 8), eyeHaloMat);
          leftHalo.position.set(-3.4, 0, -0.2);
          const rightHalo = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 8), eyeHaloMat);
          rightHalo.position.set(3.4, 0, -0.2);

          eyeRig.add(leftPin, rightPin, leftHalo, rightHalo);
          (headBone as THREE.Object3D).add(eyeRig);

          // Move the subtle red point light onto the head bone so it tracks head motion
          this.eyeLight.position.set(0, 10.5, 18.0);
          (headBone as THREE.Object3D).add(this.eyeLight);
        }

        // Set up skeletal animation mixer
        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(model);
          this.animAction = this.mixer.clipAction(gltf.animations[0]);
          this.animAction.play();
          // Advance slightly so initial pose is natural
          this.mixer.update(0.25);
        }

        this.gltfModel = model;
        this.fallbackGroup.visible = false;
        this.group.add(model);
      },
      undefined,
      (err) => {
        console.warn('Failed to load /assets/models/watcher.glb, using fallback silhouette:', err);
      }
    );
  }

  private initWaypoints(): void {
    const nodes: Waypoint[] = [
      // Hallway spine
      { id: 'hall_south', pos: new THREE.Vector3(0, 0, 5.8), neighbors: ['hall_mid_s', 'living_door', 'bed_door'] },
      { id: 'hall_mid_s', pos: new THREE.Vector3(0, 0, 3.6), neighbors: ['hall_south', 'hall_center', 'bed_door', 'living_door'] },
      { id: 'hall_center', pos: new THREE.Vector3(0, 0, -0.5), neighbors: ['hall_mid_s', 'hall_mid_n'] },
      { id: 'hall_mid_n', pos: new THREE.Vector3(0, 0, -4.5), neighbors: ['hall_center', 'hall_north', 'bath_door', 'kitchen_door'] },
      { id: 'hall_north', pos: new THREE.Vector3(0, 0, -8.6), neighbors: ['hall_mid_n', 'stairs_top'] },

      // Bedroom
      { id: 'bed_door', pos: new THREE.Vector3(-2.5, 0, 4.0), neighbors: ['hall_mid_s', 'bed_center'] },
      { id: 'bed_center', pos: new THREE.Vector3(-6.2, 0, 3.2), neighbors: ['bed_door'] },

      // Bathroom
      { id: 'bath_door', pos: new THREE.Vector3(-2.5, 0, -4.2), neighbors: ['hall_mid_n', 'bath_center'] },
      { id: 'bath_center', pos: new THREE.Vector3(-5.2, 0, -4.2), neighbors: ['bath_door'] },

      // Living Room
      { id: 'living_door', pos: new THREE.Vector3(2.5, 0, 3.5), neighbors: ['hall_mid_s', 'living_center'] },
      { id: 'living_center', pos: new THREE.Vector3(5.2, 0, 2.2), neighbors: ['living_door', 'lk_door'] },

      // Living-Kitchen connector
      { id: 'lk_door', pos: new THREE.Vector3(7.0, 0, -1.0), neighbors: ['living_center', 'kitchen_center'] },

      // Kitchen
      { id: 'kitchen_door', pos: new THREE.Vector3(2.5, 0, -5.0), neighbors: ['hall_mid_n', 'kitchen_center'] },
      { id: 'kitchen_center', pos: new THREE.Vector3(5.0, 0, -3.5), neighbors: ['kitchen_door', 'lk_door'] },

      // Basement Staircase (step-by-step center line X = 0 from Z = -10.2 down to Z = -16.8)
      { id: 'stairs_top', pos: new THREE.Vector3(0, 0, -10.2), neighbors: ['hall_north', 'stairs_upper'] },
      { id: 'stairs_upper', pos: new THREE.Vector3(0, -1.05, -12.2), neighbors: ['stairs_top', 'stairs_lower'] },
      { id: 'stairs_lower', pos: new THREE.Vector3(0, -2.15, -14.4), neighbors: ['stairs_upper', 'stairs_bottom'] },
      { id: 'stairs_bottom', pos: new THREE.Vector3(0, -3.2, -16.8), neighbors: ['stairs_lower', 'basement_entry'] },

      // Basement Room (Y = -3.2)
      { id: 'basement_entry', pos: new THREE.Vector3(0, -3.2, -18.3), neighbors: ['stairs_bottom', 'basement_center', 'basement_east', 'basement_west'] },
      { id: 'basement_center', pos: new THREE.Vector3(0, -3.2, -21.2), neighbors: ['basement_entry', 'basement_east', 'basement_west'] },
      { id: 'basement_east', pos: new THREE.Vector3(2.3, -3.2, -21.8), neighbors: ['basement_entry', 'basement_center'] },
      { id: 'basement_west', pos: new THREE.Vector3(-2.3, -3.2, -21.8), neighbors: ['basement_entry', 'basement_center'] },
    ];

    nodes.forEach((n) => this.waypoints.set(n.id, n));
  }

  public reset(): void {
    this.state = MonsterState.DORMANT;
    this.group.visible = false;
    this.isVisibleToPlayer = false;
    this.distanceToPlayer = 99;
    this.attackTimer = 0;
    this.position.set(0, 0, -9.0);
    this.group.position.copy(this.position);
    this.eyeLight.intensity = 0.55;
    if (this.gltfModel) {
      this.gltfModel.rotation.set(0, 0, 0);
    }
  }

  public activate(playerPos: THREE.Vector3, camera: THREE.Camera): void {
    if (this.state !== MonsterState.DORMANT) return;

    // Pick a spawn waypoint at a safe distance (>= 8.0m) and outside camera view
    camera.getWorldDirection(_camDir);
    let chosenPos = new THREE.Vector3(0, 0, -8.6);
    let bestScore = -Infinity;

    this.waypoints.forEach((wp) => {
      const dist = wp.pos.distanceTo(playerPos);
      if (dist < 7.5 || dist > 18.0) return;

      _toCheckPoint.subVectors(wp.pos, playerPos).normalize();
      const dot = _camDir.dot(_toCheckPoint);
      // Prefer spawning behind the player
      const score = (1 - dot) * 10 - Math.abs(dist - 11.0);
      if (score > bestScore) {
        bestScore = score;
        chosenPos = wp.pos.clone();
      }
    });

    this.position.copy(chosenPos);
    this.position.y = this.collision.getFloorHeight(this.position.x, this.position.z);
    this.group.position.copy(this.position);
    this.group.visible = true;
    this.state = MonsterState.APPROACH;
  }

  /**
   * Core Rule: Determines if The Watcher is inside the player's camera frustum
   * AND has a direct, unobstructed line of sight not blocked by walls.
   */
  public checkVisibility(camera: THREE.PerspectiveCamera, flashlightOn: boolean): boolean {
    if (this.state === MonsterState.DORMANT) return false;

    camera.updateMatrixWorld();
    camera.getWorldPosition(_camPos);
    camera.getWorldDirection(_camDir);

    const dist = _camPos.distanceTo(this.position);
    this.distanceToPlayer = dist;

    // Maximum visibility range depends on whether flashlight is on
    const maxSeeDist = flashlightOn ? 19.5 : 6.5;
    if (dist > maxSeeDist) return false;

    // Build camera frustum
    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);

    // Check 5 body target points
    for (let i = 0; i < this.checkOffsets.length; i++) {
      _toCheckPoint.copy(this.position).add(this.checkOffsets[i]);

      // 1. Must be inside camera frustum
      if (!_frustum.containsPoint(_toCheckPoint)) continue;

      // 2. Confirm within configurable field-of-view cone
      _rayDir.subVectors(_toCheckPoint, _camPos);
      const pointDist = _rayDir.length();
      _rayDir.normalize();

      const dot = _camDir.dot(_rayDir);
      if (dot < 0.45) continue;

      // 3. Raycast against walls and solid occluders
      this.raycaster.set(_camPos, _rayDir);
      this.raycaster.near = 0.1;
      this.raycaster.far = pointDist - 0.18;

      const hits = this.raycaster.intersectObjects(this.collision.occluderMeshes, false);
      if (hits.length === 0) {
        // Direct unobstructed line of sight confirmed!
        return true;
      }
    }

    return false;
  }

  private hasDirectWalkClearance(targetPos: THREE.Vector3): boolean {
    const origin = _toCheckPoint.set(this.position.x, this.position.y + 1.2, this.position.z);
    const dest = new THREE.Vector3(targetPos.x, targetPos.y + 1.2, targetPos.z);
    const dist = origin.distanceTo(dest);
    if (dist < 0.5) return true;

    _rayDir.subVectors(dest, origin).normalize();
    this.raycaster.set(origin, _rayDir);
    this.raycaster.near = 0.1;
    this.raycaster.far = dist - 0.25;
    const hits = this.raycaster.intersectObjects(this.collision.occluderMeshes, false);
    return hits.length === 0;
  }

  private getNextNavigationTarget(playerPos: THREE.Vector3): THREE.Vector3 {
    const monsterOnStairs = this.position.z < -9.8 && this.position.z > -16.6;
    const playerOnStairs = playerPos.z < -9.8 && playerPos.z > -16.6;

    // If same floor (and neither is mid-staircase) with unobstructed clearance, move directly
    if (
      !monsterOnStairs &&
      !playerOnStairs &&
      Math.abs(this.position.y - playerPos.y) < 0.6 &&
      this.hasDirectWalkClearance(playerPos)
    ) {
      return playerPos;
    }

    // Otherwise find shortest path along waypoint graph using BFS
    let startId = 'hall_mid_s';
    let goalId = 'hall_mid_s';
    let bestStartDist = Infinity;
    let bestGoalDist = Infinity;

    this.waypoints.forEach((wp, id) => {
      const dStart =
        Math.hypot(wp.pos.x - this.position.x, wp.pos.z - this.position.z) +
        Math.abs(wp.pos.y - this.position.y) * 1.5;
      if (dStart < bestStartDist) {
        bestStartDist = dStart;
        startId = id;
      }
      const dGoal =
        Math.hypot(wp.pos.x - playerPos.x, wp.pos.z - playerPos.z) +
        Math.abs(wp.pos.y - playerPos.y) * 1.5;
      if (dGoal < bestGoalDist) {
        bestGoalDist = dGoal;
        goalId = id;
      }
    });

    if (startId === goalId) {
      return playerPos;
    }

    // BFS from startId to goalId
    const queue: string[][] = [[startId]];
    const visited = new Set<string>([startId]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const curr = path[path.length - 1];
      if (curr === goalId) {
        const wp0 = this.waypoints.get(path[0])!.pos;
        const wp1 = this.waypoints.get(path[1])!.pos;

        // Project monster position onto segment wp0 -> wp1 so it never walks backward to wp0
        const segX = wp1.x - wp0.x;
        const segZ = wp1.z - wp0.z;
        const toMonsterX = this.position.x - wp0.x;
        const toMonsterZ = this.position.z - wp0.z;
        const dot = toMonsterX * segX + toMonsterZ * segZ;
        const distToWp0 = Math.hypot(toMonsterX, toMonsterZ);

        if (distToWp0 <= 0.75 || dot >= 0) {
          return wp1;
        }
        return wp0;
      }
      const node = this.waypoints.get(curr);
      if (node) {
        for (const nb of node.neighbors) {
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push([...path, nb]);
          }
        }
      }
    }

    return playerPos;
  }

  public update(
    delta: number,
    _elapsedTime: number,
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    flashlightOn: boolean,
    pendantsCollected: number
  ): void {
    if (this.state === MonsterState.DORMANT) return;

    if (this.state === MonsterState.ATTACK) {
      this.attackTimer += delta;
      this.eyeLight.intensity = 1.8;
      if (this.mixer) {
        this.mixer.update(delta * 2.0);
      }
      return;
    }

    // 1. Check visibility & occlusion
    const visible = this.checkVisibility(camera, flashlightOn);
    this.isVisibleToPlayer = visible;

    const horizontalDist = Math.hypot(
      playerPos.x - this.position.x,
      playerPos.z - this.position.z
    );
    const verticalDiff = Math.abs(playerPos.y - this.position.y);

    // 2. Check capture distance
    if (horizontalDist <= this.captureDistance && verticalDiff < 1.2) {
      this.state = MonsterState.ATTACK;
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      this.group.rotation.y = Math.atan2(dx, dz);
      this.eyeLight.intensity = 1.8;
      this.onCatchPlayer();
      return;
    }

    // 3. Apply Core Rule: Freeze completely in place (including skeletal animation) when seen
    if (visible) {
      this.state = MonsterState.FROZEN;
      this.eyeLight.intensity = 0.55;
      return;
    }

    this.state = MonsterState.APPROACH;

    // Story mode pacing: gradual speed progression per pendant piece collected
    const speed = 1.35 + pendantsCollected * 0.24;

    // Advance the 3D GLTF skeletal animation while stalking unseen
    if (this.mixer) {
      this.mixer.update(delta * (0.9 + pendantsCollected * 0.14));
    }

    const navTarget = this.getNextNavigationTarget(playerPos);
    const dirX = navTarget.x - this.position.x;
    const dirZ = navTarget.z - this.position.z;
    const len = Math.hypot(dirX, dirZ);

    if (len > 0.05) {
      const nx = dirX / len;
      const nz = dirZ / len;

      const desiredX = this.position.x + nx * speed * delta;
      const desiredZ = this.position.z + nz * speed * delta;

      const resolved = this.collision.resolveMovement(
        this.position,
        desiredX,
        desiredZ,
        this.monsterRadius,
        2.35
      );

      this.position.set(resolved.x, resolved.y, resolved.z);
      this.group.position.copy(this.position);

      // Face toward player
      const targetYaw = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
      this.group.rotation.y = targetYaw;

      this.stepTimer += delta * speed;
      if (this.stepTimer >= 1.55) {
        this.stepTimer = 0;
        this.audio.playMonsterStep(this.distanceToPlayer);
      }
    }
  }
}
