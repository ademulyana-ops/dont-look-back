import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { GameSnapshot, GameStateManager } from './game/GameState';
import { GameUI } from './ui/GameUI';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const stateManagerRef = useRef<GameStateManager>(new GameStateManager());

  const [snapshot, setSnapshot] = useState<GameSnapshot>(() =>
    stateManagerRef.current.getSnapshot()
  );
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = stateManagerRef.current.subscribe((nextSnap) => {
      setSnapshot(nextSnap);
    });

    if (!canvasMountRef.current) return unsubscribe;

    // Verify WebGL availability
    const testCanvas = document.createElement('canvas');
    const gl =
      testCanvas.getContext('webgl2') ||
      testCanvas.getContext('webgl') ||
      testCanvas.getContext('experimental-webgl');

    if (!gl) {
      setWebglError(
        'WebGL is unavailable in your browser. Please enable hardware acceleration or use a modern desktop browser.'
      );
      return unsubscribe;
    }

    const game = new Game(canvasMountRef.current, stateManagerRef.current);
    gameRef.current = game;

    return () => {
      unsubscribe();
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  if (webglError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 p-6 text-center text-zinc-200">
        <div className="max-w-md border border-zinc-800 bg-zinc-900 p-8">
          <h1 className="font-display text-2xl font-bold text-red-400">
            WebGL Required
          </h1>
          <p className="mt-3 text-sm text-zinc-300">{webglError}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      {/* Isolated WebGL Canvas Mount Container */}
      <div ref={canvasMountRef} className="h-full w-full" />

      {/* Semantic DOM UI Overlay */}
      <GameUI
        snapshot={snapshot}
        onPlay={() => gameRef.current?.startNewGame()}
        onResume={() => gameRef.current?.resumeGame()}
        onRestart={() => gameRef.current?.startNewGame()}
        onMainMenu={() => gameRef.current?.returnToMainMenu()}
        onToggleFlashlight={() => gameRef.current?.triggerFlashlightToggle()}
        onTriggerInteract={() => gameRef.current?.triggerInteract()}
        onToggleHudCollapsed={() => gameRef.current?.toggleHudCollapsed()}
        onLockPointer={() => gameRef.current?.lockPointer()}
        onCloseNote={() => gameRef.current?.closeActiveNote()}
      />
    </main>
  );
}
