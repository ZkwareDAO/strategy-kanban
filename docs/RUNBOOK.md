# Runbook

运营与部署手册。记录数据架构、部署步骤、日常运维与常见问题。

## 架构

```
┌─────────────────────────┐      每日定时任务           ┌──────────────────────────┐
│  cta-strategy-code      │  daily_backtest_sync.sh     │  signal_comparison_      │
│  (策略回测引擎)          │  ─────────────────────────> │  output/{date}/          │
└─────────────────────────┘                              │  ├── manifest.yaml       │
                                                         │  ├── pnl/kline/...       │
                                                         │  │   └── positions_      │
                                                         │  │       index.json      │
                                                         │  ├── backtest_results/   │
                                                         │  │   └── index.json      │
                                                         │  └── comparisons/        │
                                                         └────────────┬─────────────┘
                                                                      │ 符号链接
                                                                      ▼
                                                         ┌──────────────────────────┐
                                                         │  strategy-kanban/        │
                                                         │  public/data             │
                                                         │  ─────────────────────── │
                                                         │  Vite dev server (:3000) │
                                                         └──────────────────────────┘
```

**关键点：** 前端 `public/data` 是指向 `signal_comparison_output` 的符号链接，数据源更新后前端无需重新构建即可即时读取。

## 部署步骤（局域网）

### 前置条件

- Node.js（含 nvm）
- `cta-strategy-code` 已部署并配置 `daily_backtest_sync.sh` 定时任务

### 部署流程

```bash
# 1. 克隆项目
cd /path/to/workspace
git clone <repo-url> strategy-kanban
cd strategy-kanban

# 2. 安装依赖
npm install

# 3. 建立数据符号链接（关键步骤）
rm -rf public/data
ln -s /path/to/cta-strategy-code/signal_comparison_output public/data

# 3.1 建立 K线数据符号链接（V2 蜡烛图所需，见下文「蜡烛图 V2」）
rm -rf public/kline-data
ln -s /path/to/cta-strategy-code/data/strategies public/kline-data

# 3.2 建立回测输出符号链接（「回测详情」所需，见下文「回测详情」）
rm -rf public/backtest-output
ln -s /path/to/cta-strategy-code/backtest_output public/backtest-output

# 4. 启动（局域网访问用开发模式即可）
npm run dev -- --host
#    或后台运行：
#    nohup npm run dev -- --host > logs/frontend.log 2>&1 &
```

访问 `http://<机器IP>:3000`。

### 更新前端代码

```bash
cd /path/to/strategy-kanban
git pull
npm install        # 依赖有变更时
# 重启 dev server
```

## 数据源每日生成

数据由 `cta-strategy-code/scripts/daily_backtest_sync.sh` 生成，建议 crontab 配置：

```cron
# 每天 8:00 执行信号对比 + 同步 + 索引生成
0 8 * * * /path/to/cta-strategy-code/scripts/daily_backtest_sync.sh >> /path/to/cta-strategy-code/logs/daily_comparison.log 2>&1
```

该脚本末尾会自动执行：
1. **生成仓位索引** `positions_index.json`（`generate-positions-index.sh`）
2. **生成回测索引** `backtest_results/index.json`（`generate-backtest-index-source.sh`）

这两个索引文件是前端策略列表与回放对比功能的数据来源。

## 蜡烛图 V2（数据分离版）

V2 将 **K线数据** 与 **仓位数据** 解耦：只要存在 K线数据即可绘制蜡烛图，仓位/回测为可选叠加层。V1（`/detail/:strategy/:symbol`）保持原样运行，二者互不影响。

### 路由

```
/detail-v2/:strategy/:symbol
```

可选 query：

- `runtime=<runtime_name>`：传入则叠加该 runtime 的仓位与回测；省略则进入「纯K线模式」（仅蜡烛图 + 指标）。
- `date=YYYYMMDD`：初始展示日（单日，等价于 daterange 起止均为该日）；省略则默认今日。

### 数据依赖

