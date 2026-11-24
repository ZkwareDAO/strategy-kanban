# 数据规范（frontend-data v2）

前端只消费静态文件，不生成索引、不扫描目录、不监听文件变化。本文描述 v2 契约；
数据生产侧的完整说明见 `trading-replay-skill/references/FRONTEND-DATA.md`。

## 1. 配置

项目根目录 `datasource.config.json`：

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

- `frontendBaseUrl` / `klineBaseUrl` 支持绝对 URL（独立数据服务器/CDN）。
- 可用 `VITE_DATA_FRONTEND_BASE_URL` / `VITE_DATA_KLINE_BASE_URL` 覆盖。
- `paths.overrides` 只用于文件改名；相对布局由 `src/data/contract.ts` 固定。
- 跨域部署时数据侧需配置 CORS；1m K 线需支持 HTTP Range（206）。

## 2. 目录结构

```text
frontend-data/
├── catalog.csv
├── discovery/                          # 可选：全局策略发现索引
│   ├── runs.csv
│   └── {source_strategy}/backtest_results/{runStamp}/{SYMBOL}.json
└── {day}/                              # YYYYMMDD
    ├── manifest.csv
    ├── backtest_runs.csv
    └── {strategy}/
        ├── meta.json
        ├── manifest.csv
        ├── backtest_runs.csv
        ├── live_positions.csv
        ├── live_signals.csv
        ├── backtest_positions.csv
        ├── backtest_signals.csv
        ├── signal_comparison.csv
        └── backtest_results/{runStamp}/{SYMBOL}.json
```

无数据时不建文件（不写空表头）。回测权益曲线来自结果 JSON
`{runStamp}/{SYMBOL}.json` 的 `daily_equity: [{date,equity,cash}]`，
不再读取 `backtest_equity.csv`。

## 3. 文件与关键字段

### catalog.csv

`schema_version,day,strategies,has_live,has_backtest,updated_at`

`strategies` 为 `|` 分隔的策略目录名。

### {day}/manifest.csv

`schema_version,data_day,strategy,source_strategy,strategy_display_name,strategy_version,symbol,runtime_name,engine,trading_mode,status,has_live,has_backtest,total_trades,winning_trades,losing_trades,win_rate,total_pnl,open_positions,floating_pnl,latest_run_id,latest_annualized_return,latest_roe,latest_max_drawdown,strategy_path`

- `strategy`：策略目录名，前端路由/查询的统一键。
- `source_strategy`：配置策略名，仅用于展示兜底。
- 比率均为小数（`0.0164` = 1.64%）。

### discovery/runs.csv

与 `{day}/backtest_runs.csv` 同列，`source=discovery`。策略发现页优先读取该文件；
缺失时回退为遍历 catalog 每天 `{day}/backtest_runs.csv` 的 `source=discovery` 行。
结果文件位于 `discovery/{source_strategy}/backtest_results/{runStamp}/{SYMBOL}.json`。

### {day}/backtest_runs.csv

`schema_version,source,data_day,batch_id,run_id,run_day,run_stamp,sweep,strategy,source_strategy,strategy_display_name,strategy_version,config_version,symbol,start_date,end_date,status,completed_at,signals_processed,trades_count,annualized_return,roe,total_return,max_drawdown,win_rate,total_trades,sharpe_ratio,is_latest`

- 前端只取 `is_latest=1`；`source` 为 `replay` / `discovery`。
- 每日回放与策略发现都按 `strategy + batch_id` 聚合。
- `run_stamp` 是标识符，不是数据时间；`start_date` 可能因指标预热早于 `data_day`。

### live_positions.csv

`schema_version,data_day,strategy,source_strategy,strategy_display_name,strategy_version,symbol,runtime_name,engine,trading_mode,position_id,side,status,qty,entry_time,entry_price,exit_time,exit_price,realized_pnl,pnl_pct,max_pnl_pct,min_pnl_pct,leverage,exit_reason,updated_at`

- 策略级文件，行级带 `symbol`。
- `status`：`OPEN` / `CLOSED`；`side`：`long` / `short`。
- `realized_pnl` 是金额，区间统计按它累加；`pnl_pct` 是百分数（`1.9073` = 1.9073%）。
- 跨日合并按 `position_id` 去重：`CLOSED` 优先；仍为 `OPEN` 时取区间内最新一天的快照。

### live_signals.csv / backtest_signals.csv

`...symbol,[run 字段...],signal_id,signal_time,side,action,direction,price,qty,status,filled_price,filled_qty,reason`

- `action`：`open` / `close`；`side`：`BUY` / `SELL`；`direction`：`long` / `short`。
- `reason` 包含触发依据（如 `SAR=1(...) ST=1(...)`），图表 marker 悬停展示。
- 回测信号必须按 `is_latest=1` 过滤。

### signal_comparison.csv

`...symbol,run_id,batch_id,record_type,match_type,signal_side,signal_action,live_signal_id,backtest_signal_id,live_time,backtest_time,time_diff_seconds,live_price,backtest_price,price_diff_pct,status`

- `record_type`：`matched` / `unmatched_live` / `unmatched_backtest`。
- `status`：`matched` / `missed`。

### meta.json

策略展示信息：`strategy/source_strategy/display_name/description/timeframe/leverage/indicators/indicator_params/logic/params`。
前端用 `strategy` 作为键，不再需要任何策略名前缀映射。

## 4. K 线

```text
kline-data/{period}/{SYMBOL}_{period}.csv
```

列：`timestamp,open,high,low,close[,volume]`，时间 `YYYY-MM-DD HH:MM:SS+00:00`。

- 大周期优先读取聚合文件，缺失时由前端从 `basePeriod` 聚合。
- 指标预热与业务区间一次 Range 取数；预热不足时页面显式告警。
- 文件需按时间升序，Range 服务返回 206。

## 5. 语义约定

| 项 | 约定 |
|---|---|
| 日期目录 | `YYYYMMDD` |
| 时间 | ISO8601 UTC |
| 比率 | 小数 |
| `pnl_pct` | 百分数 |
| 多轮次 | `is_latest=1` |
| 空回测 | 保留 run 行，不生成 positions/signals |
| 已平仓映射 | `status=CLOSED` → 页面 `deleted=1` |

## 6. 前端边界

- 不生成任何索引文件；
- 不扫描数据目录、不列文件；
- 不监听数据变化；
- 404 / 空文本按空数据处理；
- 页面“重新加载”清空读取缓存。
