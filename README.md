# Binance 带单员与合约行情监控

本项目是本地个人使用的 Web 监控台，第一版聚焦监控，不执行真实跟单下单。

## 功能

- 输入 Binance 带单员榜单 ID，添加带单员监控。
- 输入币种名称或合约交易对，例如 `BTC` 或 `BTCUSDT`，添加 Binance U 本位合约行情监控。
- 后端通过 REST API 提供监控列表、交易记录、行情状态和系统事件。
- 后端通过 `/ws` 向前端推送实时带单员记录、行情 tick、K 线和系统状态。
- 跟单模块只保存配置草案，`/api/copy/execute` 会明确返回未实现状态，不会真实下单。

## 启动

```bash
npm install
npm run build
npm start
```

默认访问地址：

```text
http://localhost:5174
```

开发前端时可以另开终端运行：

```bash
npm run dev:client
```

前端开发服务器默认访问：

```text
http://localhost:5173
```

## 配置

可选 `.env`：

```env
PORT=5174
SQLITE_PATH=data/monitor.sqlite
LEADER_POLL_INTERVAL_MS=30000
BINANCE_LEADER_POSITION_ENDPOINT=https://www.binance.com/bapi/futures/v1/public/future/leaderboard/getOtherPosition
BINANCE_LANGUAGE=zh-CN
BINANCE_WEB_PRODUCT_ENDPOINT=https://www.binance.com/bapi/asset/v2/public/asset-service/product/get-products?includeEtf=true
BINANCE_WEB_FALLBACK_POLL_MS=5000
```

## 注意

Binance 合约行情优先使用官方 USDⓈ-M Futures WebSocket。若 `fstream.binance.com` 因网络或 DNS 问题不可达，系统会使用 Binance 中文网页端 `bapi` 产品接口作为价格兜底，显示实时价格并生成简化曲线点。带单员榜单数据不是稳定官方交易 API，已封装在 `LeaderSourceAdapter` 边界内，后续可以替换成授权 API、Webhook 或更稳定的数据源。
