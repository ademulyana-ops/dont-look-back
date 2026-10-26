import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  getAddress,
  getBytes,
  isAddress,
  solidityPackedKeccak256,
} from 'ethers';
import { createServer as createViteServer } from 'vite';
import {
  HEMI_CHAIN_ID,
  HEMI_RPC_URL,
  SCORE_CONTRACT_ABI,
  SCORE_CONTRACT_ADDRESS,
} from './src/web3/hemi';

const PORT = Number(process.env.PORT ?? 3000);
const MIN_RUN_TIME_MS = 60_000;
const MAX_RUN_TIME_MS = 4 * 60 * 60 * 1000;
const MIN_KEY_INTERVAL_MS = 2_000;
const SESSION_TTL_MS = MAX_RUN_TIME_MS + 60 * 60 * 1000;
const MAX_SEASON_KEYS = 5;

interface RunSession {
  address: string;
  startedAt: number;
  lastProgressAt: number;
  insertedCount: number;
  used: boolean;
  finishing: boolean;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const sessions = new Map<string, RunSession>();
const rateLimitBuckets = new Map<string, RateLimitBucket>();
const provider = new JsonRpcProvider(HEMI_RPC_URL, HEMI_CHAIN_ID);
const app = express();

app.use(express.json({ limit: '10kb' }));

function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${req.ip ?? 'unknown'}:${req.path}`;
    const bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count++;
    if (bucket.count > limit) {
      res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
      return;
    }
    next();
  };
}

function getSession(req: Request, res: Response): RunSession | undefined {
  const sessionId = req.body?.sessionId;
  if (typeof sessionId !== 'string') {
    res.status(400).json({ error: 'A valid sessionId is required.' });
    return undefined;
  }
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Run session was not found or has expired.' });
    return undefined;
  }
  if (session.used || session.finishing) {
    res.status(409).json({ error: 'This run session has already been submitted.' });
    return undefined;
  }
  return session;
}

app.post('/api/start', rateLimit(10, 10 * 60 * 1000), (req, res) => {
  const inputAddress = req.body?.address;
  if (typeof inputAddress !== 'string' || !isAddress(inputAddress)) {
    res.status(400).json({ error: 'A valid wallet address is required.' });
    return;
  }

  const sessionId = randomUUID();
  sessions.set(sessionId, {
    address: getAddress(inputAddress),
    startedAt: Date.now(),
    lastProgressAt: 0,
    insertedCount: 0,
    used: false,
    finishing: false,
  });
  res.json({ sessionId });
});

app.post('/api/progress', rateLimit(60, 10 * 60 * 1000), (req, res) => {
  const session = getSession(req, res);
  if (!session) return;

  const insertedCount = req.body?.insertedCount;
  if (
    !Number.isInteger(insertedCount) ||
    insertedCount !== session.insertedCount + 1 ||
    insertedCount > MAX_SEASON_KEYS
  ) {
    res.status(400).json({ error: 'Pendant progress must be reported in order.' });
    return;
  }

  const now = Date.now();
  if (
    insertedCount > 1 &&
    now - session.lastProgressAt < MIN_KEY_INTERVAL_MS
  ) {
    res.status(400).json({ error: 'Pendant progress was reported too quickly.' });
    return;
  }

  session.insertedCount = insertedCount;
  session.lastProgressAt = now;
  res.json({ insertedCount });
});

app.post('/api/finish', rateLimit(10, 10 * 60 * 1000), async (req, res) => {
  const session = getSession(req, res);
  if (!session) return;

  const submittedCount = req.body?.insertedCount;
  if (submittedCount !== MAX_SEASON_KEYS || session.insertedCount !== MAX_SEASON_KEYS) {
    res.status(400).json({ error: 'All five pendant pieces must be verified before finishing.' });
    return;
  }

  const timeMs = Date.now() - session.startedAt;
  if (timeMs < MIN_RUN_TIME_MS || timeMs > MAX_RUN_TIME_MS) {
    res.status(400).json({ error: 'Run duration is outside the accepted range.' });
    return;
  }

  const privateKey = process.env.SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    res.status(503).json({ error: 'Score signing is not configured on the server.' });
    return;
  }

  session.finishing = true;
  try {
    const signerWallet = new Wallet(privateKey);
    const contract = new Contract(SCORE_CONTRACT_ADDRESS, SCORE_CONTRACT_ABI, provider);
    const [season, nonce, contractSigner] = await Promise.all([
      contract.currentSeason() as Promise<bigint>,
      contract.nonces(session.address) as Promise<bigint>,
      contract.signer() as Promise<string>,
    ]);

    if (getAddress(contractSigner) !== getAddress(signerWallet.address)) {
      throw new Error('Configured signing wallet does not match the contract signer.');
    }

    const hash = solidityPackedKeccak256(
      ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'address'],
      [
        session.address,
        timeMs,
        season,
        nonce,
        HEMI_CHAIN_ID,
        SCORE_CONTRACT_ADDRESS,
      ]
    );
    const signature = await signerWallet.signMessage(getBytes(hash));
    session.used = true;
    session.finishing = false;
    res.json({ timeMs, signature });
  } catch (error) {
    session.finishing = false;
    console.error('Unable to sign run result:', error);
    res.status(503).json({ error: 'Unable to verify the run on-chain right now.' });
  }
});

const cleanupTimer = setInterval(() => {
  const expiredBefore = Date.now() - SESSION_TTL_MS;
  for (const [sessionId, session] of sessions) {
    if (session.startedAt < expiredBefore) sessions.delete(sessionId);
  }
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 15 * 60 * 1000);
cleanupTimer.unref();

async function startServer(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    const distPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Don't Look Back server listening on http://localhost:${PORT}`);
    if (!process.env.SIGNER_PRIVATE_KEY) {
      console.warn('SIGNER_PRIVATE_KEY is missing; score signing is disabled.');
    }
  });
}

void startServer();
