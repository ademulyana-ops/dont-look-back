import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioManager } from '../audio/AudioManager';
import { HorrorEffects } from '../effects/HorrorEffects';
import { ActiveNote, GameMode, GameStateManager, MonsterState } from './GameState';
import { PendantManager } from '../items/PendantManager';
import { WatcherAI } from '../monster/WatcherAI';
import { Flashlight } from '../player/Flashlight';
import { PlayerController } from '../player/PlayerController';
import { CollisionSystem } from '../world/CollisionSystem';
import { HorrorCritters } from '../world/HorrorCritters';
import { HouseBuilder, HouseLights } from '../world/HouseBuilder';
import { InteractableSystem } from '../world/Interactable';
import { TextureGenerator } from '../world/TextureGenerator';

export class Game {
  public stateManager: GameStateManager;
  public audio: AudioManager;

  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private isSoftwareGl = false;
  private frameId = 0;
  private isDisposed = false;

  private texGen!: TextureGenerator;
  private collision!: CollisionSystem;
  private interactables!: InteractableSystem;
  private houseBuilder!: HouseBuilder;
  private houseLights!: HouseLights;
  private player!: PlayerController;
  private flashlight!: Flashlight;
  private pendants!: PendantManager;
  private watcher!: WatcherAI;
  private horrorEffects!: HorrorEffects;
  private critters!: HorrorCritters;