| 数据 | 来源 | 是否必需 |
|------|------|----------|
| K线 | `public/kline-data/<strategy>/<symbol>/*.csv`（1m 基础K线） | **必需** |
| 仓位 | `public/data/<YYYYMMDD>/pnl/kline/<runtime>/<YYYYMMDD>_summary_table.csv` | 可选（需 `runtime`） |
| 回测 | `public/data/<YYYYMMDD>/backtest_results/...` | 可选（需 `runtime`） |

`public/kline-data` 是指向 `cta-strategy-code/data/strategies` 的符号链接（见部署步骤 3.1）。

### 大文件 K线读取（HTTP Range）

1m K线 CSV 体积可能很大。V2 采用 **HTTP Range + 二分查找** 按日期区间截取（时间戳零填充字符串，字典序即时间序）：

1. 先 `probeRange`（小范围 GET）探测文件大小与首末行时间戳；
2. 再用 `sliceCsvByDateRange` 通过 Range 请求二分定位 `[start, end]` 区间；
3. 若服务器不支持 206 Range 响应，自动回退到 `streamFilterByDateRange`（整文件流式过滤）。

因此 **dev/prod 服务器需支持 HTTP Range（206 + `Content-Range`）**。Vite dev server 默认支持；若部署到其他静态服务器（nginx 等），确认 `Range` 未被禁用。

### 多日区间

日期选择器为 daterange（`el-date-picker`，`value-format="YYYY-MM-DD"`）。V2 用 `enumerateDates(start, end)` 枚举区间内每一天，K线按区间一次性读取，仓位/回测按日分别拉取后拼接。仓位 `entry_time` 为 `HH:MM`，按 `${date} ${HH:MM}` 与 K线 bar 的 `${datetime前10位} ${HH:MM}` 对齐（日期均按 UTC 日期标签处理，与 K线时间戳的 `+00:00` 一致）。

### 与 V1 的关系

- V1 文件**未修改**，路由、组件、API 均保持原样。
- V2 复用 V1 的 `TechnicalChart.vue`（已解耦为纯渲染组件，接收 `KlinePoint[]`）与 `resampleKline`/指标计算，仅数据获取层不同（`src/api/klineV2.ts` + `src/views/TokenDetailV2.vue`）。
- V2 的仓位叠加通过 `usePositionOverlay` 将 `RawKlinePoint[]` + `DatedPosition[]` 合并成 V1 兼容的 `KlinePoint[]`，因此重采样与指标逻辑无需改动。

## 回测详情（Backtest Details）

页面1（`StrategyOverview`）顶部 `el-tabs` 增加「策略表格 / 回测详情」切换。「回测详情」为表格视图（不跳转页面2），展示每个 (策略, 代币) **最近一次完整回测**的重点指标。

### 数据来源

`public/backtest-output` 是指向 `cta-strategy-code/backtest_output` 的符号链接。目录结构：

```
backtest_output/<策略>/<YYYYMMDD>/<HHMMSS>/<代币>/
  ├── backtest_result.json   ← 完整回测的完成标志
  ├── backtest_signals.csv
  ├── backtest_trades.csv
  ├── backtest_equity.csv
  └── ...
```

同一天可能有多份回测（多个 `HHMMSS` 目录），未完成的回测只有 `backtest_signals.csv`、没有 `backtest_result.json`。

### 索引自动生成（零人工干预）

回测由他人手动执行，无法保证每次回测后手动跑索引脚本，因此索引由 **Vite 插件**（`backtestIndexPlugin`，定义在 `vite.config.ts`）自动生成到 `public/backtest-output-index.json`（前端自有，已 gitignore）：

- `buildStart`：dev/build 启动时扫描一次，写索引。
- `configureServer`：dev 期间用 `fs.watch`（解析符号链接真实路径，recursive）监听 `backtest_output`，**仅以 `backtest_result.json` 落盘作为完成信号**触发刷新（debounce 2.5s + throttle 10s）。未完成的回测不会触发。
- 目录缺失只 `warn` 并写空索引，不中断启动。

索引构建逻辑（纯函数 `src/utils/backtestIndex.ts` 的 `buildIndex`）：每个 (策略, 代币) 取**有 `backtest_result.json`** 的 run 中 date 最大、同 date 内 time 最大者；无 result.json 的 run 不参与。索引结构：

