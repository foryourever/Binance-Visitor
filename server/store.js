import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createStore(filename = 'data/monitor.sqlite') {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return new Store(db);
}

class Store {
  constructor(db) {
    this.db = db;
  }

  close() {
    this.db.close();
  }

  upsertLeader(leaderId) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO monitored_leaders (leader_id, status, created_at, updated_at)
      VALUES (?, 'active', ?, ?)
      ON CONFLICT(leader_id) DO UPDATE SET status = 'active', last_error = NULL, updated_at = excluded.updated_at
    `).run(leaderId, now, now);
    return this.getLeader(leaderId);
  }

  listLeaders() {
    return this.db.prepare(`
      SELECT leader_id AS leaderId, display_name AS displayName, source, status, last_error AS lastError,
        profile_json AS profileJson, metrics_json AS metricsJson, created_at AS createdAt, updated_at AS updatedAt
      FROM monitored_leaders ORDER BY updated_at DESC
    `).all().map(mapLeaderRow);
  }

  getLeader(leaderId) {
    const row = this.db.prepare(`
      SELECT leader_id AS leaderId, display_name AS displayName, source, status, last_error AS lastError,
        profile_json AS profileJson, metrics_json AS metricsJson, created_at AS createdAt, updated_at AS updatedAt
      FROM monitored_leaders WHERE leader_id = ?
    `).get(leaderId);
    return row ? mapLeaderRow(row) : null;
  }

  updateLeaderSnapshot(leaderId, snapshot) {
    this.db.prepare(`
      UPDATE monitored_leaders
      SET display_name = ?, source = ?, profile_json = ?, metrics_json = ?,
        status = 'active', last_error = NULL, updated_at = ?
      WHERE leader_id = ?
    `).run(
      snapshot.profile?.displayName ?? snapshot.profile?.handle ?? leaderId,
      snapshot.profile?.source ?? snapshot.source ?? 'unknown',
      JSON.stringify(snapshot.profile ?? {}),
      JSON.stringify(snapshot.metrics ?? {}),
      Date.now(),
      leaderId
    );
    return this.getLeader(leaderId);
  }

  removeLeader(leaderId) {
    this.db.prepare('DELETE FROM monitored_leaders WHERE leader_id = ?').run(leaderId);
  }

  markLeaderError(leaderId, error) {
    this.db.prepare(`
      UPDATE monitored_leaders SET status = 'error', last_error = ?, updated_at = ? WHERE leader_id = ?
    `).run(String(error?.message ?? error), Date.now(), leaderId);
  }

  insertLeaderTrade(trade) {
    const now = Date.now();
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO leader_trades
        (leader_id, symbol, side, event_time, price, qty, action, raw_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      trade.leaderId,
      trade.symbol,
      trade.side,
      Number(trade.eventTime),
      Number(trade.price),
      Number(trade.qty),
      trade.action ?? 'UPDATE',
      JSON.stringify(trade.raw ?? trade),
      now
    );
    return {
      inserted: result.changes > 0,
      trade: this.db.prepare(`
        SELECT id, leader_id AS leaderId, symbol, side, event_time AS eventTime, price, qty, action, created_at AS createdAt
        FROM leader_trades
        WHERE leader_id = ? AND symbol = ? AND side = ? AND event_time = ? AND price = ? AND qty = ?
      `).get(trade.leaderId, trade.symbol, trade.side, Number(trade.eventTime), Number(trade.price), Number(trade.qty))
    };
  }

  listLeaderTrades(limit = 100) {
    return this.db.prepare(`
      SELECT id, leader_id AS leaderId, symbol, side, event_time AS eventTime, price, qty, action, created_at AS createdAt
      FROM leader_trades ORDER BY event_time DESC, id DESC LIMIT ?
    `).all(limit);
  }

  upsertSymbol(symbol) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO monitored_symbols (symbol, status, created_at, updated_at)
      VALUES (?, 'active', ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET status = 'active', last_error = NULL, updated_at = excluded.updated_at
    `).run(symbol, now, now);
    return this.getSymbol(symbol);
  }

  listSymbols() {
    return this.db.prepare(`
      SELECT symbol, status, last_price AS lastPrice, price_change_percent AS priceChangePercent,
        last_error AS lastError, updated_at AS updatedAt
      FROM monitored_symbols ORDER BY updated_at DESC
    `).all();
  }

  getSymbol(symbol) {
    return this.db.prepare(`
      SELECT symbol, status, last_price AS lastPrice, price_change_percent AS priceChangePercent,
        last_error AS lastError, updated_at AS updatedAt
      FROM monitored_symbols WHERE symbol = ?
    `).get(symbol);
  }

  removeSymbol(symbol) {
    this.db.prepare('DELETE FROM monitored_symbols WHERE symbol = ?').run(symbol);
  }

  markSymbolError(symbol, error) {
    this.db.prepare(`
      UPDATE monitored_symbols SET status = 'error', last_error = ?, updated_at = ? WHERE symbol = ?
    `).run(String(error?.message ?? error), Date.now(), symbol);
  }

  upsertTicker(tick) {
    this.db.prepare(`
      INSERT INTO market_ticks (symbol, event_time, last_price, price_change_percent, volume, quote_volume)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tick.symbol, tick.eventTime, tick.lastPrice, tick.priceChangePercent, tick.volume, tick.quoteVolume);
    this.db.prepare(`
      UPDATE monitored_symbols SET last_price = ?, price_change_percent = ?, status = 'active', updated_at = ?
      WHERE symbol = ?
    `).run(tick.lastPrice, tick.priceChangePercent, Date.now(), tick.symbol);
  }

  upsertKline(kline) {
    this.db.prepare(`
      INSERT OR REPLACE INTO market_klines
        (symbol, interval, open_time, close_time, open, high, low, close, volume, is_closed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(kline.symbol, kline.interval, kline.openTime, kline.closeTime, kline.open, kline.high, kline.low, kline.close, kline.volume, kline.isClosed ? 1 : 0);
  }

  listKlines(symbol, interval = '1m', limit = 120) {
    return this.db.prepare(`
      SELECT symbol, interval, open_time AS openTime, close_time AS closeTime,
        open, high, low, close, volume, is_closed AS isClosed
      FROM (
        SELECT symbol, interval, open_time, close_time, open, high, low, close, volume, is_closed
        FROM market_klines
        WHERE symbol = ? AND interval = ?
        ORDER BY open_time DESC
        LIMIT ?
      )
      ORDER BY open_time ASC
    `).all(symbol, interval, limit).map((row) => ({
      ...row,
      isClosed: Boolean(row.isClosed)
    }));
  }

  getCopySettings(leaderId) {
    const row = this.db.prepare('SELECT settings_json AS settingsJson FROM copy_settings WHERE leader_id = ?').get(leaderId);
    return row ? JSON.parse(row.settingsJson) : null;
  }

  saveCopySettings(leaderId, settings) {
    this.db.prepare(`
      INSERT INTO copy_settings (leader_id, settings_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(leader_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at
    `).run(leaderId, JSON.stringify(settings), Date.now());
    return settings;
  }

  addSystemEvent(level, message, details = {}) {
    this.db.prepare(`
      INSERT INTO system_events (level, message, details_json, created_at) VALUES (?, ?, ?, ?)
    `).run(level, message, JSON.stringify(details), Date.now());
  }

  listSystemEvents(limit = 50) {
    return this.db.prepare(`
      SELECT id, level, message, details_json AS detailsJson, created_at AS createdAt
      FROM system_events ORDER BY id DESC LIMIT ?
    `).all(limit).map((row) => ({ ...row, details: JSON.parse(row.detailsJson ?? '{}') }));
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitored_leaders (
      leader_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leader_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leader_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      event_time INTEGER NOT NULL,
      price REAL NOT NULL,
      qty REAL NOT NULL,
      action TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (leader_id, symbol, side, event_time, price, qty)
    );

    CREATE TABLE IF NOT EXISTS monitored_symbols (
      symbol TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_price REAL,
      price_change_percent REAL,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      event_time INTEGER NOT NULL,
      last_price REAL NOT NULL,
      price_change_percent REAL NOT NULL,
      volume REAL NOT NULL,
      quote_volume REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_klines (
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      open_time INTEGER NOT NULL,
      close_time INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      is_closed INTEGER NOT NULL,
      PRIMARY KEY (symbol, interval, open_time)
    );

    CREATE TABLE IF NOT EXISTS copy_settings (
      leader_id TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  addColumnIfMissing(db, 'monitored_leaders', 'display_name', 'TEXT');
  addColumnIfMissing(db, 'monitored_leaders', 'source', 'TEXT');
  addColumnIfMissing(db, 'monitored_leaders', 'profile_json', 'TEXT');
  addColumnIfMissing(db, 'monitored_leaders', 'metrics_json', 'TEXT');
}

function addColumnIfMissing(db, table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function mapLeaderRow(row) {
  return {
    ...row,
    profile: parseJson(row.profileJson, {}),
    metrics: parseJson(row.metricsJson, {})
  };
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
