import * as THREE from 'three';

const _camPos = new THREE.Vector3();
const _camQuat = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

export class Flashlight {
  public isOn = true;
  private spotLight: THREE.SpotLight;
  private closeFillLight: THREE.PointLight;
  private targetObj: THREE.Object3D;
  private currentQuat = new THREE.Quaternion();
  private initializedQuat = false;
  private flickerMult = 1.0;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    // Primary focused flashlight beam
    this.spotLight = new THREE.SpotLight(
      0xfff1cf,
      3.8,
      20.0,
      Math.PI / 5.2,
      0.62,
      1.7
    );
    this.spotLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      this.spotLight.shadow.mapSize.width = 1024;
      this.spotLight.shadow.mapSize.height = 1024;
      this.spotLight.shadow.camera.near = 0.25;
      this.spotLight.shadow.camera.far = 19.0;
      this.spotLight.shadow.bias = -0.0004;
    }

    // Subtle close-range spill so immediate surroundings aren't pitch black when on
    this.closeFillLight = new THREE.PointLight(0xffe8ba, 0.55, 4.5, 2.0);

    this.targetObj = new THREE.Object3D();
    scene.add(this.spotLight);
    scene.add(this.closeFillLight);
    scene.add(this.targetObj);
    this.spotLight.target = this.targetObj;
  }

  public toggle(): boolean {
    this.isOn = !this.isOn;
    this.spotLight.visible = this.isOn;
    this.closeFillLight.visible = this.isOn;
    return this.isOn;
  }

  public setOn(state: boolean): void {
    this.isOn = state;
    this.spotLight.visible = this.isOn;
    this.closeFillLight.visible = this.isOn;
  }

  public setFlicker(multiplier: number): void {
    this.flickerMult = multiplier;
  }

  public update(camera: THREE.Camera, delta: number): void {
    camera.getWorldPosition(_camPos);
    camera.getWorldQuaternion(_camQuat);

    if (!this.initializedQuat) {
      this.currentQuat.copy(_camQuat);
      this.initializedQuat = true;
    } else {
      // Smooth handheld flashlight lag
      const slerpAlpha = 1 - Math.exp(-18 * delta);
      this.currentQuat.slerp(_camQuat, slerpAlpha);
    }

    _forward.set(0, 0, -1).applyQuaternion(this.currentQuat);
    _right.set(1, 0, 0).applyQuaternion(this.currentQuat);
    _up.set(0, 1, 0).applyQuaternion(this.currentQuat);

    // Position slightly down and right like a handheld flashlight
    this.spotLight.position
      .copy(_camPos)
      .addScaledVector(_right, 0.16)
      .addScaledVector(_up, -0.14);

    this.closeFillLight.position.copy(_camPos).addScaledVector(_forward, 0.35);

    this.targetObj.position.copy(this.spotLight.position).addScaledVector(_forward, 8.0);

    this.spotLight.intensity = this.isOn ? 3.8 * this.flickerMult : 0;
    this.closeFillLight.intensity = this.isOn ? 0.55 * this.flickerMult : 0;
  }
}
