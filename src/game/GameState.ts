export enum GameMode {
  MAIN_MENU = 'MAIN_MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY',
}

export enum MonsterState {
  DORMANT = 'DORMANT',
  APPROACH = 'APPROACH',
  FROZEN = 'FROZEN',
  ATTACK = 'ATTACK',
}

export interface ActiveNote {
  id: string;
  body: string;
  signature: string;
}

export interface GameSnapshot {
  mode: GameMode;
  pendantsCollected: number;
  totalPendants: number;
  carryingPendant: boolean;
  powerRestored: boolean;
  flashlightOn: boolean;
  stamina: number; // 0 to 100
  isSprinting: boolean;
  monsterState: MonsterState;
  monsterDistance: number;
  monsterVisible: boolean;
  currentRoom: string;
  objectiveText: string;
  interactionPrompt: string | null;
  statusMessage: string | null;
  timeSurvived: number;
  pointerLocked: boolean;
  hudCollapsed: boolean;
  activeNote: ActiveNote | null;
  introCutsceneActive: boolean;
  introSubtitle: string | null;
  introBlinkAmount: number;
}

type Listener = (snapshot: GameSnapshot) => void;

export class GameStateManager {
  private state: GameSnapshot = {
    mode: GameMode.MAIN_MENU,
    pendantsCollected: 0,
    totalPendants: 5,
    carryingPendant: false,
    powerRestored: false,
    flashlightOn: true,
    stamina: 100,
    isSprinting: false,
    monsterState: MonsterState.DORMANT,
    monsterDistance: 99,
    monsterVisible: false,
    currentRoom: 'Bedroom',
    objectiveText: 'Search the house for Pendant Piece #1, then insert it at the Front Door',
    interactionPrompt: null,
    statusMessage: null,
    timeSurvived: 0,
    pointerLocked: false,
    hudCollapsed: false,
    activeNote: null,
    introCutsceneActive: false,
    introSubtitle: null,
    introBlinkAmount: 0,
  };

  private listeners: Set<Listener> = new Set();
  private statusTimeout: number | null = null;

  public getSnapshot(): GameSnapshot {
    return { ...this.state };
  }

  public update(partial: Partial<GameSnapshot>): void {
    let changed = false;
    for (const key of Object.keys(partial) as Array<keyof GameSnapshot>) {
      if (this.state[key] !== partial[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    this.state = { ...this.state, ...partial };
    this.notify();
  }

  public showTemporaryMessage(msg: string, durationMs = 3200): void {
    if (this.statusTimeout !== null) {
      window.clearTimeout(this.statusTimeout);
    }
    this.update({ statusMessage: msg });
    this.statusTimeout = window.setTimeout(() => {
      this.update({ statusMessage: null });
      this.statusTimeout = null;
    }, durationMs);
  }

  public resetForNewGame(): void {
    if (this.statusTimeout !== null) {
      window.clearTimeout(this.statusTimeout);
      this.statusTimeout = null;
    }
    this.state = {
      ...this.state,
      mode: GameMode.PLAYING,
      pendantsCollected: 0,
      totalPendants: 5,
      carryingPendant: false,
      powerRestored: false,
      flashlightOn: false,
      stamina: 100,
      isSprinting: false,
      monsterState: MonsterState.DORMANT,
      monsterDistance: 99,
      monsterVisible: false,
      currentRoom: 'Bedroom',
      objectiveText: 'Find Pendant Piece #1 (random location) and insert it into the Front Door',
      interactionPrompt: null,
      statusMessage: null,
      timeSurvived: 0,
      activeNote: null,
      introCutsceneActive: true,
      introSubtitle: null,
      introBlinkAmount: 1,
    };
    this.notify();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }
}
