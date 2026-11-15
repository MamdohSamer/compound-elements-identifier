import express from 'express';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { PURE_ELEMENTS } from './src/data/elements.ts';
import { pubchemService } from './server/pubchemService.ts';

export interface StartServerOptions {
  port?: number;
  host?: string;
  staticDir?: string;
  dataDir?: string;
  cacheDir?: string;
  embedded?: boolean;
}

export async function startServer(options: StartServerOptions = {}) {
  if (options.dataDir || options.cacheDir) {
    pubchemService.configure({
      dataDir: options.dataDir,
      cacheDir: options.cacheDir,
    });
  }

  const app = express();
  app.use(express.json());

  app.get('/api/stats', (_req, res) => {
    res.json(pubchemService.getStats());
  });

  app.get('/api/elements', (_req, res) => {
    res.json({ elements: PURE_ELEMENTS });
  });

  app.get('/api/autocomplete', async (req, res) => {
    const q = String(req.query.q || '');
    try {
      const results = await pubchemService.autocompleteAsync(q);
      res.json({ query: q, results });
    } catch {
      res.json({ query: q, results: [] });
    }
  });

  app.get('/api/isomers', async (req, res) => {
    const formula = String(req.query.formula || '');
    const offset = Number(req.query.offset || 0);
    const limit = Math.min(50, Number(req.query.limit || 24));
    if (!formula) {
      res.json({ candidates: [], total: 0 });
      return;
    }
    try {
      const result = await pubchemService.fetchMoreIsomers(formula, offset, limit);
      res.json(result);
    } catch {
      res.json({ candidates: [], total: 0 });
    }
  });

  app.get('/api/lookup', async (req, res) => {
    const q = String(req.query.q || '');
    try {
      const result = await pubchemService.lookup(q);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        query: q,
        normalizedFormula: null,
        matchedBy: 'formula',
        primary: null,
        candidates: [],
        error: err instanceof Error ? err.message : 'Lookup failed',
      });
    }
  });

  app.get('/api/cid/:cid', async (req, res) => {
    const cid = Number(req.params.cid);
    if (!Number.isFinite(cid) || cid <= 0) {
      res.status(400).json({ error: 'Invalid PubChem CID' });
      return;
    }
    try {
      const card = await pubchemService.lookupByCid(cid);
      if (!card) {
        res.status(404).json({ error: `Compound CID ${cid} not found` });
        return;
      }
      res.json({ card });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'CID lookup failed' });
    }
  });

  const serveStatic = options.embedded || process.env.NODE_ENV === 'production' || Boolean(options.staticDir);
  if (serveStatic) {
    const distDir = options.staticDir || path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = options.port ?? Number(process.env.PORT || 3000);
  const host = options.host ?? '0.0.0.0';

  return await new Promise<{ app: express.Express; port: number; close: () => void }>((resolve) => {
    const httpServer = app.listen(port, host, () => {
      const addr = httpServer.address() as AddressInfo | null;
      const actualPort = addr ? addr.port : port;
      console.log(`Server listening on http://${host}:${actualPort}`);
      setImmediate(() => {
        try {
          pubchemService.ensureLoaded();
        } catch (err) {
          console.error('Index warm-up warning:', err);
        }
      });
      resolve({
        app,
        port: actualPort,
        close: () => httpServer.close(),
      });
    });
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

if (process.env.MOLSPEC_ELECTRON_EMBEDDED !== '1') {
  startServer();
}
