import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

// Static imports of all API endpoints to bundle them into server.cjs cleanly
import sendPushHandler from './api/send-push.ts';
import updateStockSummaryHandler from './api/update-stock-summary.ts';
import ogHandler from './api/og.ts';
import checkoutHandler from './api/checkout.ts';
import reserveStockHandler from './api/reserve-stock.ts';
import finalizeOrderHandler from './api/finalize-order.ts';
import cleanupReservationsHandler from './api/cleanup-reservations.ts';
import updateOrderHandler from './api/update-order.ts';
import syncUserHandler from './api/sync-user.ts';
import sitemapHandler from './api/sitemap.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Debug middleware
  app.use((req, res, next) => {
    console.log(`[Express Incoming] ${req.method} ${req.url}`);
    next();
  });

  // Simulated Vercel API routes using static imports (bundled correctly)
  app.all('/api/send-push', async (req, res) => {
    try {
        await sendPushHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.all('/api/update-stock-summary', async (req, res) => {
    try {
        await updateStockSummaryHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.all('/api/og', async (req, res) => {
    try {
        await ogHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.all('/api/checkout', async (req, res) => {
    try {
        await checkoutHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.all('/api/reserve-stock', async (req, res) => {
    try {
        await reserveStockHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.all('/api/finalize-order', async (req, res) => {
    try {
        await finalizeOrderHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.all('/api/cleanup-reservations', async (req, res) => {
    try {
        await cleanupReservationsHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.all('/api/update-order', async (req, res) => {
    try {
        await updateOrderHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.all('/api/sync-user', async (req, res) => {
    try {
        await syncUserHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  // Sitemap route
  app.get('/sitemap.xml', async (req, res) => {
    try {
        await sitemapHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(`User-agent: *\nAllow: /\nSitemap: https://www.all-shop.net/sitemap.xml`);
  });

  // Replicate Vercel rewrites
  app.get(["/product/:id", "/p/:id"], async (req, res) => {
    req.query.id = req.params.id;
    try {
        await ogHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  app.get("/home", async (req, res) => {
    req.query.id = 'home';
    try {
        await ogHandler(req as any, res as any);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global Express Error:", err);
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
  });
}

startServer();
