import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { CollisionSystem } from '../world/CollisionSystem';

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveVec = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public position = new THREE.Vector3(-5.6, 0, 3.8);
  public velocity = new THREE.Vector3();
  public yaw = 0.55; // Looking toward the bedroom nightstand and doorway
  public pitch = -0.05;

  public stamina = 100;
  public isSprinting = false;
  public isPointerLocked = false;
  public isPlaying = false;

  private sprintRecoveryCooldown = 0;
  private bobTimer = 0;
  private stepAccumulator = 0;
  private cameraShakeAmount = 0;

  // Explicit WASD & movement state flags
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private sprintHeld = false;
  private turnLeft = false;
  private turnRight = false;

  private isDraggingLook = false;
  private isUnlockingProgrammatically = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  private readonly eyeHeight = 1.65;
  private readonly playerRadius = 0.34;
  private readonly walkSpeed = 3.5;
  private readonly sprintSpeed = 5.6;

  private domElement: HTMLElement;
  private collision: CollisionSystem;
  private audio: AudioManager;
  private onToggleFlashlight: () => void;
  private onInteract: () => void;
  private onPauseRequest: () => void;
  private onPointerLockChange: (locked: boolean) => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    collision: CollisionSystem,
    audio: AudioManager,
    callbacks: {
      onToggleFlashlight: () => void;
      onInteract: () => void;
      onPauseRequest: () => void;
      onPointerLockChange: (locked: boolean) => void;
    }
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.collision = collision;
    this.audio = audio;
    this.onToggleFlashlight = callbacks.onToggleFlashlight;
    this.onInteract = callbacks.onInteract;
    this.onPauseRequest = callbacks.onPauseRequest;
    this.onPointerLockChange = callbacks.onPointerLockChange;

    // Make canvas focusable so keyboard events always work inside iframes
    this.domElement.tabIndex = 0;
    this.domElement.style.outline = 'none';

    this.reset();
    this.bindEvents();
  }

  public reset(): void {
    // Spawn in clear open floor of the Bedroom
    this.position.set(-5.6, 0, 3.8);
    this.velocity.set(0, 0, 0);
    this.yaw = 0.55;
    this.pitch = -0.05;
    this.stamina = 100;
    this.isSprinting = false;
    this.sprintRecoveryCooldown = 0;
    this.bobTimer = 0;
    this.stepAccumulator = 0;
    this.cameraShakeAmount = 0;
    this.clearInputState();
    this.syncCameraTransform(0);
  }

  public setPlaying(playing: boolean): void {
    this.isPlaying = playing;
    if (!playing) {
      this.clearInputState();
      this.velocity.set(0, 0, 0);
    } else {
      this.focusCanvas();
    }
  }

  private clearInputState(): void {
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.sprintHeld = false;
    this.turnLeft = false;
    this.turnRight = false;
    this.isDraggingLook = false;
  }

  public focusCanvas(): void {
    try {
      window.focus();
      this.domElement.focus({ preventScroll: true });
    } catch {
      // Ignore focus errors in restricted contexts
    }
  }

  public focusAndLock(): void {
    if (!this.isPlaying) return;
    this.focusCanvas();
    this.requestPointerLock();
    // Re-verify focus on next animation frame after any React menu overlay unmounts
    requestAnimationFrame(() => {
      if (this.isPlaying) {
        this.focusCanvas();
      }
    });
  }

  public requestPointerLock(): void {
    if (!this.isPlaying) return;
    this.isUnlockingProgrammatically = false;
    try {
      if (document.pointerLockElement !== this.domElement) {
        const promise = this.domElement.requestPointerLock?.() as unknown as Promise<void>;
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {
            // Pointer lock may be rejected in sandboxed iframes; focus remains active
            this.focusCanvas();
          });
        }
      }
    } catch {
      this.focusCanvas();
    }
  }

  public releasePointerLock(): void {
    this.isUnlockingProgrammatically = true;
    this.isPointerLocked = false;
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    } catch {
      // Ignore
    }
  }

  public addCameraShake(intensity: number): void {
    this.cameraShakeAmount = Math.max(this.cameraShakeAmount, intensity);
  }

  public lookAtWorldTarget(target: THREE.Vector3): void {
    this.camera.lookAt(target);
    _euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = _euler.y;
    this.pitch = _euler.x;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('mousemove', this.handleMouseMove);
    this.domElement.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
  }

  private handleWindowBlur = (): void => {
    this.clearInputState();
  };

  private handlePointerLockChange = (): void => {
    const locked =
      document.pointerLockElement === this.domElement ||
      document.pointerLockElement === document.body;

    const wasLocked = this.isPointerLocked;
    this.isPointerLocked = locked;
    this.onPointerLockChange(locked);

    // If pointer lock was exited by the user (e.g. pressing Esc) while PLAYING,
    // pause the game cleanly once.
    if (wasLocked && !locked && !this.isUnlockingProgrammatically && this.isPlaying) {
      this.onPauseRequest();
    }
    this.isUnlockingProgrammatically = false;
  };

  private handlePointerLockError = (): void => {
    this.isPointerLocked = false;
    this.onPointerLockChange(false);
    if (this.isPlaying) {
      this.focusCanvas();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Only capture movement and gameplay controls when in PLAYING state
    if (!this.isPlaying) return;

    const code = e.code;
    const key = e.key.toLowerCase();

    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true;
        e.preventDefault();
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true;
        e.preventDefault();
        break;
      case 'KeyA':
        this.moveLeft = true;
        e.preventDefault();
        break;
      case 'KeyD':
        this.moveRight = true;
        e.preventDefault();
        break;
      case 'ArrowLeft':
        this.turnLeft = true;
        e.preventDefault();
        break;
      case 'ArrowRight':
        this.turnRight = true;
        e.preventDefault();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sprintHeld = true;
        break;
      case 'Space':
        e.preventDefault();
        break;
      case 'KeyF':
        if (!e.repeat) this.onToggleFlashlight();
        break;
      case 'KeyE':
        if (!e.repeat) this.onInteract();
        break;
      case 'Escape':
      case 'KeyP':
        if (!e.repeat) this.onPauseRequest();
        return;
    }

    // Also map by e.key character for non-QWERTY layouts
    if (key === 'w') {
      this.moveForward = true;
      e.preventDefault();
    } else if (key === 's') {
      this.moveBackward = true;
      e.preventDefault();
    } else if (key === 'a') {
      this.moveLeft = true;
      e.preventDefault();
    } else if (key === 'd') {
      this.moveRight = true;
      e.preventDefault();
    } else if (key === 'shift') {
      this.sprintHeld = true;
    } else if (key === 'f' && code !== 'KeyF' && !e.repeat) {
      this.onToggleFlashlight();
    } else if (key === 'e' && code !== 'KeyE' && !e.repeat) {
      this.onInteract();
    } else if (key === 'p' && code !== 'KeyP' && !e.repeat) {
      this.onPauseRequest();
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const code = e.code;
    const key = e.key.toLowerCase();

    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false;
        break;
      case 'KeyA':
        this.moveLeft = false;
        break;
      case 'KeyD':
        this.moveRight = false;
        break;
      case 'ArrowLeft':
        this.turnLeft = false;
        break;
      case 'ArrowRight':
        this.turnRight = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sprintHeld = false;
        break;
    }

    if (key === 'w') this.moveForward = false;
    else if (key === 's') this.moveBackward = false;
    else if (key === 'a') this.moveLeft = false;
    else if (key === 'd') this.moveRight = false;
    else if (key === 'shift') this.sprintHeld = false;
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (!this.isPlaying) return;
    if (e.button === 0) {
      this.isDraggingLook = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.focusAndLock();
    }
  };

  private handleMouseUp = (): void => {
    this.isDraggingLook = false;
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isPlaying) return;
    const sensitivity = 0.0022;

    if (
      document.pointerLockElement === this.domElement ||
      document.pointerLockElement === document.body
    ) {
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2.25, Math.PI / 2.25);
    } else if (this.isDraggingLook) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.yaw -= dx * sensitivity * 1.3;
      this.pitch -= dy * sensitivity * 1.3;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2.25, Math.PI / 2.25);
    }
  };

  public update(delta: number): void {
    if (!this.isPlaying) return;

    // Allow arrow keys for smooth horizontal turning if needed
    const turnSpeed = 1.9;
    if (this.turnLeft) this.yaw += turnSpeed * delta;
    if (this.turnRight) this.yaw -= turnSpeed * delta;

    // Input movement vector mapped from WASD flags
    const inputForward = (this.moveForward ? 1 : 0) - (this.moveBackward ? 1 : 0);
    const inputRight = (this.moveRight ? 1 : 0) - (this.moveLeft ? 1 : 0);

    const isMoving = inputForward !== 0 || inputRight !== 0;
    const wantsSprint =
      this.sprintHeld && isMoving && this.sprintRecoveryCooldown <= 0;

    if (wantsSprint && this.stamina > 0) {
      this.isSprinting = true;
      this.stamina = Math.max(0, this.stamina - 24 * delta);
      if (this.stamina <= 0) {
        this.sprintRecoveryCooldown = 1.8;
        this.isSprinting = false;
      }
    } else {
      this.isSprinting = false;
      if (this.sprintRecoveryCooldown > 0) {
        this.sprintRecoveryCooldown = Math.max(0, this.sprintRecoveryCooldown - delta);
      }
      this.stamina = Math.min(100, this.stamina + 16 * delta);
    }

    const targetSpeed = isMoving
      ? this.isSprinting
        ? this.sprintSpeed
        : this.walkSpeed
      : 0;

    // Compute camera-aligned horizontal forward and right vectors on XZ plane
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

    _moveVec.set(0, 0, 0);
    if (isMoving) {
      _moveVec
        .addScaledVector(_forward, inputForward)
        .addScaledVector(_right, inputRight)
        .normalize()
        .multiplyScalar(targetSpeed);
    }

    // Smooth acceleration & deceleration
    const accel = isMoving ? 14.0 : 11.0;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, _moveVec.x, accel, delta);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, _moveVec.z, accel, delta);

    const desiredX = this.position.x + this.velocity.x * delta;
    const desiredZ = this.position.z + this.velocity.z * delta;

    const resolved = this.collision.resolveMovement(
      this.position,
      desiredX,
      desiredZ,
      this.playerRadius,
      this.eyeHeight
    );

    const distMoved = Math.hypot(resolved.x - this.position.x, resolved.z - this.position.z);
    this.position.set(resolved.x, resolved.y, resolved.z);

    // Head bobbing & synchronized footsteps
    const horizontalSpeed = distMoved / Math.max(delta, 0.001);
    if (horizontalSpeed > 0.35) {
      const bobFreq = this.isSprinting ? 12.5 : 8.2;
      this.bobTimer += delta * bobFreq;
      this.stepAccumulator += distMoved;

      const stepStride = this.isSprinting ? 1.85 : 1.45;
      if (this.stepAccumulator >= stepStride) {
        this.stepAccumulator = 0;
        const surface = this.collision.getSurfaceType(this.position.x, this.position.z);
        this.audio.playFootstep(surface, this.isSprinting);
      }
    } else {
      this.bobTimer = 0;
      this.stepAccumulator = 0.8;
    }

    if (this.cameraShakeAmount > 0) {
      this.cameraShakeAmount = Math.max(0, this.cameraShakeAmount - delta * 2.2);
    }

    this.syncCameraTransform(horizontalSpeed);
  }

  private syncCameraTransform(speed: number): void {
    const bobOffsetY =
      speed > 0.35
        ? Math.sin(this.bobTimer) * (this.isSprinting ? 0.055 : 0.032)
        : 0;
    const bobOffsetX = speed > 0.35 ? Math.cos(this.bobTimer * 0.5) * 0.02 : 0;

    const shakeX = (Math.random() - 0.5) * this.cameraShakeAmount * 0.12;
    const shakeY = (Math.random() - 0.5) * this.cameraShakeAmount * 0.12;

    this.camera.position.set(
      this.position.x + bobOffsetX + shakeX,
      this.position.y + this.eyeHeight + bobOffsetY + shakeY,
      this.position.z
    );

    _euler.set(this.pitch + shakeY * 0.5, this.yaw + shakeX * 0.5, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('mousemove', this.handleMouseMove);
    this.domElement.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
  }
}
