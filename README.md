# Don't Look Back

A first-person 3D psychological horror game. Collect five broken pendant pieces
to escape the abandoned house while evading The Watcher, an entity that moves
only when out of sight.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `SIGNER_PRIVATE_KEY` to the private key
   configured as the score contract's authorized signer. Keep this key on the
   server; never use a `VITE_` variable for it.
3. Run the application and API with `npm run dev`.

For production, build the client with `npm run build`, then run `npm start`.
The server serves both the built app and score API on port `3000` by default;
set `PORT` to change it.

## Hemi scores

The game connects to Hemi Mainnet (Chain ID `43111`) and submits scores to
`0x34ED65B358114CD211605D071C90aDB456714Fc9`. Score signing requires a funded
wallet in the browser for gas and the server-side signer key for score
verification. The server records run start times, tracks the five ordered
pendant insertions, and signs a result only once per completed run.

Run sessions and rate limits are stored in memory. Use a single server process;
deployments with multiple instances need shared session and rate-limit storage
before scaling horizontally. Client-reported game progress is validated for
order and timing, but a fully authoritative anti-cheat system would require
server-authoritative gameplay.
