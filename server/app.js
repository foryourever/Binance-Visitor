import express from 'express';
import { validateCopySettings, executeCopyTrade } from './services/copyService.js';

export function createApp({ store, binanceClient, marketMonitor, leaderMonitor }) {
  const app = express();
  app.use(express.json());
  app.use(express.static('dist'));

  app.get('/api/status', (req, res) => {
    res.json({
      ok: true,
      ...marketMonitor.getStatus(),
      ...leaderMonitor.getStatus(),
      leaders: store.listLeaders().length,
      symbols: store.listSymbols().length,
      events: store.listSystemEvents(10)
    });
  });

  app.get('/api/leaders', (req, res) => {
    res.json({ leaders: store.listLeaders() });
  });

  app.post('/api/leaders', async (req, res, next) => {
    try {
      const leaderId = String(req.body.leaderId ?? '').trim();
      if (!/^[A-Za-z0-9_-]{3,128}$/.test(leaderId)) {
        throw new Error('带单员 ID 格式不正确');
      }
      const leader = store.upsertLeader(leaderId);
      await leaderMonitor.poll();
      res.status(201).json({ leader });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/leaders/:leaderId', (req, res) => {
    store.removeLeader(req.params.leaderId);
    res.status(204).end();
  });

  app.get('/api/trades', (req, res) => {
    res.json({ trades: store.listLeaderTrades(Number(req.query.limit ?? 100)) });
  });

  app.get('/api/symbols', (req, res) => {
    res.json({ symbols: store.listSymbols() });
  });

  app.get('/api/symbols/:symbol/klines', (req, res) => {
    res.json({
      symbol: req.params.symbol.toUpperCase(),
      interval: req.query.interval || '1m',
      klines: store.listKlines(
        req.params.symbol.toUpperCase(),
        req.query.interval || '1m',
        Number(req.query.limit ?? 120)
      )
    });
  });

  app.post('/api/symbols', async (req, res, next) => {
    try {
      const symbol = await binanceClient.resolveTradingSymbol(req.body.symbol);
      const item = store.upsertSymbol(symbol);
      marketMonitor.addSymbol(symbol);
      res.status(201).json({ symbol: item });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/symbols/:symbol', (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    store.removeSymbol(symbol);
    marketMonitor.removeSymbol(symbol);
    res.status(204).end();
  });

  app.get('/api/leaders/:leaderId/copy-settings', (req, res) => {
    res.json({ settings: store.getCopySettings(req.params.leaderId) });
  });

  app.put('/api/leaders/:leaderId/copy-settings', (req, res, next) => {
    try {
      const settings = validateCopySettings(req.body);
      res.json({ settings: store.saveCopySettings(req.params.leaderId, settings) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/copy/execute', async (req, res, next) => {
    try {
      await executeCopyTrade(req.body);
      res.status(202).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    res.status(error.status || 400).json({ error: error.message || '请求失败' });
  });

  return app;
}
