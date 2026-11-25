# Trading Review Frontend

交易策略复盘前端。读取 frontend-data v2 静态文件（K 线、实盘仓位、信号、回测），
提供策略概览、区间统计、每日回放、策略发现与 K 线技术指标复盘。

无后端、无数据库、无前端索引生成：数据文件按 [docs/DATA-SPEC.md](docs/DATA-SPEC.md)
组织，通过配置化 URL 读取。

## 技术栈

- **Vue 3** `<script setup>` + **TypeScript**
- **Vite** 构建
- **Pinia** 状态管理
- **Element Plus** UI 组件
- **Plotly.js** 蜡烛图 / **ECharts** ROI 与价格趋势图
- **Vitest** 单元测试

## 架构

```text
frontend-data/                       # 数据根（可配置为绝对 URL）
├── catalog.csv
├── discovery/runs.csv               # 策略发现（可选全局索引）
└── {YYYYMMDD}/
    ├── manifest.csv
    ├── backtest_runs.csv
    └── {strategy}/
        ├── meta.json
        ├── live_positions.csv / live_signals.csv
        ├── backtest_positions.csv / backtest_signals.csv
        ├── signal_comparison.csv
        └── backtest_results/{runStamp}/{SYMBOL}.json

kline-data/
└── {period}/{SYMBOL}_{period}.csv
```

前端只做：配置化 HTTP 读取 → 解析 → 展示层聚合并发 → 渲染。
不扫描目录、不生成索引、不监听文件变化。

## 配置

根目录 `datasource.config.json`：

```json
{
  "data": {
    "frontendBaseUrl": "/frontend-data",
    "klineBaseUrl": "/kline-data"
  },
  "kline": {
    "basePeriod": "1m",
    "preferAggregate": true,
    "defaultTimeframe": "5m",
    "maxWarmupDays": 120,
    "cacheEntries": 8
  },
  "paths": {
    "catalog": "catalog.csv",
    "dayManifest": "{day}/manifest.csv",
    "dayRuns": "{day}/backtest_runs.csv",
    "strategyDir": "{day}/{strategy}",
    "backtestResultsDir": "{day}/{strategy}/backtest_results/{runStamp}",
    "discoveryRuns": "discovery/runs.csv",
    "discoveryResultsDir": "discovery/{strategy}/backtest_results/{runStamp}",
    "overrides": {}
  }
}
```

环境变量 `VITE_DATA_FRONTEND_BASE_URL` / `VITE_DATA_KLINE_BASE_URL` 优先于 JSON。

## 快速开始

```bash
npm install
npm run sample-data   # 生成虚拟 v2 数据（大宗商品代码）并链接 public/
npm run dev
```

真实数据：把 `frontend-data` / `kline-data` 放到 `public/` 或配置为绝对 URL。
数据可放在独立静态服务器；跨域时需 CORS，K 线需支持 Range。

本地 K 线文件较大时，Vite 的 Range 支持不完整，可额外启动只读数据服务：

```bash
DATA_ROOT=/path/to/data npm run dev:data   # 终端 1
npm run dev                                 # 终端 2
```

<!-- AUTO-GENERATED:scripts -->
| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run dev:data` | 只读静态数据服务（Range/CORS） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run sample-data` | 生成虚拟示例数据 |
| `npm test` | Vitest watch 模式 |
| `npm run test:run` | Vitest 单次运行 |
| `npm run test:coverage` | 覆盖率报告 |
| `npm run type-check` | 类型检查 |
<!-- /AUTO-GENERATED:scripts -->

## 页面

| 页面 | 数据 |
|---|---|
| 每日收益 | `manifest.csv` + `live_positions.csv`；点击标的进入 K 线页 |
| 区间统计 | `catalog.csv` + 区间内 `live_positions.csv`；PNL 用 `realized_pnl` |
| 每日回放 | `backtest_runs.csv`（`source=replay`） |
| 策略发现 | `backtest_runs.csv`（`source=discovery`） |
| 回测详情 | `backtest_results/*.json`（权益取 `daily_equity`） |
| K 线页 | meta + 仓位/信号/对比；信号 marker 含触发原因与指标值 |

## 测试

```bash
npm run type-check
npm run test:run
```

## 文档

- [数据规范](docs/DATA-SPEC.md)
- [运行手册](docs/RUNBOOK.md)
- [部署指南](docs/DEPLOYMENT.md)
