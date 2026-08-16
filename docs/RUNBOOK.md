# Runbook

运营与部署手册。记录数据架构、部署步骤、日常运维与常见问题。

## 架构

```
[ 数据生成流程 ]  ——每日——>  [ 你的数据目录 ]  ——符号链接或真实目录——>  [ public/ ]
  使用方自备                                                          Vite dev server
  本项目不做限制                                                      (:3000)
```

数据目录的内容：

```
你的数据目录/
├── frontend-data/
│   ├── strategies.json                    # 策略元数据（全局一份，可选）
│   ├── {YYYYMMDD}/
│   │   ├── manifest.json                  # 当日策略清单（必需）
│   │   └── {策略}/{标的}/
│   │       ├── positions.json             # 持仓开平仓点
│   │       ├── backtest.json              # 回放交易
│   │       └── comparison.json            # 实盘与回放信号对比
│   └── trading_data/
│       └── trading_positions_{YYYYMMDD}.csv   # 区间统计
├── kline-data/
│   └── {周期}/{标的}_{周期}.csv               # K线行情（必需）
└── backtest_output/                           # 历史回测（可选）
    └── {策略}/{YYYYMMDD}/{HHMMSS}/{标的}/
```

**关键点：** `public/` 下的数据目录可以是指向外部数据的符号链接，数据更新后前端无需重新构建即可即时读取。数据格式规范见 [DATA-SPEC.md](./DATA-SPEC.md)。

## 部署步骤（局域网）

### 前置条件

- Node.js（含 nvm）
- 一份符合 [DATA-SPEC.md](./DATA-SPEC.md) 的数据

### 部署流程