```jsonc
{
  "generated_at": "2026-08-04T08:51:22.374Z",
  "entries": [
    { "strategy": "cta_ict_v3", "symbol": "BTCUSDT", "date": "20260629", "time": "101907", "path": "cta_ict_v3/20260629/101907/BTCUSDT" }
  ]
}
```

### 表格展示

`src/components/BacktestOverview.vue` 自取索引后并行拉取每个 run 的 `backtest_result.json`，展示 ROE / 总收益 / 年化 / 夏普 / 索提诺 / 最大回撤 / 胜率 / 盈亏比 / 交易次数等列。**字段缺失统一显示 `-`，不报错**。行点击弹出 `el-dialog` 查看完整明细。`signals_processed === 0` 的 run 不展示。

### inotify / ENOSPC 注意

`public/` 下的 `data` / `kline-data` / `backtest-output` 均为指向外部数据目录的符号链接，体量巨大。`vite.config.ts` 中 `server.watch` 已设置 `followSymlinks: false` 并 `ignored` 这三个目录，避免 Vite 文件监听耗尽 inotify（`ENOSPC`）。**这只影响监听，不影响静态文件 serving**——前端运行时仍可通过 `/backtest-output/...` 正常 fetch。索引的自动刷新由插件自身的 `fs.watch` 独立完成。

## 健康检查

| 检查项 | 方法 |
|--------|------|
| 前端服务 | `curl http://localhost:3000` 返回 HTML |
| 数据符号链接 | `ls -la public/data` 应显示 `->` 指向数据源 |
| K线符号链接（V2） | `ls -la public/kline-data` 应显示 `->` 指向 `data/strategies` |
| 当日数据 | `ls public/data/$(date +%Y%m%d)/` 应有 manifest.yaml |
| 仓位索引 | `cat public/data/$(date +%Y%m%d)/pnl/positions_index.json` 有 runtimes |
| 回测索引 | `cat public/data/$(date +%Y%m%d)/backtest_results/index.json` 有 runs |
| 回测输出符号链接 | `ls -la public/backtest-output` 应显示 `->` 指向 `backtest_output` |
| 回测详情索引 | `cat public/backtest-output-index.json` 有 entries（dev 启动时自动生成） |

## 常见问题

### 策略列表为空

1. 检查符号链接是否有效：`ls -la public/data`
2. 检查当日 `positions_index.json` 是否生成：见上方健康检查
3. 检查 `daily_backtest_sync.sh` 日志：`logs/daily_comparison_*.log`

### 某策略显示但代币不可点击（半透明）

该 runtime 无仓位数据（`positions_index.json` 中无对应条目），V1 列表页因此将其置灰。如需查看其 K线，改用 V2 路由 `/detail-v2/:strategy/:symbol`（纯K线模式，无需仓位）。

### 点击代币后 K线图空白

V1 中 K线数据与仓位数据耦合，无仓位则无 K线。**已由 V2 解决**：使用 `/detail-v2/:strategy/:symbol` 路由（纯K线模式，无需仓位即可绘制）。确认 `public/kline-data` 符号链接已建立（见部署步骤 3.1）。

### V2 蜡烛图空白 / 报错

1. 检查 K线符号链接：`ls -la public/kline-data` 应指向 `cta-strategy-code/data/strategies`
2. 检查对应 K线文件存在：`ls public/kline-data/<strategy>/<symbol>/`
3. 大文件加载失败时确认服务器支持 HTTP Range（206），见「大文件 K线读取」

### 策略名显示为长前缀（如 VWAPCHANNELMOMENTUM）

前缀映射在 `src/models/runtime.ts` 的 `RUNTIME_PREFIX_MAP`。新增策略需在此添加映射。

### 符号链接失效（数据源迁移后）

```bash
rm public/data
ln -s /new/path/to/signal_comparison_output public/data
```

## 回滚

前端为纯静态服务，回滚即切回旧代码：

```bash
git checkout <previous-commit>
# 重启 dev server
```

数据源回滚需在 `cta-strategy-code` 项目处理，参考该项目文档。
