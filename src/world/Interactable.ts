import * as THREE from 'three';

export interface InteractableItem {
  id: string;
  position: THREE.Vector3;
  interactionRadius: number;
  getPrompt: () => string | null;
  onInteract: () => void;
  isEnabled: () => boolean;
}

const _camDir = new THREE.Vector3();
const _toItem = new THREE.Vector3();

export class InteractableSystem {
  private items: InteractableItem[] = [];
  private activeItem: InteractableItem | null = null;

  public register(item: InteractableItem): void {
    this.items.push(item);
  }

  public clear(): void {
    this.items = [];
    this.activeItem = null;
  }

  public update(camera: THREE.Camera): string | null {
    camera.getWorldDirection(_camDir);
    const camPos = camera.position;

    let bestItem: InteractableItem | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item.isEnabled()) continue;

      const dist = camPos.distanceTo(item.position);
      if (dist > item.interactionRadius) continue;

      _toItem.subVectors(item.position, camPos).normalize();
      const dot = _camDir.dot(_toItem);

      // Must be looking reasonably toward the item (or very close to it)
      if (dot > 0.55 || (dist < 1.35 && dot > 0.25)) {
        const score = dist * (1.5 - dot);
        if (score < bestScore) {
          bestScore = score;
          bestItem = item;
        }
      }
    }

    this.activeItem = bestItem;
    return bestItem ? bestItem.getPrompt() : null;
  }

  public triggerActiveInteraction(): boolean {
    if (this.activeItem && this.activeItem.isEnabled()) {
      this.activeItem.onInteract();
      return true;
    }
    return false;
  }
}