```bash
# 1. 克隆项目
cd /path/to/workspace
git clone <repo-url> strategy-kanban
cd strategy-kanban

# 2. 安装依赖
npm install

# 3. 建立数据目录（关键步骤，可为真实目录或符号链接）

# 3.1 策略、持仓、对比、策略表现（必需——缺失则策略列表为空）
rm -rf public/frontend-data
ln -s /path/to/your-data/frontend-data public/frontend-data

# 3.2 K线行情（必需——蜡烛图所需）
rm -rf public/kline-data
ln -s /path/to/your-data/kline public/kline-data

# 3.3 历史回测（可选——「回测详情」tab 所需）
rm -rf public/backtest-output
ln -s /path/to/your-data/backtest_output public/backtest-output

# 4. 启动（局域网访问用开发模式即可）
mkdir -p logs
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

## 数据的每日更新

前端每天需要以下文件（生成方式不限，可用脚本、定时任务或手工放置）：

| 文件 | 用途 | 缺失后果 |
|------|------|----------|
| `frontend-data/{YYYYMMDD}/manifest.json` | 当日策略清单 | 「每日收益」显示暂无策略数据 |
| `frontend-data/{YYYYMMDD}/{策略}/{标的}/positions.json` | 持仓开平仓点 | 该标的置灰不可点击 |
| `frontend-data/{YYYYMMDD}/{策略}/{标的}/backtest.json` | 回放交易 | 无回放叠加 |
| `frontend-data/{YYYYMMDD}/{策略}/{标的}/comparison.json` | 信号对比 | 详情页不显示对比模块 |
| `frontend-data/trading_data/trading_positions_{YYYYMMDD}.csv` | 区间统计 | 「区间统计」无数据 |

`frontend-data/strategies.json`（策略中文名、逻辑说明、默认指标）**不是每日文件**，只在策略增减或说明变更时更新即可；缺失时策略名显示为原始标识、指标用默认值。

若用定时任务生成，crontab 形如：

```cron
# 每天 8:00 生成当日数据（脚本由使用方自行提供）
0 8 * * * /path/to/your-data-pipeline.sh >> /path/to/your-logs/daily.log 2>&1
```

> **注意日期边界**：前端「每日收益」默认加载**昨天**的数据。若数据生成滞后，页面会显示「暂无策略数据」——此时把日期选择器往前拨即可确认数据是否存在。

历史回测（`backtest-output/`）非每日数据，由使用方按需生成，其索引由前端自动构建（见下文「回测详情」）。

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
| K线 | `public/kline-data/1m/<SYMBOL>_1m.csv`（1m 基础K线，前端按需重采样） | **必需** |
| 仓位 | `public/frontend-data/<YYYYMMDD>/<策略>/<标的>/positions.json` | 可选（需 `runtime`） |
| 回放 | `public/frontend-data/<YYYYMMDD>/<策略>/<标的>/backtest.json` | 可选（需 `runtime`） |

`public/kline-data` 与 `public/frontend-data` 可为真实目录或符号链接（见部署步骤 3）。

### 大文件 K线读取（HTTP Range）

1m K线 CSV 体积可能很大。V2 采用 **HTTP Range + 二分查找** 按日期区间截取（时间戳零填充字符串，字典序即时间序）：

1. 先 `probeRange`（小范围 GET）探测文件大小与首末行时间戳；
2. 再用 `sliceCsvByDateRange` 通过 Range 请求二分定位 `[start, end]` 区间；
3. 若服务器不支持 206 Range 响应，自动回退到 `streamFilterByDateRange`（整文件流式过滤）。

因此 **dev/prod 服务器需支持 HTTP Range（206 + `Content-Range`）**。Vite dev server 默认支持；若部署到其他静态服务器（nginx 等），确认 `Range` 未被禁用。

### 多日区间

日期选择器为 daterange（`el-date-picker`，`value-format="YYYY-MM-DD"`）。V2 用 `enumerateDates(start, end)` 枚举区间内每一天，K线按区间一次性读取，仓位/回放按日分别拉取后拼接。仓位 `entry_time` / `exit_time` 为 ISO 8601 带偏移（如 `2026-08-06T16:45:00+00:00`），与 K线时间戳的 `+00:00` 一致，日期均按 UTC 日期标签处理。

### 与 V1 的关系

- V1 文件**未修改**，路由、组件、API 均保持原样。
- V2 复用 V1 的 `TechnicalChart.vue`（已解耦为纯渲染组件，接收 `KlinePoint[]`）与 `resampleKline`/指标计算，仅数据获取层不同（`src/api/klineV2.ts` + `src/views/TokenDetailV2.vue`）。
- V2 的仓位叠加通过 `usePositionOverlay` 将 `RawKlinePoint[]` + `DatedPosition[]` 合并成 V1 兼容的 `KlinePoint[]`，因此重采样与指标逻辑无需改动。

## 回测详情（Backtest Details）

页面1（`StrategyOverview`）顶部 `el-tabs` 增加「策略表格 / 回测详情」切换。「回测详情」为策略发现三层视图，展示**全部历史回测记录**（不再只保留每个 (策略, 标的) 的最近一次），默认按完成时间倒序。

### 数据来源

`public/backtest-output` 存放历史回测结果（可为真实目录或符号链接）。目录结构：

```
backtest_output/<策略>/<YYYYMMDD>/<HHMMSS>/<标的>/
  ├── backtest_result.json   ← 完整回测的完成标志
  ├── backtest_signals.csv
  ├── backtest_trades.csv
  ├── backtest_equity.csv
  └── ...
