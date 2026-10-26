import { useCallback, useEffect, useState } from 'react';
import { Contract, JsonRpcProvider } from 'ethers';
import {
  HEMI_CHAIN_ID,
  HEMI_RPC_URL,
  SCORE_CONTRACT_ABI,
  SCORE_CONTRACT_ADDRESS,
} from '../web3/hemi';

interface LeaderboardEntry {
  player: string;
  timeMs: number;
}

interface LeaderboardPanelProps {
  open: boolean;
  playerAddress: string | null;
  onClose: () => void;
}

const provider = new JsonRpcProvider(HEMI_RPC_URL, {
  name: 'hemi',
  chainId: HEMI_CHAIN_ID,
});
const contract = new Contract(SCORE_CONTRACT_ADDRESS, SCORE_CONTRACT_ABI, provider);

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatRunTime(timeMs: number): string {
  const minutes = Math.floor(timeMs / 60_000);
  const seconds = Math.floor((timeMs % 60_000) / 1000);
  const milliseconds = timeMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

export function LeaderboardPanel({
  open,
  playerAddress,
  onClose,
}: LeaderboardPanelProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [currentEntries, best] = await Promise.all([
        contract.getCurrentLeaderboard() as Promise<
          Array<{ player: string; timeMs: bigint }>
        >,
        playerAddress
          ? (contract.getMyBestTime(playerAddress) as Promise<bigint>)
          : Promise.resolve(null),
      ]);
      setEntries(
        currentEntries.map((entry) => ({
          player: entry.player,
          timeMs: Number(entry.timeMs),
        }))
      );
      setPersonalBest(best === null || best === 0n ? null : Number(best));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load the leaderboard.'
      );
    } finally {
      setLoading(false);
    }
  }, [playerAddress]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <section
        aria-labelledby="leaderboard-title"
        aria-modal="true"
        className="w-full max-w-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl sm:p-7"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-tabular text-[10px] tracking-[0.3em] text-amber-500">
              HEMI MAINNET · SEASON SCORES
            </p>
            <h2
              className="mt-2 font-display text-2xl font-bold tracking-widest text-zinc-100"
              id="leaderboard-title"
            >
              LEADERBOARD
            </h2>
          </div>
          <button
            className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            onClick={onClose}
            type="button"
          >
            CLOSE
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-zinc-800 py-3">
          <p className="font-mono-tabular text-xs text-zinc-300">
            YOUR BEST:{' '}
            <span className="font-semibold text-amber-300">
              {personalBest === null ? '--:--.---' : formatRunTime(personalBest)}
            </span>
          </p>
          <button
            className="border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono-tabular text-[10px] tracking-wider text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            disabled={loading}
            onClick={() => void refresh()}
            type="button"
          >
            {loading ? 'LOADING...' : 'REFRESH'}
          </button>
        </div>

        {error && (
          <p className="mt-4 border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </p>
        )}

        <div className="mt-4 max-h-[50vh] overflow-y-auto">
          <table className="w-full border-collapse text-left font-mono-tabular text-xs">
            <thead className="sticky top-0 bg-zinc-950 text-[10px] tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2">RANK</th>
                <th className="px-3 py-2">PLAYER</th>
                <th className="px-3 py-2 text-right">TIME</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const isPlayer =
                  playerAddress?.toLowerCase() === entry.player.toLowerCase();
                return (
                  <tr
                    className={`border-t border-zinc-800 ${
                      isPlayer ? 'bg-amber-950/40 text-amber-200' : 'text-zinc-300'
                    }`}
                    key={entry.player}
                  >
                    <td className="px-3 py-3">#{index + 1}</td>
                    <td className="px-3 py-3">{shortAddress(entry.player)}</td>
                    <td className="px-3 py-3 text-right">
                      {formatRunTime(entry.timeMs)}
                    </td>
                  </tr>
                );
              })}
              {!loading && entries.length === 0 && !error && (
                <tr>
                  <td className="px-3 py-8 text-center text-zinc-500" colSpan={3}>
                    No scores have been submitted this season.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
