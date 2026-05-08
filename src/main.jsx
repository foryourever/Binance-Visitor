import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  Bell,
  CandlestickChart,
  Plus,
  RadioTower,
  ShieldCheck,
  Trash2,
  UserRound
} from 'lucide-react';
import './styles.css';

const api = {
  async get(path) {
    const response = await fetch(path);
    return readJson(response);
  },
  async post(path, body) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    return readJson(response);
  },
  async del(path) {
    const response = await fetch(path, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || '请求失败');
    }
  }
};

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || '请求失败');
  }
  return body;
}

function App() {
  const [leaders, setLeaders] = useState([]);
  const [symbols, setSymbols] = useState([]);
  const [klinesBySymbol, setKlinesBySymbol] = useState({});
  const [trades, setTrades] = useState([]);
  const [status, setStatus] = useState({});
  const [events, setEvents] = useState([]);
  const [leaderInput, setLeaderInput] = useState('');
  const [symbolInput, setSymbolInput] = useState('');
  const [notice, setNotice] = useState('');
  const [wsState, setWsState] = useState('connecting');

  useEffect(() => {
    refreshAll().catch(showError);
  }, []);

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.onopen = () => setWsState('connected');
    socket.onclose = () => setWsState('disconnected');
    socket.onerror = () => setWsState('error');
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data);
      if (event.type === 'snapshot') {
        setLeaders(event.payload.leaders || []);
        setSymbols(event.payload.symbols || []);
        setKlinesBySymbol(event.payload.klines || {});
        setTrades(event.payload.trades || []);
        setStatus(event.payload.status || {});
      }
      if (event.type === 'leader.trade.updated') {
        setTrades((current) => [event.payload, ...current].slice(0, 100));
      }
      if (event.type === 'leader.profile.updated') {
        setLeaders((current) => current.map((leader) => (
          leader.leaderId === event.payload.leaderId ? event.payload : leader
        )));
      }
      if (event.type === 'market.ticker.updated') {
        setSymbols((current) => mergeSymbolTick(current, event.payload));
      }
      if (event.type === 'market.kline.updated') {
        setKlinesBySymbol((current) => mergeKline(current, event.payload));
      }
      if (event.type === 'system.status.updated') {
        setStatus((current) => ({ ...current, ...event.payload }));
      }
    };
    return () => socket.close();
  }, []);

  async function refreshAll() {
    const [leaderData, symbolData, tradeData, statusData] = await Promise.all([
      api.get('/api/leaders'),
      api.get('/api/symbols'),
      api.get('/api/trades'),
      api.get('/api/status')
    ]);
    setLeaders(leaderData.leaders);
    setSymbols(symbolData.symbols);
    setTrades(tradeData.trades);
    setStatus(statusData);
    setEvents(statusData.events || []);
  }

  async function addLeader(event) {
    event.preventDefault();
    await runAction(async () => {
      await api.post('/api/leaders', { leaderId: leaderInput });
      setLeaderInput('');
      await refreshAll();
    });
  }

  async function addSymbol(event) {
    event.preventDefault();
    await runAction(async () => {
      await api.post('/api/symbols', { symbol: symbolInput });
      setSymbolInput('');
      await refreshAll();
      await refreshKlines();
    });
  }

  async function removeLeader(leaderId) {
    await runAction(async () => {
      await api.del(`/api/leaders/${encodeURIComponent(leaderId)}`);
      await refreshAll();
    });
  }

  async function removeSymbol(symbol) {
    await runAction(async () => {
      await api.del(`/api/symbols/${encodeURIComponent(symbol)}`);
      await refreshAll();
    });
  }

  async function runAction(action) {
    try {
      setNotice('');
      await action();
    } catch (error) {
      showError(error);
    }
  }

  function showError(error) {
    setNotice(error.message || '操作失败');
  }

  async function refreshKlines() {
    const latest = await api.get('/api/symbols');
    const entries = await Promise.all(latest.symbols.map(async (item) => {
      const data = await api.get(`/api/symbols/${encodeURIComponent(item.symbol)}/klines?limit=120`);
      return [item.symbol, data.klines];
    }));
    setKlinesBySymbol(Object.fromEntries(entries));
  }

  const longCount = useMemo(() => trades.filter((trade) => trade.side === 'LONG').length, [trades]);
  const shortCount = trades.length - longCount;

  return (
    <main className="terminal-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Binance USD-M Futures</p>
          <h1>带单员与合约行情监控</h1>
        </div>
        <div className="status-strip">
          <StatusPill label="客户端" value={wsState} />
          <StatusPill label="行情流" value={status.marketStream || 'idle'} />
          <StatusPill label="采集器" value={status.leaderPoller || 'idle'} />
        </div>
      </header>

      {notice && (
        <div className="notice">
          <AlertTriangle size={18} />
          <span>{notice}</span>
        </div>
      )}

      <section className="dashboard-grid">
        <aside className="panel leader-panel">
          <PanelTitle icon={<UserRound size={18} />} title="带单员" count={leaders.length} />
          <form className="inline-form" onSubmit={addLeader}>
            <input value={leaderInput} onChange={(event) => setLeaderInput(event.target.value)} placeholder="leader encryptedUid" />
            <button aria-label="添加带单员"><Plus size={18} /></button>
          </form>
          <div className="list-stack">
            {leaders.map((leader) => (
              <div className="row-card" key={leader.leaderId}>
                <div>
                  <strong>{leader.displayName || leader.leaderId}</strong>
                  <p>{leader.leaderId}</p>
                  <LeaderMetrics leader={leader} />
                  <p>{leader.status}{leader.lastError ? ` · ${leader.lastError}` : ''}</p>
                </div>
                <button className="icon-button" onClick={() => removeLeader(leader.leaderId)} aria-label="删除带单员">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {leaders.length === 0 && <EmptyState text="暂无带单员监控" />}
          </div>

          <div className="copy-guard">
            <ShieldCheck size={18} />
            <div>
              <strong>跟单预留</strong>
              <p>第一版仅保存配置草案，真实下单入口已禁用。</p>
            </div>
          </div>
        </aside>

        <section className="panel trade-panel">
          <PanelTitle icon={<Activity size={18} />} title="实时交易记录" count={trades.length} />
          <div className="metrics">
            <Metric label="LONG" value={longCount} tone="up" />
            <Metric label="SHORT" value={shortCount} tone="down" />
            <Metric label="监控事件" value={events.length} />
          </div>
          <div className="trade-stream">
            {trades.map((trade) => (
              <article className="trade-row" key={trade.id || `${trade.leaderId}-${trade.eventTime}-${trade.symbol}`}>
                <div className={`side-dot ${trade.side === 'LONG' ? 'long' : 'short'}`} />
                <div>
                  <strong>{trade.symbol}</strong>
                  <p>{trade.leaderId} · {trade.action}</p>
                </div>
                <div className="trade-values">
                  <span>{formatNumber(trade.qty)}</span>
                  <strong>{formatNumber(trade.price)}</strong>
                </div>
              </article>
            ))}
            {trades.length === 0 && <EmptyState text="等待带单员记录" />}
          </div>
        </section>

        <aside className="panel market-panel">
          <PanelTitle icon={<CandlestickChart size={18} />} title="行情" count={symbols.length} />
          <form className="inline-form" onSubmit={addSymbol}>
            <input value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} placeholder="BTC / BTCUSDT" />
            <button aria-label="添加币种"><Plus size={18} /></button>
          </form>
          <div className="list-stack">
            {symbols.map((item) => (
              <div className="market-card" key={item.symbol}>
                <div className="market-main">
                  <strong>{item.symbol}</strong>
                  <span className={Number(item.priceChangePercent) >= 0 ? 'up' : 'down'}>
                    {formatPercent(item.priceChangePercent)}
                  </span>
                </div>
                <div className="market-sub">
                  <span>{item.lastPrice ? formatNumber(item.lastPrice) : item.status}</span>
                  <button className="icon-button" onClick={() => removeSymbol(item.symbol)} aria-label="删除币种">
                    <Trash2 size={16} />
                  </button>
                </div>
                <PriceCurve klines={klinesBySymbol[item.symbol] || []} />
              </div>
            ))}
            {symbols.length === 0 && <EmptyState text="暂无行情监控" />}
          </div>

          <div className="event-feed">
            <div className="event-title">
              <Bell size={16} />
              <strong>系统事件</strong>
            </div>
            {events.slice(0, 4).map((event) => (
              <p key={event.id}>{event.message}</p>
            ))}
            {events.length === 0 && <p>暂无异常事件</p>}
          </div>
        </aside>
      </section>
    </main>
  );
}

function PriceCurve({ klines }) {
  const points = klines
    .map((item) => Number(item.close))
    .filter((value) => Number.isFinite(value));

  if (points.length < 2) {
    return (
      <div className="curve-empty">
        等待实时 K 线
      </div>
    );
  }

  const width = 260;
  const height = 68;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const d = points.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * (height - 10) - 5;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const tone = last >= first ? 'up' : 'down';

  return (
    <div className="curve-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="实时价格曲线">
        <path className={`curve-line ${tone}`} d={d} />
      </svg>
      <div className="curve-meta">
        <span>1m 曲线</span>
        <strong className={tone}>{formatPercent(((last - first) / first) * 100)}</strong>
      </div>
    </div>
  );
}

function PanelTitle({ icon, title, count }) {
  return (
    <div className="panel-title">
      <span>{icon}</span>
      <strong>{title}</strong>
      <em>{count}</em>
    </div>
  );
}

function StatusPill({ label, value }) {
  return (
    <div className="status-pill">
      <RadioTower size={14} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value, tone = '' }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function LeaderMetrics({ leader }) {
  const metrics = leader.metrics || {};
  const profile = leader.profile || {};
  if (!leader.displayName && Object.keys(metrics).length === 0) {
    return null;
  }
  return (
    <div className="leader-metrics">
      <span>ROI {formatPercent(metrics.roi90d)}</span>
      <span>胜率 {formatPercent(metrics.winRate)}</span>
      <span>回撤 {formatPercent(metrics.maxDrawdown)}</span>
      <span>跟单 {profile.copiers ?? '--'}</span>
    </div>
  );
}

function mergeSymbolTick(symbols, tick) {
  const found = symbols.some((item) => item.symbol === tick.symbol);
  const next = symbols.map((item) => item.symbol === tick.symbol
    ? { ...item, lastPrice: tick.lastPrice, priceChangePercent: tick.priceChangePercent, status: 'active' }
    : item);
  return found ? next : [{ symbol: tick.symbol, lastPrice: tick.lastPrice, priceChangePercent: tick.priceChangePercent, status: 'active' }, ...symbols];
}

function mergeKline(current, kline) {
  const list = current[kline.symbol] || [];
  const next = [...list.filter((item) => item.openTime !== kline.openTime), kline]
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-120);
  return { ...current, [kline.symbol]: next };
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

createRoot(document.getElementById('root')).render(<App />);