```

同一天可能有多份回测（多个 `HHMMSS` 目录），未完成的回测只有 `backtest_signals.csv`、没有 `backtest_result.json`。

对外的数据格式规范（开源用户视角）见 [DATA-SPEC.md](./DATA-SPEC.md)。

### 索引自动生成（零人工干预）

回测可能由他人手动执行，无法保证每次回测后都记得跑索引脚本，因此索引由 **Vite 插件**（`backtestIndexPlugin`，定义在 `vite.config.ts`）自动生成到 `public/backtest-output-index.json`（前端自有，已 gitignore）：

- `buildStart`：dev/build 启动时扫描一次，写索引。
- `configureServer`：dev 期间用 `fs.watch`（解析符号链接真实路径，recursive）监听 `backtest_output`，**仅以 `backtest_result.json` 落盘作为完成信号**触发刷新（debounce 2.5s + throttle 10s）。未完成的回测不会触发。
- 目录缺失只 `warn` 并写空索引，不中断启动。
- 扫描时顺带读取每个 `backtest_result.json`，把列表页展示所需字段**内嵌进索引**（`readSummary`）。解析失败按无摘要处理，该 run 仍进索引（对应单元格显示 `-`），不中断整体生成。

内嵌摘要的原因：列表页原本为每个标的单独 fetch 一份完整 `result.json`。保留全部历史 run 后请求数随回测积累无上限增长；内嵌后前两层只读一个索引文件，零额外请求。详情页仍读原始 `result.json`（需要全部字段）。

索引构建逻辑（纯函数 `src/utils/backtestIndex.ts`）：

- `buildIndex`：保留**全部**有 `backtest_result.json` 的 run，不做去重；按 (策略, 运行日期) 分配 `sweep`（同日轮次）；按完成时间倒序输出。
- `groupRuns`：按 `strategy | start_date | end_date | date | sweep` 聚合成列表行，`signals_processed === 0` 的空回测过滤掉，按完成时间倒序。

`sweep` 的作用：回测脚本通常逐标的启动，同一批次的 `HHMMSS` 只相差几秒，若直接按 `HHMMSS` 分行会把一批切成很多只含单个标的的碎片行；但同一天对同一标的的**重跑**指标确实不同，必须各自保留。因此按 `time` 升序贪心分配轮次：每个 run 归入第一个"尚无该标的"的轮次，否则新开一轮。结果是同批次合并成一行、重跑各自成行，零丢失，且每行内标的不重复。

索引结构：

```jsonc
{
  "generated_at": "2026-08-13T07:10:02.262Z",
  "entries": [
    {
      "strategy": "cta_ict_v3", "symbol": "BTCUSDT",
      "date": "20260629", "time": "101907",
      "path": "cta_ict_v3/20260629/101907/BTCUSDT",
      "sweep": 0,
      "start_date": "2025-01-01", "end_date": "2026-06-29",
      "completed_at": "2026-06-29T18:22:41",
      "signals_processed": 492,
      "metrics": { "annualized_return": 2.787, "roe": 2.8991, "total_return": 2.8991,
                   "max_drawdown": 0.0238, "win_rate": 0.8861, "total_trades": 246,
                   "sharpe_ratio": 2.6685 }
    }
  ]
}
```

### 表格展示

三层结构：

1. `src/components/BacktestOverview.vue`——策略层：策略 / 标的 / 最佳年化 / 回测区间 / 完成时间。默认按完成时间倒序；行数超过 20 时显示 `el-pagination`（≤20 时不渲染，保持界面不变）。排序在全量上做完再切页。
2. `src/views/BacktestTokenList.vue`——标的层：按 `strategy + 区间 + date + sweep` 精确定位到某一次历史回测，展示年化 / ROE / 总收益 / 最大回撤 / 胜率 / 交易次数 / 夏普。缺少 `date`/`sweep` 的旧链接退化为按区间匹配，并用 `pickLatestPerSymbol` 对每个标的只保留最新一次——否则同一标的会因多次历史回测重复成行（该页以 symbol 作为渲染 key，重复会导致渲染异常）。
3. `src/views/BacktestDetail.vue`——详情层：权益曲线（叠加日线收盘价与回撤）+ 指标卡片，按 `path` 读原始 `result.json`，天然支持任意历史 run。

**字段缺失统一显示 `-`，不报错**。`signals_processed === 0` 的 run 不展示。

### inotify / ENOSPC 注意

`public/` 下的 `frontend-data` / `kline-data` / `backtest-output` / `data` 通常是指向外部数据目录的符号链接，体量可能很大。`vite.config.ts` 中 `server.watch` 已设置 `followSymlinks: false` 并 `ignored` 这四个目录，避免 Vite 文件监听耗尽 inotify（`ENOSPC`）。**这只影响监听，不影响静态文件 serving**——前端运行时仍可通过 `/frontend-data/...`、`/backtest-output/...` 正常 fetch。索引的自动刷新由插件自身的 `fs.watch` 独立完成。

## 健康检查

| 检查项 | 方法 |
|--------|------|
| 前端服务 | `curl http://localhost:3000` 返回 HTML |
| 策略数据目录 | `ls -la public/frontend-data` 存在（符号链接时应显示 `->` 且未失效） |
| K线数据目录 | `ls -la public/kline-data` 存在 |
| 当日数据 | `ls public/frontend-data/$(date +%Y%m%d)/` 应有 `manifest.json` |
| manifest 格式 | `cat public/frontend-data/$(date +%Y%m%d)/manifest.json` 形如 `{"date":"...","strategies":[...]}`，`strategies` 非空 |
| 区间统计数据 | `ls public/frontend-data/trading_data/` 有 `trading_positions_*.csv` |
| 回测输出目录 | `ls -la public/backtest-output` 存在（可选功能） |
| 策略发现索引 | `cat public/backtest-output-index.json` 有 entries（dev 启动时自动生成），每条应含 `sweep` 与 `metrics` |

