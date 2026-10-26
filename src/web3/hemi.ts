export const HEMI_CHAIN_ID = 43111;
export const HEMI_CHAIN_HEX = `0x${HEMI_CHAIN_ID.toString(16)}`;
export const HEMI_RPC_URL = 'https://rpc.hemi.network/rpc';
export const HEMI_EXPLORER_URL = 'https://explorer.hemi.xyz';
export const SCORE_CONTRACT_ADDRESS = '0x34ED65B358114CD211605D071C90aDB456714Fc9';

export const SCORE_CONTRACT_ABI = [
  'function submitTime(uint256 timeMs, bytes signature)',
  'function getCurrentLeaderboard() view returns (tuple(address player, uint256 timeMs)[])',
  'function getMyBestTime(address player) view returns (uint256)',
  'function currentSeason() view returns (uint256)',
  'function nonces(address) view returns (uint256)',
  'function signer() view returns (address)',
];

export interface HemiEthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: HemiEthereumProvider;
  }
}
