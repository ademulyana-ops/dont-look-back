import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';

interface BatInstance {
  group: THREE.Group;
  leftWing: THREE.Object3D;
  rightWing: THREE.Object3D;
  homePos: THREE.Vector3;
  flyRadiusX: number;
  flyRadiusZ: number;
  flySpeed: number;
  phase: number;
  isFlying: boolean;
  startleCooldown: number;
}

interface RatInstance {
  group: THREE.Group;
  tail: THREE.Object3D;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  progress: number;
  direction: 1 | -1;
  baseSpeed: number;
  squeakCooldown: number;
}

interface RoachInstance {
  group: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  angle: number;
  speed: number;
  surfaceNormalY: boolean;
}

interface SpiderInstance {
  group: THREE.Group;
  legs: THREE.Object3D[];
  silkLine: THREE.Line;
  anchorPos: THREE.Vector3;
  minDrop: number;
  maxDrop: number;
  currentDrop: number;
  dropTarget: number;
  phase: number;
}

export class HorrorCritters {
  private scene: THREE.Scene;
  private audio: AudioManager;
  private rootGroup = new THREE.Group();

  private bats: BatInstance[] = [];
  private rats: RatInstance[] = [];
  private roaches: RoachInstance[] = [];
  private spiders: SpiderInstance[] = [];

  // Black Cat (Kucing Hitam) state
  private catGroup!: THREE.Group;
  private catHead!: THREE.Group;
  private catTail!: THREE.Group;
  private catLegs: THREE.Object3D[] = [];
  private catPerches: THREE.Vector3[] = [
    new THREE.Vector3(5.6, 0.0, 5.8), // Living room near sofa
    new THREE.Vector3(-1.4, 0.0, 2.2), // Central hallway outside bedroom
    new THREE.Vector3(5.2, 0.0, -5.6), // Kitchen near table
    new THREE.Vector3(-0.8, 0.0, -8.2), // North hallway near basement stairs
    new THREE.Vector3(-5.8, 0.0, 4.2), // Bedroom floor near bed
  ];
  private catCurrentPerchIdx = 0;
  private catTargetPos = new THREE.Vector3();
  private catIsRunning = false;
  private catMeowCooldown = 0;

  constructor(scene: THREE.Scene, audio: AudioManager) {
    this.scene = scene;
    this.audio = audio;
    this.scene.add(this.rootGroup);

    this.buildBats();
    this.buildBlackCat();
    this.buildRats();
    this.buildCockroaches();
    this.buildSpiders();
  }

