import { BrowserProvider, Contract, type Eip1193Provider } from 'ethers';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { GameMode, GameSnapshot, GameStateManager } from './game/GameState';
import { GameUI } from './ui/GameUI';
import { LeaderboardPanel } from './ui/LeaderboardPanel';
import { finishRun, reportKeyProgress, startRun } from './web3/scoreApi';
import {
  HEMI_CHAIN_HEX,
  HEMI_CHAIN_ID,
  HEMI_EXPLORER_URL,
  HEMI_RPC_URL,
  SCORE_CONTRACT_ABI,
  SCORE_CONTRACT_ADDRESS,
  type HemiEthereumProvider,
} from './web3/hemi';

type SubmissionStatus =
  | 'idle'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error';

interface SubmissionState {
  status: SubmissionStatus;
  message: string;
  transactionHash: string | null;
  timeMs: number | null;
}

interface ActiveRunSession {
  sessionId: string;
  address: string;
  reportedCount: number;
  progressQueue: Promise<void>;
  finishing: boolean;
}

function getErrorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { code?: string | number; info?: { error?: { code?: number } } };
  return candidate.code ?? candidate.info?.error?.code;
}

function getFriendlyError(error: unknown): string {
  const code = getErrorCode(error);
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
  if (code === 4001 || code === 'ACTION_REJECTED') {
    return 'Request rejected in your wallet.';
  }
  if (code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(message)) {
    return 'Your wallet does not have enough ETH on Hemi to pay the transaction gas.';
  }
  return message;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const stateManagerRef = useRef<GameStateManager>(new GameStateManager());
  const activeRunRef = useRef<ActiveRunSession | null>(null);

  const [snapshot, setSnapshot] = useState<GameSnapshot>(() =>
    stateManagerRef.current.getSnapshot()
  );
  const [webglError, setWebglError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({
    status: 'idle',
    message: '',
    transactionHash: null,
    timeMs: null,
  });

  const connectWallet = useCallback(async (): Promise<string> => {
    const injected = window.ethereum as HemiEthereumProvider | undefined;
    if (!injected) {
      throw new Error('No wallet found. Install a browser wallet to submit scores.');
    }

    setWalletBusy(true);
    setWalletMessage(null);
    try {
      let provider = new BrowserProvider(injected as Eip1193Provider);
      await provider.send('eth_requestAccounts', []);
      let network = await provider.getNetwork();

      if (Number(network.chainId) !== HEMI_CHAIN_ID) {
        try {
          await injected.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: HEMI_CHAIN_HEX }],
          });
        } catch (switchError) {
          if (getErrorCode(switchError) !== 4902) throw switchError;
          await injected.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: HEMI_CHAIN_HEX,
                chainName: 'Hemi',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: [HEMI_RPC_URL],
                blockExplorerUrls: [HEMI_EXPLORER_URL],
              },
            ],
          });
          await injected.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: HEMI_CHAIN_HEX }],
          });
        }

        provider = new BrowserProvider(injected as Eip1193Provider);
        network = await provider.getNetwork();
      }

      if (Number(network.chainId) !== HEMI_CHAIN_ID) {
        throw new Error('Switch your wallet to Hemi Mainnet to continue.');
      }

      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
      setWalletChainId(Number(network.chainId));
      return address;
    } finally {
      setWalletBusy(false);
    }
  }, []);

  const submitWinningRun = useCallback(async (
    session: ActiveRunSession,
    winningSnapshot: GameSnapshot
  ) => {
    let submittedHash: string | null = null;
    let signedTimeMs: number | null = null;
    setSubmission({
      status: 'signing',
      message: 'Verifying your run and requesting its signature...',
      transactionHash: null,
      timeMs: null,
    });

    try {
      await session.progressQueue;
      if (winningSnapshot.pendantsCollected !== winningSnapshot.totalPendants) {
        throw new Error('The run is missing one or more pendant pieces.');
      }

      const injected = window.ethereum as HemiEthereumProvider | undefined;
      if (!injected) throw new Error('Reconnect your wallet to submit this result.');
      const walletProvider = new BrowserProvider(injected as Eip1193Provider);
      const network = await walletProvider.getNetwork();
      if (Number(network.chainId) !== HEMI_CHAIN_ID) {
        throw new Error('Switch your wallet back to Hemi Mainnet to submit this result.');
      }
      const signer = await walletProvider.getSigner();
      const connectedAddress = await signer.getAddress();
      if (connectedAddress.toLowerCase() !== session.address.toLowerCase()) {
        throw new Error('Reconnect the wallet that started this run to submit its score.');
      }

      const signedRun = await finishRun(session.sessionId, winningSnapshot.pendantsCollected);
      signedTimeMs = signedRun.timeMs;
      const scoreContract = new Contract(
        SCORE_CONTRACT_ADDRESS,
        SCORE_CONTRACT_ABI,
        signer
      );
      setSubmission({
        status: 'submitting',
        message: 'Confirm the score transaction in your wallet...',
        transactionHash: null,
        timeMs: signedRun.timeMs,
      });
      const transaction = await scoreContract.submitTime(
        signedRun.timeMs,
        signedRun.signature
      );
      submittedHash = transaction.hash;
      setSubmission({
        status: 'confirming',
        message: 'Transaction sent. Waiting for Hemi confirmation...',
        transactionHash: transaction.hash,
        timeMs: signedRun.timeMs,
      });
      const receipt = await transaction.wait();
      if (!receipt || receipt.status !== 1) {
        throw new Error('The score transaction did not succeed on Hemi.');
      }
      setSubmission({
        status: 'success',
        message: 'Score submitted successfully.',
        transactionHash: transaction.hash,
        timeMs: signedRun.timeMs,
      });
    } catch (error) {
      setSubmission({
        status: 'error',
        message: getFriendlyError(error),
        transactionHash: submittedHash,
        timeMs: signedTimeMs,
      });
    }
  }, []);

  const startNewRun = useCallback(async () => {
    setWalletMessage(null);
    if (walletChainId !== HEMI_CHAIN_ID || !walletAddress) {
      setWalletMessage('Connect a wallet on Hemi Mainnet before starting a scored run.');
      return;
    }

    try {
      const session = await startRun(walletAddress);
      activeRunRef.current = {
        sessionId: session.sessionId,
        address: walletAddress,
        reportedCount: 0,
        progressQueue: Promise.resolve(),
        finishing: false,
      };
      setSubmission({
        status: 'idle',
        message: '',
        transactionHash: null,
        timeMs: null,
      });
      gameRef.current?.startNewGame();
    } catch (error) {
      setWalletMessage(getFriendlyError(error));
    }
  }, [walletAddress, walletChainId]);

  useEffect(() => {
    const unsubscribe = stateManagerRef.current.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);

      const session = activeRunRef.current;
      if (!session) return;

      while (session.reportedCount < nextSnapshot.pendantsCollected) {
        const insertedCount = session.reportedCount + 1;
        session.reportedCount = insertedCount;
        session.progressQueue = session.progressQueue.then(async () => {
          await reportKeyProgress(session.sessionId, insertedCount);
        });
      }

      if (nextSnapshot.mode === GameMode.VICTORY && !session.finishing) {
        session.finishing = true;
        void submitWinningRun(session, nextSnapshot);
      }
    });

    if (!canvasMountRef.current) return unsubscribe;
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
  }, [submitWinningRun]);

  useEffect(() => {
    const injected = window.ethereum as HemiEthereumProvider | undefined;
    if (!injected) return;

    const handleAccountsChanged = (value: unknown) => {
      const accounts = Array.isArray(value) ? value : [];
      setWalletAddress(typeof accounts[0] === 'string' ? accounts[0] : null);
    };
    const handleChainChanged = (value: unknown) => {
      const parsed = typeof value === 'string' ? Number(value) : Number(value);
      setWalletChainId(Number.isFinite(parsed) ? parsed : null);
    };
    injected.on('accountsChanged', handleAccountsChanged);
    injected.on('chainChanged', handleChainChanged);
    return () => {
      injected.removeListener('accountsChanged', handleAccountsChanged);
      injected.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  const handleConnectWallet = useCallback(() => {
    void connectWallet().catch((error: unknown) => {
      setWalletMessage(getFriendlyError(error));
    });
  }, [connectWallet]);

  const handleRestart = useCallback(() => {
    void startNewRun();
  }, [startNewRun]);

  const handleMainMenu = useCallback(() => {
    activeRunRef.current = null;
    gameRef.current?.returnToMainMenu();
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
      <div ref={canvasMountRef} className="h-full w-full" />
      <GameUI
        snapshot={snapshot}
        walletAddress={walletAddress}
        walletChainId={walletChainId}
        walletBusy={walletBusy}
        walletMessage={walletMessage}
        submission={submission}
        explorerUrl={HEMI_EXPLORER_URL}
        onConnectWallet={handleConnectWallet}
        onPlay={() => void startNewRun()}
        onResume={() => gameRef.current?.resumeGame()}
        onRestart={handleRestart}
        onMainMenu={handleMainMenu}
        onToggleFlashlight={() => gameRef.current?.triggerFlashlightToggle()}
        onTriggerInteract={() => gameRef.current?.triggerInteract()}
        onToggleHudCollapsed={() => gameRef.current?.toggleHudCollapsed()}
        onLockPointer={() => gameRef.current?.lockPointer()}
        onCloseNote={() => gameRef.current?.closeActiveNote()}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
      />
      <LeaderboardPanel
        open={leaderboardOpen}
        playerAddress={walletAddress}
        onClose={() => setLeaderboardOpen(false)}
      />
    </main>
  );
}
