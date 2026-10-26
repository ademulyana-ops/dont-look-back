import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { Flashlight } from '../player/Flashlight';
import { HouseLights } from '../world/HouseBuilder';

export class HorrorEffects {
  private lights: HouseLights;
  private mirrorSilhouette: THREE.Mesh;
  private flashlight: Flashlight;
  private audio: AudioManager;

  private tvStaticTimer = 0;
  private nextEventTime = 8.0;
  private mirrorEventActive = false;
  private mirrorEventTimer = 0;

  constructor(
    lights: HouseLights,
    mirrorSilhouette: THREE.Mesh,
    flashlight: Flashlight,
    audio: AudioManager
  ) {
    this.lights = lights;
    this.mirrorSilhouette = mirrorSilhouette;
    this.flashlight = flashlight;
    this.audio = audio;
  }

  public reset(): void {
    this.tvStaticTimer = 0;
    this.nextEventTime = 7.0;
    this.mirrorEventActive = false;
    this.mirrorEventTimer = 0;
    const mat = this.mirrorSilhouette.material as THREE.MeshBasicMaterial;
    mat.opacity = 0;
    this.flashlight.setFlicker(1.0);
  }

  public update(
    delta: number,
    elapsedTime: number,
    currentRoom: string,
    pendantsCollected: number,
    monsterDistance: number
  ): void {
    // 1. Update TV static canvas ~15 fps when in or near Living Room
    this.tvStaticTimer += delta;
    if (this.tvStaticTimer >= 0.065) {
      this.tvStaticTimer = 0;
      this.lights.updateTVStatic();
      const staticFlicker = 0.45 + Math.random() * 0.4;
      this.lights.tvLight.intensity = staticFlicker;
    }

    // 2. Kitchen overhead light erratic flicker
    const kFlicker =
      Math.sin(elapsedTime * 19.0) * Math.sin(elapsedTime * 7.3) > 0.65
        ? 0.12
        : 0.55;
    this.lights.kitchenLight.intensity = kFlicker;

    // 3. Hallway light subtle hum flicker
    this.lights.hallwayLight.intensity =
      0.36 + Math.sin(elapsedTime * 4.5) * 0.04;

    // 4. Flashlight subtle interference when The Watcher is very close (< 7m)
    if (monsterDistance < 7.0 && pendantsCollected > 0) {
      const interference =
        Math.sin(elapsedTime * 37.0) > 0.55
          ? 0.4 + Math.random() * 0.5
          : 1.0;
      this.flashlight.setFlicker(interference);
    } else {
      this.flashlight.setFlicker(1.0);
    }

    // 5. Bathroom mirror fleeting silhouette event
    if (this.mirrorEventActive) {
      this.mirrorEventTimer -= delta;
      const mat = this.mirrorSilhouette.material as THREE.MeshBasicMaterial;
      if (this.mirrorEventTimer <= 0) {
        this.mirrorEventActive = false;
        mat.opacity = 0;
      } else {
        mat.opacity = 0.35 + Math.random() * 0.25;
      }
    }

    // 6. Periodic atmospheric horror events
    if (elapsedTime >= this.nextEventTime) {
      const tensionFactor = Math.max(0, 1 - pendantsCollected * 0.14);
      this.nextEventTime =
        elapsedTime + (9.0 + Math.random() * 10.0) * tensionFactor;

      if (currentRoom === 'Bathroom' && !this.mirrorEventActive) {
        this.mirrorEventActive = true;
        this.mirrorEventTimer = 0.75;
        this.audio.playWoodCreak(0.22);
      } else if (Math.random() < 0.5) {
        this.audio.playWoodCreak(0.18);
      }
    }
  }
}