  // ==================== 1. KELELAWAR (BATS) ====================
  private buildBats(): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x161418,
      roughness: 0.75,
      metalness: 0.1,
    });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x0f0d12,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b });

    const batConfigs = [
      // Basement bats (flying & hanging under beams)
      { pos: new THREE.Vector3(0.0, -0.45, -19.5), rx: 3.2, rz: 2.2, speed: 2.1, flying: true },
      { pos: new THREE.Vector3(-2.8, -0.35, -21.5), rx: 2.5, rz: 2.0, speed: 2.4, flying: false },
      { pos: new THREE.Vector3(2.6, -0.4, -22.8), rx: 2.6, rz: 1.8, speed: 2.2, flying: true },
      // Stairwell & North Hallway bats
      { pos: new THREE.Vector3(0.0, 2.85, -11.5), rx: 0.9, rz: 2.4, speed: 2.5, flying: false },
      { pos: new THREE.Vector3(0.0, 2.95, -2.5), rx: 1.4, rz: 3.5, speed: 2.0, flying: true },
      // Front Yard night bats
      { pos: new THREE.Vector3(0.0, 3.2, 12.5), rx: 4.5, rz: 3.0, speed: 2.3, flying: true },
      { pos: new THREE.Vector3(-2.5, 3.5, 14.8), rx: 4.0, rz: 2.8, speed: 2.1, flying: true },
    ];

    batConfigs.forEach((cfg, idx) => {
      const group = new THREE.Group();
      group.position.copy(cfg.pos);

      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.09, 6, 8), bodyMat);
      torso.rotation.x = Math.PI / 2;

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), bodyMat);
      head.position.set(0, 0.02, 0.075);

      // Pointed bat ears
      const earGeo = new THREE.ConeGeometry(0.018, 0.055, 5);
      const earL = new THREE.Mesh(earGeo, bodyMat);
      earL.position.set(-0.024, 0.06, 0.075);
      const earR = new THREE.Mesh(earGeo, bodyMat);
      earR.position.set(0.024, 0.06, 0.075);

      // Tiny glowing red eyes
      const eyeGeo = new THREE.SphereGeometry(0.007, 6, 6);
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-0.016, 0.026, 0.11);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(0.016, 0.026, 0.11);

      // Articulated bat wings
      const buildWing = (side: -1 | 1): THREE.Group => {
        const wingPivot = new THREE.Group();
        wingPivot.position.set(side * 0.035, 0.01, 0.01);

        const membrane = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.006, 0.14), wingMat);
        membrane.position.set(side * 0.13, 0, -0.01);
        membrane.rotation.y = side * -0.18;

        const wingTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), wingMat);
        wingTip.rotation.z = side * -Math.PI / 2;
        wingTip.position.set(side * 0.28, 0, -0.02);

        wingPivot.add(membrane, wingTip);
        return wingPivot;
      };

      const leftWing = buildWing(-1);
      const rightWing = buildWing(1);

      group.add(torso, head, earL, earR, eyeL, eyeR, leftWing, rightWing);
      this.rootGroup.add(group);

      this.bats.push({
        group,
        leftWing,
        rightWing,
        homePos: cfg.pos.clone(),
        flyRadiusX: cfg.rx,
        flyRadiusZ: cfg.rz,
        flySpeed: cfg.speed,
        phase: idx * 1.7,
        isFlying: cfg.flying,
        startleCooldown: 0,
      });
    });
  }

  // ==================== 2. KUCING HITAM (BLACK CAT) ====================
  private buildBlackCat(): void {
    const furMat = new THREE.MeshStandardMaterial({
      color: 0x09090c,
      roughness: 0.65,
      metalness: 0.12,
    });
    const catEyeMat = new THREE.MeshBasicMaterial({
      color: 0xbef264, // eerie glowing yellow-green cat eyes
    });

    this.catGroup = new THREE.Group();
    this.catGroup.position.copy(this.catPerches[0]);
    this.catTargetPos.copy(this.catPerches[0]);

    // Sleek arched cat body
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 8, 12), furMat);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.24, 0);

    // Cat Head Group (rotates to stare at the player)
    this.catHead = new THREE.Group();
    this.catHead.position.set(0, 0.34, 0.22);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 12), furMat);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.08, 8), furMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.015, 0.09);

    // Pointed cat ears
    const earGeo = new THREE.ConeGeometry(0.036, 0.085, 6);
    const earL = new THREE.Mesh(earGeo, furMat);
    earL.position.set(-0.055, 0.09, 0.01);
    earL.rotation.z = 0.22;
    const earR = new THREE.Mesh(earGeo, furMat);
    earR.position.set(0.055, 0.09, 0.01);
    earR.rotation.z = -0.22;

    // Glowing yellow-green eyes
    const eyeGeo = new THREE.SphereGeometry(0.016, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, catEyeMat);
    eyeL.position.set(-0.038, 0.018, 0.082);
    const eyeR = new THREE.Mesh(eyeGeo, catEyeMat);
    eyeR.position.set(0.038, 0.018, 0.082);

    // Subtle eye reflection point light
    const eyeGlow = new THREE.PointLight(0xa3e635, 0.28, 1.4, 2);
    eyeGlow.position.set(0, 0.02, 0.14);

    this.catHead.add(skull, snout, earL, earR, eyeL, eyeR, eyeGlow);

    // 4 Cat Legs
    const legGeo = new THREE.CylinderGeometry(0.026, 0.02, 0.24, 8);
    const legOffsets = [
      [-0.06, 0.12, 0.14],
      [0.06, 0.12, 0.14],
      [-0.06, 0.12, -0.14],
      [0.06, 0.12, -0.14],
    ];
    legOffsets.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, furMat);
      leg.position.set(lx, ly, lz);
      this.catLegs.push(leg);
      this.catGroup.add(leg);
    });

    // Long curved swaying tail
    this.catTail = new THREE.Group();
    this.catTail.position.set(0, 0.26, -0.2);
    const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.36, 8), furMat);
    tailMesh.position.set(0, 0.14, -0.08);
    tailMesh.rotation.x = -0.55;
    this.catTail.add(tailMesh);

    this.catGroup.add(torso, this.catHead, this.catTail);
    this.rootGroup.add(this.catGroup);
  }

  // ==================== 3. TIKUS (RATS) ====================
  private buildRats(): void {
    const ratMat = new THREE.MeshStandardMaterial({
      color: 0x2b2623,
      roughness: 0.8,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x5c4440,
      roughness: 0.7,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

    const ratRoutes = [
      // Bedroom baseboard scurry
      { start: new THREE.Vector3(-9.8, 0.0, 1.2), end: new THREE.Vector3(-9.8, 0.0, 6.8), speed: 1.5 },
      // Central Hallway scurry
      { start: new THREE.Vector3(-2.1, 0.0, 5.5), end: new THREE.Vector3(-2.1, 0.0, -7.5), speed: 1.8 },
      { start: new THREE.Vector3(2.1, 0.0, -8.2), end: new THREE.Vector3(2.1, 0.0, 2.0), speed: 1.65 },
      // Living Room under sofa & rug
      { start: new THREE.Vector3(4.2, 0.0, 6.2), end: new THREE.Vector3(9.8, 0.0, 6.2), speed: 1.7 },
      // Kitchen floor near fridge & cabinets
      { start: new THREE.Vector3(3.5, 0.0, -7.8), end: new THREE.Vector3(9.4, 0.0, -7.8), speed: 1.9 },
      // Basement concrete floor rats
      { start: new THREE.Vector3(-6.2, -3.2, -17.5), end: new THREE.Vector3(5.8, -3.2, -23.8), speed: 1.75 },
      { start: new THREE.Vector3(5.5, -3.2, -17.8), end: new THREE.Vector3(-4.5, -3.2, -24.0), speed: 1.6 },
    ];

    ratRoutes.forEach((route, i) => {
      const group = new THREE.Group();
      group.position.copy(route.start);

      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.11, 6, 8), ratMat);
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.042;

      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.065, 8), ratMat);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, 0.042, 0.09);

      const earGeo = new THREE.SphereGeometry(0.015, 6, 6);
      const earL = new THREE.Mesh(earGeo, tailMat);
      earL.position.set(-0.022, 0.072, 0.055);
      const earR = new THREE.Mesh(earGeo, tailMat);
      earR.position.set(0.022, 0.072, 0.055);

      const eyeGeo = new THREE.SphereGeometry(0.005, 6, 6);
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-0.014, 0.052, 0.088);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(0.014, 0.052, 0.088);

      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, 0.16, 6), tailMat);
      tail.rotation.x = Math.PI / 2 - 0.15;
      tail.position.set(0, 0.025, -0.14);

      group.add(body, snout, earL, earR, eyeL, eyeR, tail);
      this.rootGroup.add(group);

      this.rats.push({
        group,
        tail,
        startPos: route.start,
        endPos: route.end,
        progress: (i * 0.23) % 1.0,
        direction: 1,
        baseSpeed: route.speed,
        squeakCooldown: 0,
      });
    });
  }

  // ==================== 4. KECOA (COCKROACHES) ====================
  private buildCockroaches(): void {
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x2b160a,
      roughness: 0.25, // shiny cockroach carapace
      metalness: 0.2,
    });
    const legMat = new THREE.MeshBasicMaterial({ color: 0x170b04 });

    const roachSpots = [
      // Kitchen counter & floor roaches
      { center: new THREE.Vector3(10.35, 0.96, -5.2), r: 0.32 },
      { center: new THREE.Vector3(10.35, 0.96, -6.4), r: 0.28 },
      { center: new THREE.Vector3(8.6, 0.01, -5.8), r: 0.65 },
      { center: new THREE.Vector3(6.6, 0.83, -4.8), r: 0.35 }, // dining table top
      // Bathroom tiles, sink & bathtub rim
      { center: new THREE.Vector3(-5.5, 0.02, -2.5), r: 0.7 },
      { center: new THREE.Vector3(-4.6, 0.02, -4.8), r: 0.65 },
      { center: new THREE.Vector3(-7.1, 0.76, -6.2), r: 0.25 },
      { center: new THREE.Vector3(-5.5, 0.93, -1.25), r: 0.18 },
      // Bedroom nightstand & floor
      { center: new THREE.Vector3(-9.55, 0.82, 2.5), r: 0.22 },
      { center: new THREE.Vector3(-7.2, 0.01, 3.5), r: 0.6 },
      // Hallway & Basement crates
      { center: new THREE.Vector3(0.5, 0.01, 1.5), r: 0.7 },
      { center: new THREE.Vector3(-0.6, 0.01, -6.0), r: 0.65 },
      { center: new THREE.Vector3(3.8, -2.3, -22.2), r: 0.3 },
      { center: new THREE.Vector3(-2.5, -3.19, -20.5), r: 0.85 },
    ];

    roachSpots.forEach((spot, idx) => {
      const group = new THREE.Group();
      group.position.copy(spot.center);

      const carapace = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), shellMat);
      carapace.scale.set(0.68, 0.32, 1.45);
      carapace.position.y = 0.008;

      // 6 tiny legs
      for (let l = -1; l <= 1; l++) {
        const legPair = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.003, 0.004), legMat);
        legPair.position.set(0, 0.005, l * 0.014);
        group.add(legPair);
      }

      // 2 long antennae
      const antGeo = new THREE.CylinderGeometry(0.001, 0.001, 0.045, 4);
      const antL = new THREE.Mesh(antGeo, legMat);
      antL.rotation.x = Math.PI / 2;
      antL.rotation.z = 0.35;
      antL.position.set(-0.008, 0.01, 0.042);
      const antR = new THREE.Mesh(antGeo, legMat);
      antR.rotation.x = Math.PI / 2;
      antR.rotation.z = -0.35;
      antR.position.set(0.008, 0.01, 0.042);

      group.add(carapace, antL, antR);
      this.rootGroup.add(group);

      this.roaches.push({
        group,
        center: spot.center,
        radius: spot.r,
        angle: idx * 1.3,
        speed: 3.2 + (idx % 4) * 0.65,
        surfaceNormalY: true,
      });
    });
  }

  // ==================== 5. LABA-LABA (SPIDERS & COBWEBS) ====================
  private buildSpiders(): void {
    const spiderMat = new THREE.MeshStandardMaterial({
      color: 0x0c0b0e,
      roughness: 0.55,
      metalness: 0.15,
    });
    const redMarkMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const silkMat = new THREE.LineBasicMaterial({
      color: 0xd4d4d8,
      transparent: true,
      opacity: 0.45,
    });

    const spiderAnchors = [
      // Bedroom corner & near wardrobe
      { anchor: new THREE.Vector3(-5.2, 3.4, 5.2), minDrop: 0.4, maxDrop: 1.75 },
      { anchor: new THREE.Vector3(-8.8, 3.4, 2.8), minDrop: 0.35, maxDrop: 1.55 },
      // Central Hallway ceiling spiders (drop down as player walks down the hall!)
      { anchor: new THREE.Vector3(-0.7, 3.4, 2.6), minDrop: 0.45, maxDrop: 1.7 },
      { anchor: new THREE.Vector3(0.65, 3.4, -3.5), minDrop: 0.4, maxDrop: 1.68 },
      // Bathroom corner above bathtub
      { anchor: new THREE.Vector3(-6.8, 3.4, -5.8), minDrop: 0.35, maxDrop: 1.6 },
      // Kitchen corner near cabinets
      { anchor: new THREE.Vector3(8.8, 3.4, -6.5), minDrop: 0.4, maxDrop: 1.65 },
      // Basement Stairwell ceiling
      { anchor: new THREE.Vector3(0.45, 2.8, -12.5), minDrop: 0.5, maxDrop: 2.1 },
      // Basement ceiling beams
      { anchor: new THREE.Vector3(-1.8, 0.15, -19.2), minDrop: 0.35, maxDrop: 1.55 },
      { anchor: new THREE.Vector3(2.2, 0.15, -21.5), minDrop: 0.35, maxDrop: 1.6 },
    ];

    spiderAnchors.forEach((cfg, idx) => {
      // Build a radial ceiling cobweb at the anchor
      this.buildCornerCobweb(cfg.anchor);

      const group = new THREE.Group();
      group.position.set(cfg.anchor.x, cfg.anchor.y - cfg.minDrop, cfg.anchor.z);

      // Abdomen & cephalothorax
      const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 10), spiderMat);
      abdomen.scale.set(0.95, 0.78, 1.25);
      abdomen.position.z = -0.035;

      // Red Black-Widow hourglass / dorsal mark
      const redMark = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), redMarkMat);
      redMark.position.set(0, 0.035, -0.035);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), spiderMat);
      head.position.z = 0.032;

      // Glowing red spider eyes
      const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), redMarkMat);
      eyeL.position.set(-0.012, 0.008, 0.06);
      const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), redMarkMat);
      eyeR.position.set(0.012, 0.008, 0.06);

      // 8 Jointed Spider Legs
      const legs: THREE.Object3D[] = [];
      for (let side = -1; side <= 1; side += 2) {
        for (let l = 0; l < 4; l++) {
          const legPivot = new THREE.Group();
          const zOff = (l - 1.5) * 0.022;
          legPivot.position.set(side * 0.025, 0, zOff);
          legPivot.rotation.y = side * (l - 1.5) * 0.28;

          const upperLeg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.004, 0.004, 0.075, 5),
            spiderMat
          );
          upperLeg.rotation.z = side * -1.05;
          upperLeg.position.set(side * 0.03, 0.018, 0);

          const lowerLeg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.003, 0.002, 0.085, 5),
            spiderMat
          );
          lowerLeg.rotation.z = side * -0.35;
          lowerLeg.position.set(side * 0.07, -0.015, 0);

          legPivot.add(upperLeg, lowerLeg);
          legs.push(legPivot);
          group.add(legPivot);
        }
      }

      group.add(abdomen, redMark, head, eyeL, eyeR);
      this.rootGroup.add(group);

      // Vertical silk thread connecting anchorPos to the spider
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        cfg.anchor.clone(),
        group.position.clone(),
      ]);
      const silkLine = new THREE.Line(lineGeo, silkMat);
      silkLine.frustumCulled = false;
      this.rootGroup.add(silkLine);

      this.spiders.push({
        group,
        legs,
        silkLine,
        anchorPos: cfg.anchor.clone(),
        minDrop: cfg.minDrop,
        maxDrop: cfg.maxDrop,
        currentDrop: cfg.minDrop,
        dropTarget: cfg.minDrop,
        phase: idx * 1.4,
      });
    });
  }

  private buildCornerCobweb(anchor: THREE.Vector3): void {
    const webMat = new THREE.LineBasicMaterial({
      color: 0xa1a1aa,
      transparent: true,
      opacity: 0.25,
    });
    const points: THREE.Vector3[] = [];
    const spokes = 8;
    const radius = 0.38;

    for (let s = 0; s < spokes; s++) {
      const a = (s / spokes) * Math.PI * 2;
      points.push(
        anchor.clone(),
        new THREE.Vector3(
          anchor.x + Math.cos(a) * radius,
          anchor.y - 0.02,
          anchor.z + Math.sin(a) * radius
        )
      );
    }
    for (let ring = 1; ring <= 3; ring++) {
      const rr = (ring / 3) * radius;
      for (let s = 0; s < spokes; s++) {
        const a1 = (s / spokes) * Math.PI * 2;
        const a2 = ((s + 1) / spokes) * Math.PI * 2;
        points.push(
          new THREE.Vector3(anchor.x + Math.cos(a1) * rr, anchor.y - 0.02, anchor.z + Math.sin(a1) * rr),
          new THREE.Vector3(anchor.x + Math.cos(a2) * rr, anchor.y - 0.02, anchor.z + Math.sin(a2) * rr)
        );
      }
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const web = new THREE.LineSegments(geo, webMat);
    this.rootGroup.add(web);
  }

  public update(delta: number, elapsedTime: number, playerPos: THREE.Vector3): void {
    // 1. Update Bats (Kelelawar)
    this.bats.forEach((bat) => {
      if (bat.startleCooldown > 0) bat.startleCooldown -= delta;

      const distToPlayer = bat.group.position.distanceTo(playerPos);
      if (!bat.isFlying && distToPlayer < 4.5 && bat.startleCooldown <= 0) {
        bat.isFlying = true;
        bat.startleCooldown = 8.0;
        this.audio.playBatFlutter();
      }

      if (bat.isFlying) {
        const t = elapsedTime * bat.flySpeed + bat.phase;
        const nx = bat.homePos.x + Math.sin(t) * bat.flyRadiusX;
        const nz = bat.homePos.z + Math.sin(t * 2) * (bat.flyRadiusZ * 0.55);
        const ny = bat.homePos.y + Math.cos(t * 3.2) * 0.18;

        const dx = nx - bat.group.position.x;
        const dz = nz - bat.group.position.z;
        if (Math.hypot(dx, dz) > 0.001) {
          bat.group.rotation.y = Math.atan2(dx, dz);
        }
        bat.group.position.set(nx, ny, nz);

        // Rapid bat wing flapping
        const flap = Math.sin(elapsedTime * 22.0 + bat.phase) * 0.75;
        bat.leftWing.rotation.z = flap;
        bat.rightWing.rotation.z = -flap;
      } else {
        // Hanging upside-down breathing / wing twitch
        const twitch = Math.sin(elapsedTime * 3.5 + bat.phase) * 0.12;
        bat.leftWing.rotation.z = 0.4 + twitch;
        bat.rightWing.rotation.z = -0.4 - twitch;
      }
    });

    // 2. Update Black Cat (Kucing Hitam)
    if (this.catMeowCooldown > 0) this.catMeowCooldown -= delta;
    this.catTail.rotation.z = Math.sin(elapsedTime * 3.2) * 0.35;

    const catDistToPlayer = this.catGroup.position.distanceTo(playerPos);
    if (!this.catIsRunning && catDistToPlayer < 3.4 && this.catMeowCooldown <= 0) {
      // Startle the black cat: hiss/meow and dart to a different room perch!
      this.audio.playCatMeow();
      this.catMeowCooldown = 6.0;
      this.catCurrentPerchIdx = (this.catCurrentPerchIdx + 1) % this.catPerches.length;
      this.catTargetPos.copy(this.catPerches[this.catCurrentPerchIdx]);
      this.catIsRunning = true;
    }

    if (this.catIsRunning) {
      const dx = this.catTargetPos.x - this.catGroup.position.x;
      const dz = this.catTargetPos.z - this.catGroup.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.15) {
        const speed = 4.2;
        this.catGroup.position.x += (dx / dist) * speed * delta;
        this.catGroup.position.z += (dz / dist) * speed * delta;
        this.catGroup.rotation.y = Math.atan2(dx, dz);
        this.catHead.rotation.y = 0;
        this.catLegs.forEach((leg, idx) => {
          leg.rotation.x = Math.sin(elapsedTime * 18 + idx * Math.PI * 0.5) * 0.55;
        });
      } else {
        this.catIsRunning = false;
        this.catLegs.forEach((leg) => {
          leg.rotation.x = 0;
        });
      }
    } else {
      // Stare eerily toward the player
      const toPlayerX = playerPos.x - this.catGroup.position.x;
      const toPlayerZ = playerPos.z - this.catGroup.position.z;
      this.catGroup.rotation.y = Math.atan2(toPlayerX, toPlayerZ);
    }

    // 3. Update Rats (Tikus)
    this.rats.forEach((rat) => {
      if (rat.squeakCooldown > 0) rat.squeakCooldown -= delta;

      const distToPlayer = rat.group.position.distanceTo(playerPos);
      let speedMult = 1.0;
      if (distToPlayer < 3.2) {
        speedMult = 2.6;
        if (rat.squeakCooldown <= 0) {
          rat.squeakCooldown = 5.5;
          this.audio.playRatSqueak();
        }
      }

      const routeLen = rat.startPos.distanceTo(rat.endPos);
      rat.progress += (rat.direction * (rat.baseSpeed * speedMult * delta)) / Math.max(1, routeLen);

      if (rat.progress >= 1.0) {
        rat.progress = 1.0;
        rat.direction = -1;
      } else if (rat.progress <= 0.0) {
        rat.progress = 0.0;
        rat.direction = 1;
      }

      rat.group.position.lerpVectors(rat.startPos, rat.endPos, rat.progress);
      rat.group.position.y += Math.abs(Math.sin(elapsedTime * 16.0)) * 0.012;

      const target = rat.direction === 1 ? rat.endPos : rat.startPos;
      rat.group.rotation.y = Math.atan2(
        target.x - rat.group.position.x,
        target.z - rat.group.position.z
      );
      rat.tail.rotation.y = Math.sin(elapsedTime * 14.0) * 0.25;
    });

    // 4. Update Cockroaches (Kecoa)
    this.roaches.forEach((roach, idx) => {
      roach.angle += roach.speed * delta;
      // Figure-8 erratic scuttle path
      const nx = roach.center.x + Math.cos(roach.angle) * roach.radius;
      const nz = roach.center.z + Math.sin(roach.angle * 2.0) * (roach.radius * 0.6);
      const dx = nx - roach.group.position.x;
      const dz = nz - roach.group.position.z;
      if (Math.hypot(dx, dz) > 0.0005) {
        roach.group.rotation.y = Math.atan2(dx, dz);
      }
      roach.group.position.set(nx, roach.center.y, nz);
      roach.group.rotation.z = Math.sin(elapsedTime * 24 + idx) * 0.08;
    });

    // 5. Update Spiders (Laba-Laba)
    this.spiders.forEach((spider) => {
      const horizDist = Math.hypot(
        playerPos.x - spider.anchorPos.x,
        playerPos.z - spider.anchorPos.z
      );

      // Drop down on silk thread when player walks near!
      if (horizDist < 3.6) {
        spider.dropTarget = spider.maxDrop;
      } else {
        spider.dropTarget =
          spider.minDrop + (Math.sin(elapsedTime * 0.9 + spider.phase) * 0.5 + 0.5) * 0.45;
      }

      spider.currentDrop += (spider.dropTarget - spider.currentDrop) * Math.min(1, delta * 3.5);
      spider.group.position.set(
        spider.anchorPos.x,
        spider.anchorPos.y - spider.currentDrop,
        spider.anchorPos.z
      );
      spider.group.rotation.y = elapsedTime * 0.8 + spider.phase;

      // Update silk thread line vertex
      const posAttr = spider.silkLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.setXYZ(1, spider.group.position.x, spider.group.position.y, spider.group.position.z);
      posAttr.needsUpdate = true;

      // Creepy leg crawling animation
      spider.legs.forEach((leg, lIdx) => {
        leg.rotation.z = Math.sin(elapsedTime * 10.0 + lIdx * 1.1) * 0.18;
      });
    });
  }
}
