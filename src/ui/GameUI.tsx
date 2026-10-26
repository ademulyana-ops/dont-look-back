import React from 'react';
import { GameMode, GameSnapshot, MonsterState } from '../game/GameState';
import { PENDANT_SHARD_POLYGONS } from '../world/TextureGenerator';

interface GameUIProps {
  snapshot: GameSnapshot;
  onPlay: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onToggleFlashlight: () => void;
  onTriggerInteract: () => void;
  onToggleHudCollapsed: () => void;
  onLockPointer: () => void;
  onCloseNote: () => void;
}

export const GameUI: React.FC<GameUIProps> = ({
  snapshot,
  onPlay,
  onResume,
  onRestart,
  onMainMenu,
  onToggleFlashlight,
  onTriggerInteract,
  onToggleHudCollapsed,
  onLockPointer,
  onCloseNote,
}) => {
  const formatTime = (secs: number): string => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const isMonsterClose =
    snapshot.mode === GameMode.PLAYING &&
    snapshot.monsterState !== MonsterState.DORMANT &&
    snapshot.monsterDistance < 7.5;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between overflow-hidden select-none">
      {/* Subtle VHS Scanlines & Atmospheric Vignette */}
      <div className="vhs-scanlines pointer-events-none absolute inset-0 opacity-35" />
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          isMonsterClose ? 'danger-vignette opacity-95' : 'vhs-vignette opacity-90'
        }`}
      />

      {/* ==================== PLAYING HUD ==================== */}
      {snapshot.mode === GameMode.PLAYING && (
        <>
          {/* Top-Left Minimal Spec, 5-Piece Pendant Assembly & Objective Header */}
          <div className="relative z-10 flex items-center gap-4 px-6 pt-5">
            {/* Live 5-Shard Pendant Emblem Assembly */}
            <div className="relative h-14 w-14 shrink-0 rounded-full border border-zinc-800/90 bg-zinc-950/85 p-1.5">
              {/* Faint full silhouette guide */}
              <img
                src="/assets/pendant/pendant-emblem.png"
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain opacity-15 grayscale"
              />
              {/* 5 Individual Interlocking Shards */}
              {PENDANT_SHARD_POLYGONS.map((poly, idx) => {
                const isInserted = idx < snapshot.pendantsCollected;
                const isHeld =
                  snapshot.carryingPendant && idx === snapshot.pendantsCollected;
                if (!isInserted && !isHeld) return null;

                const clipPoints = poly
                  .map(([px, py]) => `${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%`)
                  .join(', ');

                return (
                  <img
                    key={idx}
                    src="/assets/pendant/pendant-emblem.png"
                    alt={`Pendant Shard ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    style={{ clipPath: `polygon(${clipPoints})` }}
                    className={`absolute inset-1.5 h-[calc(100%-0.75rem)] w-[calc(100%-0.75rem)] object-contain transition-opacity duration-300 ${
                      isHeld ? 'animate-pulse opacity-85 brightness-125' : 'opacity-100'
                    }`}
                  />
                );
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-3 text-xs tracking-wider text-zinc-400 font-mono-tabular">
                <span className="font-semibold text-amber-400">
                  DOOR SEAL: {snapshot.pendantsCollected}/{snapshot.totalPendants}
                </span>
                {snapshot.carryingPendant && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-emerald-400">
                      HOLDING PIECE #{snapshot.pendantsCollected + 1}/5 (GO TO FRONT DOOR)
                    </span>
                  </>
                )}
                {snapshot.pendantsCollected >= 5 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        snapshot.powerRestored
                          ? 'font-semibold text-emerald-400'
                          : 'font-semibold text-red-400'
                      }
                    >
                      {snapshot.powerRestored
                        ? 'POWER: ON (FRONT DOOR OPEN)'
                        : 'POWER: OFF (FLIP BASEMENT SWITCH)'}
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="text-zinc-300">{snapshot.currentRoom}</span>
                <span aria-hidden="true">·</span>
                <span>REC {formatTime(snapshot.timeSurvived)}</span>
                {snapshot.monsterState !== MonsterState.DORMANT && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        snapshot.monsterVisible
                          ? 'text-amber-300 font-semibold'
                          : snapshot.monsterDistance < 8
                            ? 'text-red-400 font-semibold'
                            : 'text-zinc-400'
                      }
                    >
                      {snapshot.monsterVisible
                        ? 'WATCHER: LOCKED IN SIGHT'
                        : 'WATCHER: STALKING'}
                    </span>
                  </>
                )}
              </div>

              <p className="text-sm font-medium text-zinc-200 tracking-wide">
                Objective: {snapshot.objectiveText}
              </p>
            </div>
          </div>

          {/* Center Crosshair Reticle & Contextual Prompts */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            {/* Minimal Center Reticle */}
            <div
              className={`h-1.5 w-1.5 rounded-full transition-transform duration-150 ${
                snapshot.interactionPrompt
                  ? 'scale-150 bg-amber-300'
                  : 'bg-zinc-200/75'
              }`}
            />

            {!snapshot.pointerLocked && (
              <button
                type="button"
                onClick={onLockPointer}
                className="pointer-events-auto mt-4 bg-zinc-950/90 hover:bg-zinc-900 border border-zinc-700 px-4 py-1.5 text-[11px] font-mono-tabular tracking-widest text-zinc-300 transition-colors cursor-pointer"
              >
                CLICK VIEWPORT TO LOCK MOUSE CURSOR
              </button>
            )}

            {/* Contextual Interaction Prompt */}
            {snapshot.interactionPrompt && (
              <div className="mt-5 bg-zinc-950/90 border border-zinc-700/80 px-4 py-2 text-xs font-mono-tabular tracking-widest text-amber-300">
                {snapshot.interactionPrompt}
              </div>
            )}

            {/* Narrative / Progression Banner */}
            {snapshot.statusMessage && (
              <div className="mt-3 max-w-lg text-center bg-zinc-950/85 border border-zinc-800 px-5 py-2.5 text-xs tracking-wider text-zinc-200">
                {snapshot.statusMessage}
              </div>
            )}
          </div>

          {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
          <div className="relative z-10 flex flex-col items-center pb-4">
            <button
              type="button"
              onClick={onToggleHudCollapsed}
              className="pointer-events-auto mb-1 bg-zinc-950/90 border border-zinc-800 px-3 py-1 text-[11px] font-mono-tabular text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap shrink-0"
            >
              {snapshot.hudCollapsed ? '▴ Show Controls' : '▾ Hide Controls'}
            </button>

            {!snapshot.hudCollapsed && (
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-6 bg-zinc-950/92 border border-zinc-800 px-6 py-2.5 text-xs font-mono-tabular text-zinc-300 max-w-[min(940px,94vw)]">
                <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
                  <span className="text-zinc-400">FLASHLIGHT [F]:</span>
                  <button
                    type="button"
                    onClick={onToggleFlashlight}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 transition-colors whitespace-nowrap shrink-0"
                  >
                    {snapshot.flashlightOn ? 'ON (INF)' : 'OFF'}
                  </button>
                </div>

                <span aria-hidden="true" className="text-zinc-700">
                  |
                </span>

                <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
                  <span className="text-zinc-400">STAMINA [SHIFT]:</span>
                  <div className="w-24 h-2 bg-zinc-900 border border-zinc-700 overflow-hidden">
                    <div
                      className="h-full bg-zinc-300 transition-transform duration-100 origin-left"
                      style={{ transform: `scaleX(${snapshot.stamina / 100})` }}
                    />
                  </div>
                  <span className="w-9 text-right text-zinc-300">
                    {snapshot.stamina}%
                  </span>
                </div>

                {snapshot.interactionPrompt && (
                  <>
                    <span aria-hidden="true" className="text-zinc-700">
                      |
                    </span>
                    <button
                      type="button"
                      onClick={onTriggerInteract}
                      className="px-3 py-1 bg-amber-900/60 hover:bg-amber-800/70 border border-amber-600/60 text-amber-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      [E] Interact
                    </button>
                  </>
                )}

                <span aria-hidden="true" className="text-zinc-700">
                  |
                </span>

                <span className="text-zinc-400 whitespace-nowrap shrink-0">
                  WASD: Move · Mouse: Look · Esc: Pause
                </span>
              </div>
            )}
          </div>

          {/* Inspectable Paper Note Overlay (Closes on ENTER) */}
          {snapshot.activeNote && (
            <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/80 px-6">
              <div className="relative flex w-full max-w-md flex-col border-2 border-amber-950/90 bg-[#dfd3bc] p-8 text-zinc-900 shadow-2xl">
                <p className="font-serif text-lg sm:text-xl leading-relaxed text-zinc-900">
                  {snapshot.activeNote.body}
                </p>

                <p className="mt-6 text-right font-display text-2xl font-bold tracking-widest text-red-900">
                  {snapshot.activeNote.signature}
                </p>

                <div className="mt-8 flex flex-col items-center border-t border-amber-950/30 pt-4">
                  <button
                    type="button"
                    onClick={onCloseNote}
                    className="w-full bg-zinc-950 hover:bg-zinc-900 text-amber-200 border border-amber-800/80 px-5 py-2.5 text-xs font-mono-tabular tracking-widest transition-colors cursor-pointer"
                  >
                    [ENTER]
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Opening Wake-Up Cutscene Overlay (Eyelids Blinking + Spoken Subtitle) */}
          {snapshot.introCutsceneActive && (
            <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between overflow-hidden">
              {/* Top & Bottom Eyelid Blink Curtains */}
              <div
                className="w-full bg-black transition-transform duration-75 origin-top"
                style={{
                  height: '55vh',
                  transform: `scaleY(${snapshot.introBlinkAmount})`,
                }}
              />
              <div
                className="w-full bg-black transition-transform duration-75 origin-bottom"
                style={{
                  height: '55vh',
                  transform: `scaleY(${snapshot.introBlinkAmount})`,
                }}
              />

              {/* Spoken Monologue Subtitle */}
              {snapshot.introSubtitle && (
                <div className="absolute inset-x-0 bottom-20 flex flex-col items-center px-6 text-center">
                  <div className="bg-black/80 border border-zinc-800/90 px-6 py-3 shadow-2xl">
                    <p className="font-serif text-lg sm:text-xl italic tracking-wide text-zinc-100">
                      {snapshot.introSubtitle}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ==================== MAIN MENU ==================== */}
      {snapshot.mode === GameMode.MAIN_MENU && (
        <div className="pointer-events-auto relative z-20 flex h-full w-full items-center justify-center bg-zinc-950/78 px-6">
          <div className="flex w-full max-w-2xl flex-col items-center text-center border border-zinc-800/90 bg-zinc-950/95 p-10">
            <h1
              className="font-display text-5xl sm:text-6xl font-bold tracking-wider text-zinc-100"
              style={{ textWrap: 'balance' }}
            >
              DON&apos;T LOOK BACK
            </h1>

            <p className="mt-3 text-base italic text-red-400/90">
              &ldquo;Something is inside the house.&rdquo;
            </p>

            <div className="mt-8 w-full border-t border-b border-zinc-800/90 py-5 text-left">
              <h2 className="text-xs font-semibold tracking-wider text-zinc-300 mb-3">
                Controls & Survival Guide
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2.5 gap-x-6 text-xs font-mono-tabular text-zinc-400">
                <div>
                  <span className="text-zinc-200 font-semibold">W A S D</span> · Move
                </div>
                <div>
                  <span className="text-zinc-200 font-semibold">MOUSE</span> · Look Around
                </div>
                <div>
                  <span className="text-zinc-200 font-semibold">SHIFT</span> · Sprint
                </div>
                <div>
                  <span className="text-zinc-200 font-semibold">F</span> · Flashlight
                </div>
                <div>
                  <span className="text-zinc-200 font-semibold">E</span> · Collect / Open
                </div>
                <div>
                  <span className="text-zinc-200 font-semibold">ESC / P</span> · Pause
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={onPlay}
                className="px-8 py-3 bg-red-900 hover:bg-red-800 text-zinc-100 font-semibold text-sm tracking-widest border border-red-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                PLAY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PAUSE MENU ==================== */}
      {snapshot.mode === GameMode.PAUSED && (
        <div className="pointer-events-auto relative z-20 flex h-full w-full items-center justify-center bg-zinc-950/82 px-6">
          <div className="flex w-full max-w-md flex-col items-center text-center border border-zinc-800 bg-zinc-950 p-8">
            <h2 className="font-display text-3xl font-bold tracking-widest text-zinc-100">
              GAME PAUSED
            </h2>
            <p className="mt-2 text-xs font-mono-tabular text-zinc-400">
              PENDANT PIECES: {snapshot.pendantsCollected}/{snapshot.totalPendants} ·
              LOCATION: {snapshot.currentRoom.toUpperCase()}
            </p>

            <div className="mt-8 flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={onResume}
                className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs tracking-widest transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                RESUME
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 font-semibold text-xs tracking-widest transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                RESTART
              </button>
              <button
                type="button"
                onClick={onMainMenu}
                className="w-full py-2.5 px-4 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800 font-semibold text-xs tracking-widest transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== GAME OVER SCREEN ==================== */}
      {snapshot.mode === GameMode.GAME_OVER && (
        <div className="pointer-events-auto relative z-20 flex h-full w-full items-center justify-center bg-black/90 px-6">
          <div className="flex w-full max-w-md flex-col items-center text-center border border-red-900/70 bg-zinc-950 p-9">
            <p className="text-xs font-mono-tabular tracking-widest text-red-500">
              SIGNAL LOST · {formatTime(snapshot.timeSurvived)}
            </p>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-widest text-red-500">
              YOU WERE CAUGHT.
            </h2>
            <p className="mt-3 text-sm text-zinc-300">
              You looked away for a moment too long. The Watcher claimed you with{' '}
              {snapshot.pendantsCollected} of {snapshot.totalPendants} pendant pieces
              recovered.
            </p>

            <div className="mt-8 flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={onRestart}
                className="w-full py-2.5 px-4 bg-red-900 hover:bg-red-800 text-zinc-100 border border-red-700 font-semibold text-xs tracking-widest transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                RESTART
              </button>
              <button
                type="button"
                onClick={onMainMenu}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-semibold text-xs tracking-widest transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== VICTORY SCREEN ==================== */}
      {snapshot.mode === GameMode.VICTORY && (
        <div className="pointer-events-auto relative z-20 flex h-full w-full items-center justify-center bg-zinc-950/55 px-6">
          <div className="flex w-full max-w-md flex-col items-center text-center border border-amber-700/60 bg-zinc-950/90 p-9">
            <p className="text-xs font-mono-tabular tracking-widest text-amber-400">
              FRONT YARD · TIME: {formatTime(snapshot.timeSurvived)}
            </p>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-widest text-zinc-100">
              YOU ESCAPED.
            </h2>
            <p className="mt-3 text-sm text-zinc-300">
              With all five pendant fragments united and the basement power breaker
              restored, the front door swung open into the rainy front yard. You
              stepped out into the cold rain and left The Watcher behind.
            </p>

            <div className="mt-8 flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={onRestart}
                className="w-full py-2.5 px-4 bg-amber-700 hover:bg-amber-600 text-zinc-950 font-semibold text-xs tracking-widest transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                PLAY AGAIN
              </button>
              <button
                type="button"
                onClick={onMainMenu}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 font-semibold text-xs tracking-widest transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