  private elapsedTime = 0;
  private jumpscareTimer = 0;
  private victorySequenceTimer = 0;
  private powerRestored = false;
  private collectedNotes: Set<string> = new Set();
  private introCutsceneTimer = 0;
  private readonly introCutsceneDuration = 4.5;
  private introFlashlightClicked = false;
  private introStepPlayed = false;
  private cutsceneEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(container: HTMLElement, stateManager: GameStateManager) {
    this.container = container;
    this.stateManager = stateManager;
    this.audio = new AudioManager();

    this.initRendererAndScene();
    this.initWorldAndSystems();
    this.startLoop();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleGlobalKeyDown);
  }

  private initRendererAndScene(): void {
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060609);
    this.scene.fog = new THREE.FogExp2(0x060609, 0.085);

    // Procedural RoomEnvironment for realistic metallic/porcelain reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();
    this.scene.environmentIntensity = 0.14;

    // Subtle cool HemisphereLight fill paired with warm interior lights
    const hemiLight = new THREE.HemisphereLight(0x242c3d, 0x120f0c, 0.28);
    hemiLight.position.set(0, 10, 0);
    this.scene.add(hemiLight);

    this.camera = new THREE.PerspectiveCamera(
      72,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      45
    );
  }

  private initWorldAndSystems(): void {
    this.texGen = new TextureGenerator(this.renderer);
    this.collision = new CollisionSystem();
    this.interactables = new InteractableSystem();

    this.houseBuilder = new HouseBuilder(this.scene, this.collision, this.texGen);
    this.houseLights = this.houseBuilder.build();

    this.flashlight = new Flashlight(this.scene, this.isSoftwareGl);

    this.player = new PlayerController(
      this.camera,
      this.renderer.domElement,
      this.collision,
      this.audio,
      {
        onToggleFlashlight: () => this.handleToggleFlashlight(),
        onInteract: () => this.handleInteract(),
        onPauseRequest: () => this.pauseGame(),
        onPointerLockChange: (locked) => {
          this.stateManager.update({ pointerLocked: locked });
        },
      }
    );

    this.pendants = new PendantManager(
      this.scene,
      this.interactables,
      this.houseBuilder.pendantPickupShardTextures,
      (count, roomName) => this.handlePendantCollected(count, roomName)
    );
    this.pendants.init();

    this.registerFrontDoorInteraction();
    this.registerBasementBreakerInteraction();
    this.registerNoteInteractions();

    this.watcher = new WatcherAI(
      this.scene,
      this.collision,
      this.texGen,
      this.audio,
      () => this.handlePlayerCaught()
    );

    this.horrorEffects = new HorrorEffects(
      this.houseLights,
      this.houseBuilder.mirrorSilhouetteMesh,
      this.flashlight,
      this.audio
    );

    this.critters = new HorrorCritters(this.scene, this.audio);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private registerFrontDoorInteraction(): void {
    const doorPos = new THREE.Vector3(0, 1.2, 7.6);
    this.interactables.register({
      id: 'front_door_escape',
      position: doorPos,
      interactionRadius: 2.5,
      isEnabled: () => true,
      getPrompt: () => {
        const inserted = this.pendants.getInsertedCount();
        if (this.pendants.isCarryingPiece()) {
          return `PRESS E TO INSERT PENDANT PIECE #${inserted + 1}/5 INTO DOOR SEAL`;
        }
        if (inserted >= 5) {
          return this.powerRestored
            ? 'FRONT DOOR OPEN — STEP OUT INTO THE RAINY FRONT YARD [E]'
            : 'DOOR SEAL COMPLETE (5/5) — NO POWER! ACTIVATE BREAKER SWITCH IN BASEMENT';
        }
        const nextLoc = this.pendants.getCurrentTargetLocation();
        const nextRoom = nextLoc ? nextLoc.roomName.toUpperCase() : 'HOUSE';
        return `FRONT DOOR SEALED (${inserted}/5 INSERTED) — SEARCH ${nextRoom} FOR PIECE #${inserted + 1}`;
      },
      onInteract: () => {
        if (this.pendants.isCarryingPiece()) {
          const { insertedCount, nextLocation } = this.pendants.insertCarriedPieceAtDoor();
          this.houseBuilder.updateFrontDoorSockets(insertedCount);

          if (insertedCount < 5 && nextLocation) {
            this.audio.playPendantPickup(insertedCount + 1);
            this.stateManager.update({
              pendantsCollected: insertedCount,
              carryingPendant: false,
              objectiveText: `Piece ${insertedCount}/5 inserted! Search the ${nextLocation.roomName} for Pendant Piece #${insertedCount + 1}`,
            });
            this.stateManager.showTemporaryMessage(
              `PENDANT PIECE ${insertedCount}/5 LOCKED IN DOOR! NEXT PIECE SPAWNED IN ${nextLocation.roomName.toUpperCase()}.`,
              3800
            );
          } else {
            // 5th and final piece inserted into the door -> Trigger power failure twist scene!
            this.audio.playDoorLocked();
            this.player.addCameraShake(0.65);
            this.houseBuilder.setFrontDoorSealCompleteNoPowerVisual();
            this.stateManager.update({
              pendantsCollected: 5,
              carryingPendant: false,
              objectiveText:
                'THE DOOR STILL WILL NOT OPEN (NO POWER)! Go to the Basement and flip the Main Power Switch [E]!',
            });
            this.stateManager.showTemporaryMessage(
              'ALL 5 PENDANTS UNITED — BUT THE DOOR LOCK HAS NO ELECTRICITY! TURN ON THE POWER BREAKER IN THE BASEMENT!',
              5200
            );
          }
          return;
        }

        const inserted = this.pendants.getInsertedCount();
        if (inserted < 5) {
          this.audio.playDoorLocked();
          const nextLoc = this.pendants.getCurrentTargetLocation();
          const roomHint = nextLoc ? nextLoc.roomName.toUpperCase() : 'THE HOUSE';
          this.stateManager.showTemporaryMessage(
            `DOOR SEALED (${inserted}/5). FIND PENDANT PIECE #${inserted + 1} IN ${roomHint} FIRST!`,
            3000
          );
        } else if (!this.powerRestored) {
          this.audio.playDoorLocked();
          this.player.addCameraShake(0.35);
          this.stateManager.showTemporaryMessage(
            'THE MAGNETIC LOCK HAS NO POWER! GO DOWN TO THE BASEMENT AND FLIP THE ELECTRICAL BREAKER SWITCH!',
            3600
          );
        } else {
          this.triggerEscapeVictory();
        }
      },
    });
  }

  private registerBasementBreakerInteraction(): void {
    const breakerPos = new THREE.Vector3(-2.5, -1.65, -25.1);
    this.interactables.register({
      id: 'basement_power_breaker',
      position: breakerPos,
      interactionRadius: 2.5,
      isEnabled: () => !this.powerRestored,
      getPrompt: () => {
        const inserted = this.pendants.getInsertedCount();
        if (inserted < 5) {
          return `BASEMENT POWER SWITCH — LOCKED (INSERT ALL 5 PENDANTS IN FRONT DOOR FIRST: ${inserted}/5)`;
        }
        return 'PRESS E TO FLIP MAIN ELECTRICAL POWER SWITCH (UNLOCK FRONT DOOR)';
      },
      onInteract: () => {
        const inserted = this.pendants.getInsertedCount();
        if (inserted < 5) {
          this.audio.playDoorLocked();
          this.stateManager.showTemporaryMessage(
            `CANNOT ACTIVATE POWER YET! INSERT ALL 5 PENDANTS INTO THE FRONT DOOR FIRST (${inserted}/5).`,
            3400
          );
          return;
        }

        // All 5 pendants are in the front door! Flip the basement power breaker ON!
        this.powerRestored = true;
        this.audio.playDoorUnlockedCue();
        this.player.addCameraShake(0.5);
        this.houseBuilder.activateBasementPowerAndOpenFrontDoor();

        this.stateManager.update({
          powerRestored: true,
          objectiveText:
            'MAIN POWER ON! The Front Door is wide open — run upstairs to the rainy Front Yard to escape!',
        });
        this.stateManager.showTemporaryMessage(
          'POWER RESTORED! THE FRONT DOOR HAS OPENED TO THE RAINY FRONT YARD — RUN UPSTAIRS AND ESCAPE!',
          5200
        );
      },
    });
  }

  private registerNoteInteractions(): void {
    // Note #1: On the pile of human bones in Bedroom 1
    this.interactables.register({
      id: 'note_bedroom_bones',
      position: new THREE.Vector3(-7.05, 0.25, 1.25),
      interactionRadius: 2.45,
      isEnabled: () => !this.collectedNotes.has('note_bedroom_bones'),
      getPrompt: () => 'PRESS E TO INSPECT NOTE',
      onInteract: () => {
        this.inspectAndCollectNote({
          id: 'note_bedroom_bones',
          body: 'I’ve tried, but it didn’t work out. I’m too scared, so I’ll just stay here until the end.',
          signature: '#RICK',
        });
      },
    });

    // Note #2: On the Sofa in the Living Room
    this.interactables.register({
      id: 'note_living_sofa',
      position: new THREE.Vector3(6.65, 0.52, 6.38),
      interactionRadius: 2.45,
      isEnabled: () => !this.collectedNotes.has('note_living_sofa'),
      getPrompt: () => 'PRESS E TO INSPECT NOTE',
      onInteract: () => {
        this.inspectAndCollectNote({
          id: 'note_living_sofa',
          body: 'I have to collect 5 pieces to open the main door',
          signature: '#RICK',
        });
      },
    });

    // Note #3: On the crate in the Basement
    this.interactables.register({
      id: 'note_basement',
      position: new THREE.Vector3(-1.6, -2.28, -18.2),
      interactionRadius: 2.45,
      isEnabled: () => !this.collectedNotes.has('note_basement'),
      getPrompt: () => 'PRESS E TO INSPECT NOTE',
      onInteract: () => {
        this.inspectAndCollectNote({
          id: 'note_basement',
          body: "I'm not alone here, something is following me.",
          signature: '#RICK',
        });
      },
    });
  }

  private inspectAndCollectNote(note: ActiveNote): void {
    this.collectedNotes.add(note.id);
    this.houseBuilder.setNoteCollected(note.id, true);
    this.audio.playNoteInspect();
    this.player.setPlaying(false);
    this.stateManager.update({
      activeNote: note,
      interactionPrompt: null,
    });
  }

  public closeActiveNote(): void {
    const snap = this.stateManager.getSnapshot();
    if (!snap.activeNote) return;

    this.audio.playNoteInspect();
    this.stateManager.update({ activeNote: null });

    if (this.stateManager.getSnapshot().mode === GameMode.PLAYING) {
      this.player.setPlaying(true);
      this.player.focusAndLock();
    }
  }

  private handleGlobalKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      const snap = this.stateManager.getSnapshot();
      if (snap.activeNote !== null) {
        e.preventDefault();
        this.closeActiveNote();
      } else if (snap.introCutsceneActive) {
        e.preventDefault();
        this.finishIntroCutscene();
      }
    }
  };

  public startNewGame(): void {
    this.audio.resume();
    this.audio.setPaused(false);

    this.elapsedTime = 0;
    this.jumpscareTimer = 0;
    this.victorySequenceTimer = 0;
    this.powerRestored = false;
    this.collectedNotes.clear();
    this.houseBuilder.resetNotes();

    this.interactables.clear();
    this.pendants.init();
    this.registerFrontDoorInteraction();
    this.registerBasementBreakerInteraction();
    this.registerNoteInteractions();

    // Reset front door boards, 5 sockets, and basement breaker visual
    this.houseBuilder.updateFrontDoorSockets(0);

    this.player.reset();
    this.flashlight.setOn(false);
    this.watcher.reset();
    this.horrorEffects.reset();

    this.stateManager.resetForNewGame();
    const firstLoc = this.pendants.getCurrentTargetLocation();
    if (firstLoc) {
      this.stateManager.update({
        objectiveText: `Find Pendant Piece #1 in the ${firstLoc.roomName} and insert it into the Front Door`,
      });
    }

    // Start the opening wake-up cutscene on the Bedroom 1 bed
    this.introCutsceneTimer = 0;
    this.introFlashlightClicked = false;
    this.introStepPlayed = false;
    this.player.setPlaying(false);
    this.player.focusCanvas();
    this.audio.playWakeUpGasp();

    // Initial lying-on-pillow camera pose on the bed (-8.4, 0, 5.8)
    this.camera.position.set(-9.05, 0.96, 5.8);
    this.cutsceneEuler.set(0.88, -1.48, -0.32, 'YXZ');
    this.camera.quaternion.setFromEuler(this.cutsceneEuler);
  }

  private updateIntroCutscene(delta: number): void {
    this.introCutsceneTimer += delta;
    const t = this.introCutsceneTimer;

    // 1. Eyelid blink curve: wake up suddenly -> groggy double-blink -> eyes wide open
    let blink = 0;
    if (t < 0.35) {
      blink = 1.0 - (t / 0.35) * 0.82; // 1.0 -> 0.18
    } else if (t < 0.62) {
      const p = (t - 0.35) / 0.27;
      blink = 0.18 + Math.sin(p * Math.PI) * 0.58; // groggy blink up to 0.76
    } else if (t < 1.05) {
      const p = (t - 0.62) / 0.43;
      blink = 0.18 * (1 - p); // open fully to 0
    } else {
      blink = 0;
    }

    // 2. Spoken monologue subtitle
    let subtitle: string | null = null;
    if (t >= 0.95 && t < 4.25) {
      subtitle = '"Where... where is this place?"';
    }

    // 3. Camera choreography: Lying on bed pillow -> Jolting upright -> Looking left & right -> Standing up off bed
    const smoothstep = (edge0: number, edge1: number, x: number): number => {
      const u = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
      return u * u * (3 - 2 * u);
    };

    if (t < 1.35) {
      // Phase 1: Jolt awake from pillow (-9.05, 0.96, 5.8) to sitting upright on bed (-8.25, 1.34, 5.72)
      const p = smoothstep(0, 1.35, t);
      this.camera.position.set(
        THREE.MathUtils.lerp(-9.05, -8.25, p),
        THREE.MathUtils.lerp(0.96, 1.34, p) + Math.sin(p * Math.PI) * 0.04,
        THREE.MathUtils.lerp(5.8, 5.72, p)
      );
      const pitch = THREE.MathUtils.lerp(0.88, -0.04, p);
      const yaw = THREE.MathUtils.lerp(-1.48, -0.85, p);
      const roll = THREE.MathUtils.lerp(-0.32, 0.05, p);
      this.cutsceneEuler.set(pitch, yaw, roll, 'YXZ');
      this.camera.quaternion.setFromEuler(this.cutsceneEuler);
    } else if (t < 3.15) {
      // Phase 2: Sitting on edge of bed, looking left and right in confusion while saying "Where... where is this place?"
      const p = (t - 1.35) / 1.8;
      const slideEdge = smoothstep(1.35, 2.8, t);
      this.camera.position.set(
        THREE.MathUtils.lerp(-8.25, -7.55, slideEdge),
        THREE.MathUtils.lerp(1.34, 1.36, slideEdge) + Math.sin(t * 4.5) * 0.012,
        THREE.MathUtils.lerp(5.72, 5.05, slideEdge)
      );

      let yaw = -0.85;
      let pitch = -0.04;
      let roll = 0;
      if (p < 0.48) {
        const subP = smoothstep(0, 0.48, p);
        yaw = THREE.MathUtils.lerp(-0.85, -0.15, subP); // Glance left toward window & bone pile
        pitch = THREE.MathUtils.lerp(-0.04, 0.05, subP);
        roll = THREE.MathUtils.lerp(0.05, -0.04, subP);
      } else {
        const subP = smoothstep(0.48, 1.0, p);
        yaw = THREE.MathUtils.lerp(-0.15, 0.72, subP); // Glance right toward bedroom door
        pitch = THREE.MathUtils.lerp(0.05, -0.08, subP);
        roll = THREE.MathUtils.lerp(-0.04, 0.02, subP);
      }

      this.cutsceneEuler.set(pitch, yaw, roll, 'YXZ');
      this.camera.quaternion.setFromEuler(this.cutsceneEuler);
    } else {
      // Phase 3: Stand up from the bed to (-5.6, 1.65, 3.8) and click flashlight ON
      if (!this.introStepPlayed) {
        this.introStepPlayed = true;
        this.audio.playFootstep('wood', false);
      }
      if (!this.introFlashlightClicked && t >= 3.45) {
        this.introFlashlightClicked = true;
        this.flashlight.setOn(true);
        this.audio.playFlashlightClick(true);
        this.stateManager.update({ flashlightOn: true });
      }

      const p = smoothstep(3.15, this.introCutsceneDuration, t);
      this.camera.position.set(
        THREE.MathUtils.lerp(-7.55, -5.6, p),
        THREE.MathUtils.lerp(1.36, 1.65, p) + Math.sin(p * Math.PI) * 0.05,
        THREE.MathUtils.lerp(5.05, 3.8, p)
      );
      const pitch = THREE.MathUtils.lerp(-0.08, -0.05, p);
      const yaw = THREE.MathUtils.lerp(0.72, 0.55, p);
      const roll = THREE.MathUtils.lerp(0.02, 0, p);
      this.cutsceneEuler.set(pitch, yaw, roll, 'YXZ');
      this.camera.quaternion.setFromEuler(this.cutsceneEuler);
    }

    this.flashlight.update(this.camera, delta);

    this.stateManager.update({
      introBlinkAmount: Math.round(blink * 100) / 100,
      introSubtitle: subtitle,
    });

    if (t >= this.introCutsceneDuration) {
      this.finishIntroCutscene();
    }
  }

  private finishIntroCutscene(): void {
    if (!this.stateManager.getSnapshot().introCutsceneActive) return;

    this.player.reset();
    if (!this.flashlight.isOn) {
      this.flashlight.setOn(true);
      this.audio.playFlashlightClick(true);
    }
    this.flashlight.update(this.camera, 0.016);

    this.stateManager.update({
      introCutsceneActive: false,
      introSubtitle: null,
      introBlinkAmount: 0,
      flashlightOn: true,
    });
    this.stateManager.showTemporaryMessage(
      'Find each pendant piece one by one and insert it into the Front Door seal.',
      4000
    );

    this.player.setPlaying(true);
    this.player.focusAndLock();
  }

  public resumeGame(): void {
    if (this.stateManager.getSnapshot().mode !== GameMode.PAUSED) return;
    this.audio.resume();
    this.audio.setPaused(false);
    this.stateManager.update({ mode: GameMode.PLAYING });
    this.player.setPlaying(true);
    this.player.focusAndLock();
  }

  public pauseGame(): void {
    if (this.stateManager.getSnapshot().mode !== GameMode.PLAYING) return;
    if (this.stateManager.getSnapshot().activeNote !== null) {
      this.closeActiveNote();
      return;
    }
    this.audio.setPaused(true);
    this.player.setPlaying(false);
    this.player.releasePointerLock();
    this.stateManager.update({ mode: GameMode.PAUSED, pointerLocked: false });
  }

  public returnToMainMenu(): void {
    this.audio.setPaused(true);
    this.player.setPlaying(false);
    this.player.releasePointerLock();
    this.watcher.reset();
    this.stateManager.update({
      mode: GameMode.MAIN_MENU,
      pointerLocked: false,
      interactionPrompt: null,
      statusMessage: null,
    });
  }

  public lockPointer(): void {
    if (this.stateManager.getSnapshot().mode === GameMode.PLAYING) {
      this.player.focusAndLock();
    }
  }

  public toggleHudCollapsed(): void {
    const current = this.stateManager.getSnapshot().hudCollapsed;
    this.stateManager.update({ hudCollapsed: !current });
    this.lockPointer();
  }

  public triggerFlashlightToggle(): void {
    this.handleToggleFlashlight();
    this.lockPointer();
  }

  public triggerInteract(): void {
    this.handleInteract();
    this.lockPointer();
  }

  private handleToggleFlashlight(): void {
    if (this.stateManager.getSnapshot().mode !== GameMode.PLAYING) return;
    const isOn = this.flashlight.toggle();
    this.audio.playFlashlightClick(isOn);
    this.stateManager.update({ flashlightOn: isOn });
  }

  private handleInteract(): void {
    const snap = this.stateManager.getSnapshot();
    if (snap.mode !== GameMode.PLAYING || snap.activeNote !== null) return;
    this.interactables.triggerActiveInteraction();
  }

  private handlePendantCollected(pieceNumber: number, roomName: string): void {
    this.audio.playPendantPickup(pieceNumber);

    if (pieceNumber === 1) {
      this.watcher.activate(this.player.position, this.camera);
      this.stateManager.update({
        carryingPendant: true,
        monsterState: this.watcher.state,
        objectiveText: `Bring Pendant Piece #1/5 to the Front Entrance Door and insert it [E]`,
      });
      this.stateManager.showTemporaryMessage(
        `PIECE #1/5 (${roomName.toUpperCase()}) TAKEN! SOMETHING HAS AWAKENED — BRING IT TO THE FRONT DOOR!`,
        4200
      );
    } else {
      this.stateManager.update({
        carryingPendant: true,
        objectiveText: `Bring Pendant Piece #${pieceNumber}/5 to the Front Entrance Door and insert it [E]`,
      });
      this.stateManager.showTemporaryMessage(
        `PENDANT PIECE #${pieceNumber}/5 TAKEN! RETURN TO THE FRONT DOOR TO INSERT IT.`,
        3600
      );
    }
  }

  private handlePlayerCaught(): void {
    this.audio.playJumpscare();
    this.player.setPlaying(false);
    this.player.releasePointerLock();
    this.player.addCameraShake(1.8);
    this.flashlight.setOn(true);

    // Force camera to look directly at The Watcher's faceless head & glowing red eyes
    const faceTarget = new THREE.Vector3(
      this.watcher.position.x,
      this.watcher.position.y + 2.16,
      this.watcher.position.z
    );
    this.player.lookAtWorldTarget(faceTarget);
    this.jumpscareTimer = 0.95;
  }

  private triggerEscapeVictory(): void {
    this.audio.playDoorUnlockedCue();
    this.audio.playVictoryChord();
    this.player.setPlaying(false);
    this.player.releasePointerLock();
    this.watcher.reset();
    this.victorySequenceTimer = 0.01;
    this.stateManager.update({
      mode: GameMode.VICTORY,
      pointerLocked: false,
      interactionPrompt: null,
    });
  }

  private handleResize = (): void => {
    if (!this.container || !this.renderer || !this.camera) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.isDisposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    this.clock.start();
    const tick = () => {
      if (this.isDisposed) return;
      const rawDelta = this.clock.getDelta();
      const delta = Math.min(rawDelta, 0.1);
      this.update(delta);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };
    tick();
  }

  private update(delta: number): void {
    const snap = this.stateManager.getSnapshot();

    if (snap.mode === GameMode.MAIN_MENU) {
      // Atmospheric slow camera pan in the hallway/living room while on Main Menu
      this.elapsedTime += delta;
      this.camera.position.set(
        Math.sin(this.elapsedTime * 0.25) * 0.6,
        1.65 + Math.cos(this.elapsedTime * 0.4) * 0.05,
        4.5 + Math.cos(this.elapsedTime * 0.2) * 1.2
      );
      this.camera.lookAt(0, 1.45, -3.0);
      this.flashlight.update(this.camera, delta);
      this.critters.update(delta, this.elapsedTime, this.camera.position);
      return;
    }

    if (snap.mode === GameMode.PAUSED || snap.mode === GameMode.GAME_OVER) {
      return;
    }

    if (snap.mode === GameMode.VICTORY) {
      this.victorySequenceTimer += delta;
      this.houseBuilder.updateRain(delta);
      this.critters.update(delta, this.elapsedTime, this.camera.position);
      this.camera.position.lerp(new THREE.Vector3(0, 1.7, 12.2), delta * 1.6);
      this.camera.lookAt(0, 1.65, 18.0);
      return;
    }

    // PLAYING Mode
    this.elapsedTime += delta;
    this.houseBuilder.updateRain(delta);
    this.critters.update(delta, this.elapsedTime, this.player.position);

    // Opening wake-up cutscene on the Bedroom 1 bed
    if (snap.introCutsceneActive) {
      this.pendants.update(this.elapsedTime);
      this.updateIntroCutscene(delta);
      return;
    }

    // Handle active jumpscare sequence before transitioning to GAME_OVER
    if (this.jumpscareTimer > 0) {
      this.jumpscareTimer -= delta;
      const faceTarget = new THREE.Vector3(
        this.watcher.position.x,
        this.watcher.position.y + 1.98,
        this.watcher.position.z
      );
      this.player.lookAtWorldTarget(faceTarget);
      this.camera.position.x += (Math.random() - 0.5) * 0.08;
      this.camera.position.y += (Math.random() - 0.5) * 0.08;
      this.flashlight.update(this.camera, delta);

      if (this.jumpscareTimer <= 0) {
        this.stateManager.update({
          mode: GameMode.GAME_OVER,
          pointerLocked: false,
          interactionPrompt: null,
        });
      }
      return;
    }

    // If the player is currently reading a collected note, pause movement & monster stalking until Enter is pressed
    if (snap.activeNote !== null) {
      this.flashlight.update(this.camera, delta);
      return;
    }

    // 1. Update player movement & camera
    this.player.update(delta);
    this.flashlight.update(this.camera, delta);

    // Check if the player has stepped out through the open Front Door into the rainy Front Yard!
    if (this.powerRestored && this.player.position.z > 8.15) {
      this.triggerEscapeVictory();
      return;
    }

    // 2. Update rotating pendant collectibles
    this.pendants.update(this.elapsedTime);

    // 3. Check interactables in view
    const prompt = this.interactables.update(this.camera);

    // 4. Update The Watcher AI
    this.watcher.update(
      delta,
      this.elapsedTime,
      this.player.position,
      this.camera,
      this.flashlight.isOn,
      this.pendants.getCollectedCount()
    );

    // 5. Update environmental horror effects & audio ambience
    const currentRoom = this.collision.getRoomName(
      this.player.position.x,
      this.player.position.z
    );
    this.horrorEffects.update(
      delta,
      this.elapsedTime,
      currentRoom,
      this.pendants.getCollectedCount(),
      this.watcher.distanceToPlayer
    );

    this.audio.updateAmbience(
      this.elapsedTime,
      currentRoom === 'Basement' || currentRoom === 'Basement Stairs',
      currentRoom === 'Bathroom',
      this.watcher.distanceToPlayer,
      this.watcher.state !== MonsterState.DORMANT
    );

    // 6. Push state snapshot to UI
    this.stateManager.update({
      stamina: Math.round(this.player.stamina),
      isSprinting: this.player.isSprinting,
      monsterState: this.watcher.state,
      monsterDistance: Math.round(this.watcher.distanceToPlayer * 10) / 10,
      monsterVisible: this.watcher.isVisibleToPlayer,
      currentRoom,
      interactionPrompt: prompt,
      timeSurvived: Math.floor(this.elapsedTime),
      pointerLocked: this.player.isPointerLocked,
    });
  }

  public dispose(): void {
    this.isDisposed = true;
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleGlobalKeyDown);
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.player.dispose();
    this.texGen.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }
}