## 常见问题

### 策略列表为空 / 显示「暂无策略数据」

1. **先确认日期**：页面默认加载**昨天**。若数据生成滞后一天，把日期选择器往前拨即可。这是最常见的原因。
2. 检查数据目录是否有效：`ls -la public/frontend-data`（符号链接失效时无输出或指向不存在的路径）
3. 检查当日 `manifest.json` 是否存在且 `strategies` 非空：见上方健康检查
4. 打开浏览器 DevTools 的 Network，确认 `manifest.json` 返回 200 且是 JSON——若返回的是 HTML，说明文件不存在、被开发服务器回退成了 `index.html`

### 某策略显示但标的不可点击（置灰）

该策略/标的当日无持仓数据（对应目录下没有 `positions.json`），列表页因此将其置灰。如需查看其 K线，改用 V2 路由 `/detail-v2/:strategy/:symbol`（纯K线模式，无需持仓）。

### 点击标的后 K线图空白

V1 中 K线数据与持仓数据耦合，无持仓则无 K线。**已由 V2 解决**：使用 `/detail-v2/:strategy/:symbol` 路由（纯K线模式，无需持仓即可绘制）。确认 `public/kline-data` 已就位（见部署步骤 3.2）。

### V2 蜡烛图空白 / 报错

1. 检查 K线目录：`ls -la public/kline-data`
2. 检查对应 K线文件存在：`ls public/kline-data/1m/<SYMBOL>_1m.csv`
3. 大文件加载失败时确认服务器支持 HTTP Range（206），见「大文件 K线读取」

### 策略名显示为长前缀（如 VWAPCHANNELMOMENTUM）

前缀映射在 `src/models/runtime.ts` 的 `PREFIX_STRATEGY_MAP`（目录前缀 → 策略名）。新增策略需在此添加映射。若想显示中文名，在数据源的 `frontend-data/strategies.json` 中以策略目录名为键添加 `display_name`（见 [DATA-SPEC.md](./DATA-SPEC.md)）。

### 数据目录迁移后链接失效

```bash
rm public/frontend-data && ln -s /new/path/to/frontend-data public/frontend-data
rm public/kline-data    && ln -s /new/path/to/kline         public/kline-data
```

## 回滚

前端为纯静态服务，回滚即切回旧代码：

```bash
git checkout <previous-commit>
# 重启 dev server
```

数据本身的回滚取决于使用方自己的数据生成流程——前端只读取 `public/` 下的静态文件，把目录指回旧数据即可。
