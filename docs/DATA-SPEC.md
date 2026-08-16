# 数据规范

本文档描述交易复盘前端项目所需的全部数据，包括目录结构、文件格式和字段含义。

只要按本规范准备好数据文件，放入 `public/` 对应目录即可运行，不依赖任何特定的后端或策略框架。

---

## 目录结构

前端通过静态文件服务读取数据，需在 `public/` 下建立以下目录（可为真实目录或符号链接）：

```
public/
├── frontend-data/                  # 策略与持仓数据根目录
│   ├── strategies.json             # 策略元数据（全局一份，可选）
│   ├── YYYYMMDD/                   # 按日期组织，如 20260809
│   │   ├── manifest.json           # 当日策略清单
│   │   └── {strategy_dir}/         # 策略目录名，如 DOLPHINV2_4H_2
│   │       └── {SYMBOL}/           # 交易对，如 BTCUSDT
│   │           ├── positions.json  # 持仓数据
│   │           ├── backtest.json   # 回放交易数据
│   │           └── comparison.json # 实盘与回放信号对比
│   └── trading_data/
│       └── trading_positions_YYYYMMDD.csv  # 策略表现仓位（每日一份）
│
├── kline-data/                     # K线行情数据
│   └── {period}/                   # 1m / 5m / 15m / 30m / 1h / 2h / 4h / 8h / 1d
│       └── {SYMBOL}_{period}.csv   # 如 BTCUSDT_1m.csv
│
└── backtest-output/                # 历史回测结果（可选，策略发现页需要）
    └── {strategy}/                 # 策略目录名，如 cta_ict_v3
        └── {YYYYMMDD}/             # 回测启动日期
            └── {HHMMSS}/           # 回测启动时刻
                └── {SYMBOL}/       # 交易对，如 BTCUSDT
                    ├── backtest_result.json   # 必需，同时作为"回测完成"标志
                    └── backtest_equity.csv    # 可选，权益曲线
```

### 目录说明

| 静态路径 | 必需 | 说明 |
|---------|------|------|
| `public/frontend-data` | 是 | 策略、持仓、对比、策略表现数据，按本规范组织 |
| `public/kline-data` | 是 | K线 CSV 文件，按周期分目录 |
| `public/backtest-output` | 否 | 历史回测结果，用于策略发现页（三层：策略列表 → 标的列表 → 回测详情） |

这些路径可以直接是真实目录，也可以是指向外部数据目录的符号链接。

---

## 文件规范

### 1. manifest.json

当日所有运行策略的清单。每个策略/交易对组合对应一条记录。

```json
{
  "date": "20260809",
  "strategies": [
    {
      "strategy": "DOLPHINV2_4H_2",
      "symbol": "BTCUSDT",
      "trading_mode": "live",
      "runtime_name": "DOLPHINV2_4H_2_BTCUSDT_LIVE",
      "status": "success",
      "source_strategy": "dolphin_trading_v2"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期，格式 `YYYYMMDD` |
| `strategies[].strategy` | string | 策略目录名，同时作为 `frontend-data/{date}/` 下的目录路径，如 `DOLPHINV2_4H_2`、`ERP_2H_1` |
| `strategies[].symbol` | string | 交易对，如 `BTCUSDT` |
| `strategies[].trading_mode` | string | 交易模式：`live`（实盘）、`paper_trading`（模拟盘）、`smoking`（冒烟测试）、`unknown` |
| `strategies[].runtime_name` | string | 完整运行实例名，格式 `{strategy}_{SYMBOL}_{MODE}`，如 `DOLPHINV2_4H_2_BTCUSDT_LIVE` |
| `strategies[].status` | string | 运行状态：`success`、`failed`、`unknown` |
| `strategies[].source_strategy` | string | 策略逻辑标识，用于路由和前端策略配置匹配，如 `dolphin_trading_v2`、`ema_rsi_pullback` |

> **两个策略标识的区别**：
> - `strategy` 是文件系统中的目录名（如 `DOLPHINV2_4H_2`），用于定位数据文件
> - `source_strategy` 是策略的逻辑标识（如 `dolphin_trading_v2`），用于匹配前端策略配置（显示名、策略逻辑、默认指标等）
>
> 两者可以不同，例如目录名是缩写 `ERP_2H_1`，而 source_strategy 是 `ema_rsi_pullback`。

---

### 2. positions.json

当日持仓记录数组。**文件始终存在**，无仓位时为空数组 `[]`。

这一设计保证了 K 线与仓位数据解耦：即使某天没有仓位，策略标签仍然可以点击，用户能查看纯 K 线图。

```json
[
  {
    "position_id": "DOLPHINV2_4H_2_BTCUSDT_LIVE_BTCUSDT_1786034700",
    "type": "short",
    "entry_time": "2026-08-06T16:45:00+00:00",
    "exit_time": "2026-08-06T23:22:02.483106+00:00",
    "entry_price": 64725.0,
    "exit_price": 64225.4,
    "realized_pnl": 0.7719,
    "max_potential_pnl": 0.7718,
    "max_drawdown": -0.1058
  },
  {
    "position_id": "ERP_2H_1_ETHUSDT_LIVE_ETHUSDT_1786300000",
    "type": "long",
    "entry_time": null,
    "exit_time": "2026-08-09T18:29:00+00:00",
    "entry_price": 1667.0,
    "exit_price": 1647.95,
    "realized_pnl": 1.1425,
    "max_potential_pnl": 3.719,
    "max_drawdown": 0.0
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `position_id` | string | 持仓唯一标识，需在同一策略/交易对内唯一。推荐格式 `{runtime_name}_{SYMBOL}_{entry_timestamp}` |
| `type` | string | 持仓方向：`long`（做多）、`short`（做空） |
| `entry_time` | string \| null | 开仓时间（ISO 8601，UTC）。**跨日仓位在平仓日为 `null`**：即仓位在前几日开仓、当天平仓，当天没有真实开仓动作，前端不渲染开仓标记 |
| `exit_time` | string \| null | 平仓时间（ISO 8601），持仓中为 `null` |
| `entry_price` | number | 开仓价格 |
| `exit_price` | number \| null | 平仓价格，持仓中为 `null` |
| `realized_pnl` | number \| null | 已实现收益率（%），持仓中为 `null` |
| `max_potential_pnl` | number | 持仓期间最大浮盈（%） |
| `max_drawdown` | number | 持仓期间最大回撤（%） |

**跨日仓位处理规则**：

若一个仓位在前几日开仓、在当天平仓，则当天的 `positions.json` 中：
- `entry_time` 设为 `null`（当天没有开仓动作，不应显示开仓标记）
- `entry_price` 保留真实开仓价（用于计算 ROI 曲线）
- `exit_time`、`exit_price`、`realized_pnl` 正常填写

前端 ROI 曲线会从当天第一根 K 线开始，基于真实开仓价计算浮动盈亏，因此不会从 0 开始；但不会在 00:00 显示一个虚假的开仓点。

---

### 3. backtest.json

当日回放/回测交易记录数组，仅保留前端展示所需的精简字段。

```json
[
  {
    "timestamp": "2026-08-09T09:15:00",
    "side": "BUY",
    "price": 64746.8,
    "pnl": 0.0
  },
  {
    "timestamp": "2026-08-09T12:30:00",
    "side": "SELL",
    "price": 65000.0,
    "pnl": 0.39
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | string | 交易时间（ISO 8601） |
| `side` | string | 交易方向：`BUY`、`SELL`、`BUY_CLOSE`、`SELL_CLOSE` |
| `price` | number | 交易价格 |
| `pnl` | number | 该笔交易盈亏（%） |

文件不存在时前端显示"无回放数据"，不报错。前端将这些交易点以菱形/方形标记叠加在 K 线图上，用于对比实盘与回放信号。

---

### 4. comparison.json

实盘信号与回放信号的对比报告。**完整结构需保留**，前端直接渲染各统计字段。

```json
{
  "strategy": "dolphin_trading_v2",
  "symbol": "BTCUSDT",
  "date": "20260809-20260809",
  "total_live": 3,
  "total_backtest": 3,
  "matched": 2,
  "accuracy_score": 0.67,
  "recommendation": "GOOD",
  "time_accuracy": {
    "avg_diff_seconds": 45.2,
    "max_diff_seconds": 120,
    "std_dev_seconds": 35.1
  },
  "price_accuracy": {
    "avg_diff_pct": 0.05,
    "max_diff_pct": 0.12,
    "within_0.1pct": 2,
    "within_0.5pct": 3
  },
  "signal_id_matched": 2,
  "time_window_matched": 1,
  "unmatched_live": [],
  "unmatched_backtest": [],
  "matched_signals": []
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `strategy` | string | 策略标识（source_strategy） |
| `symbol` | string | 交易对 |
| `date` | string | 日期或日期范围 |
| `total_live` | number | 实盘信号总数 |
| `total_backtest` | number | 回放信号总数 |
| `matched` | number | 匹配的信号对数 |
| `accuracy_score` | number | 综合准确率 0~1 |
| `recommendation` | string | 评估建议：`GOOD`、`ACCEPTABLE`、`NO_DATA` 等 |
| `time_accuracy` | object | 时间偏差统计（平均/最大/标准差，单位秒） |
| `price_accuracy` | object | 价格偏差统计（平均/最大百分比，容差内匹配数） |
| `signal_id_matched` | number | 信号 ID 直接匹配数 |
| `time_window_matched` | number | 时间窗口模糊匹配数 |
| `unmatched_live` | array | 未匹配的实盘信号详情 |
| `unmatched_backtest` | array | 未匹配的回放信号详情 |
| `matched_signals` | array | 匹配成功的信号对详情 |

文件不存在时前端不显示对比模块。`unmatched_*` 和 `matched_signals` 的具体结构由数据提供方定义，前端仅做列表展示。

---

### 5. trading_positions_YYYYMMDD.csv

策略表现页面的订单/仓位数据，每日一份 CSV。**仅需包含下表列出的 8 个字段**，其余订单系统元数据（user_id、order_id、margin 等）无需存储。

前端按日期范围读取多日文件并在浏览器端聚合统计（按策略、按交易对计算胜率、盈亏等），无需后端 API。

```csv
asset,strategy_name,pos_type,pnl_value,deleted,created_at,close_time,leverage
BTCUSDT,NEWOBV_4H_1_BTCUSDT,2,1.092,0,2026-08-06T04:01:03+08:00,,5
BTCUSDT,DOLPHINV2_4H_2_BTCUSDT,2,50.0,1,2026-08-06T16:45:00+08:00,2026-08-06T23:22:00+08:00,10
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `asset` | string | 交易对，如 `BTCUSDT` |
| `strategy_name` | string | 策略名，格式 `{strategy_dir}_{SYMBOL}`（**不含 MODE 后缀**），如 `NEWOBV_4H_1_BTCUSDT`、`DOLPHINV2_4H_2_BTCUSDT` |
| `pos_type` | number | 仓位类型：2=期货（前端仅统计此类型） |
| `pnl_value` | number | 盈亏金额（计价货币） |
| `deleted` | number | 是否已平仓：1=已平仓（前端仅统计已平仓订单），0=持仓中 |
| `created_at` | string | 开仓时间（RFC 3339） |
| `close_time` | string | 平仓时间（RFC 3339），持仓中为空 |
| `leverage` | number | 杠杆倍数，用于区间统计页的「杠杆」列（取策略组内最大值）。缺失时按 `1` 处理 |

**策略关联规则（关键）**：

`strategy_name` 的格式必须是 `{strategy_dir}_{SYMBOL}`，其中 `strategy_dir` 与 `manifest.json` 中的 `strategy` 字段一致。前端聚合策略组时去掉最后一段 `_SYMBOL`，得到的策略组名正好等于 manifest 的 `strategy`：

| strategy_name | 去掉 _SYMBOL 后 | 对应 manifest strategy |
|--------------|----------------|----------------------|
| `NEWOBV_4H_1_BTCUSDT` | `NEWOBV_4H_1` | `NEWOBV_4H_1` |
| `DOLPHINV2_4H_2_BTCUSDT` | `DOLPHINV2_4H_2` | `DOLPHINV2_4H_2` |
| `ERP_2H_1_ETHUSDT` | `ERP_2H_1` | `ERP_2H_1` |

这样"策略表现"页的策略组与"实盘表现"页（manifest 驱动）的同一策略可以跨页面关联。

前端聚合逻辑：
- 过滤 `deleted === 1 && pos_type === 2`（已平仓期货订单）
- 按 `strategy_name` 去掉最后一个 `_` 后的 SYMBOL 部分，聚合为策略维度
- 按 `asset` 聚合为交易对维度
- 统计总交易数、胜率、最大单笔盈亏、总盈亏等指标

---

### 6. K线 CSV

OHLCV 行情数据，按周期分目录存放。文件可能很大，前端通过 HTTP Range 请求按需读取指定日期区间。

```csv
timestamp,open,high,low,close,volume
2022-12-30 00:00:00+00:00,16630.3,16633.7,16629.2,16629.3,337.988
2022-12-30 00:01:00+00:00,16629.3,16631.5,16628.0,16630.1,298.442
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | string | K线时间（ISO 8601，UTC） |
| `open` | number | 开盘价 |
| `high` | number | 最高价 |
| `low` | number | 最低价 |
| `close` | number | 收盘价 |
| `volume` | number | 成交量（可选，缺失时不影响图表） |

**文件路径**：`kline-data/{period}/{SYMBOL}_{period}.csv`

**支持的周期**：`1m`、`5m`、`15m`、`30m`、`1h`、`2h`、`4h`、`8h`、`1d`

**注意事项**：
- 首行为表头
- 数据按时间升序排列
- 服务端需支持 HTTP Range 请求（`Range: bytes=...`），前端利用此特性读取大文件的局部内容；若服务端不支持 Range，前端会回退为全量流式读取
- 时间戳需为 UTC，前端按 UTC 解释

---

### 7. 回测数据（backtest-output）

策略发现页的数据源。与前 6 项按日期组织的每日数据不同，回测是**按需触发**的：每跑一次回测就新增一个目录，**全部历史记录都会保留并展示**。

> 与第 3 节的 `backtest.json` 不是一回事：那是**当日**回放交易点（叠加在 K 线图上），本节是**独立的历史回测报告**。

#### 目录结构

```
backtest-output/{strategy}/{YYYYMMDD}/{HHMMSS}/{SYMBOL}/
├── backtest_result.json   # 必需
└── backtest_equity.csv    # 可选
```

| 层级 | 含义 | 示例 |
|------|------|------|
| `{strategy}` | 策略目录名，前端直接作为策略名展示 | `cta_ict_v3` |
| `{YYYYMMDD}` | 回测**启动日期** | `20260629` |
| `{HHMMSS}` | 回测**启动时刻**，同日多次回测靠它区分 | `101907` |
| `{SYMBOL}` | 交易对 | `BTCUSDT` |

| 文件 | 必需 | 说明 |
|------|------|------|
| `backtest_result.json` | 是 | 配置、指标、账户信息。**同时作为"回测完成"的标志**：只有存在此文件的目录才会被索引 |
| `backtest_equity.csv` | 否 | 权益曲线，缺失时详情页不绘制曲线，其余指标正常显示 |

> 目录内的其他文件（如成交明细、信号明细、图片）前端不读取，可自由保留。
>
> **未完成的回测请勿写入 `backtest_result.json`** —— 前端以该文件的存在作为完成信号，回测中途的目录会被自动忽略，无需额外的状态标记。

#### backtest_result.json

所有字段都是可选的，缺失时前端显示 `-`。最小可用集合为 `config.start_date`、`config.end_date` 和 `metrics.annualized_return`（否则列表页的区间与年化列为空）。

```json
{
  "config": {
    "name": "ICT_1D_3_BTCUSDT 回测",
    "start_date": "2025-01-01",
    "end_date": "2026-06-29",
    "initial_cash": 100000,
    "symbols": ["BTCUSDT"]
  },
  "start_time": "2026-06-29T10:19:07",
  "end_time": "2026-06-29T18:22:41",
  "duration_seconds": 29014.5,
  "status": "success",
  "signals_processed": 492,
  "trades_count": 492,
  "klines_processed": 536186,
  "accounts": [
    {
      "strategy_id": "ICT_1D_3_BTCUSDT",
      "cash": 289918.32,
      "total_equity": 389918.32,
      "peak_equity": 391204.11,
      "max_drawdown": 0.0239,
      "position_count": 0,
      "trade_count": 246
    }
  ],
  "metrics": {
    "total_return": 2.8991,
    "roe": 2.8991,
    "annualized_return": 2.787,
    "sharpe_ratio": 2.6685,
    "sortino_ratio": 16.2332,
    "max_drawdown": 0.0238,
    "win_rate": 0.8861,
    "profit_factor": 8.7068,
    "total_trades": 246,
    "winning_trades": 218,
    "losing_trades": 28,
    "avg_trade_pnl": 1178.53,
    "largest_win": 9466.43,
    "largest_loss": -4681.94,
    "avg_win": 1502.46,
    "avg_loss": 1343.5,
    "trading_days": 373
  }
}
```

**顶层字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `config.start_date` | string | 回测区间开始日期 `YYYY-MM-DD`。**同时是列表页的分组键之一** |
| `config.end_date` | string | 回测区间结束日期 `YYYY-MM-DD`。同上 |
| `config.initial_cash` | number | 初始资金 |
| `config.symbols` | string[] | 本次回测的交易对列表 |
| `config.name` | string | 回测名称，前端不展示，可自定义 |
| `start_time` | string | 回测开始时间（ISO 8601） |
| `end_time` | string | 回测结束时间（ISO 8601）。**作为列表页"完成时间"列与默认排序依据**；缺失时回退为目录的 `{YYYYMMDD}T{HHMMSS}` |
| `duration_seconds` | number | 回测耗时（秒） |
| `status` | string | 运行状态，如 `success` |
| `signals_processed` | number | 处理的信号数。**为 `0` 时前端不展示该回测**（空回测） |
| `trades_count` | number | 成交笔数 |
| `klines_processed` | number | 处理的 K 线根数 |
| `accounts[0]` | object | 账户快照，前端取第一个元素 |

**accounts[0] 字段**（全部可选，仅详情页展示）

| 字段 | 类型 | 说明 |
|------|------|------|
| `strategy_id` | string | 策略实例标识 |
| `cash` | number | 期末可用资金 |
| `total_equity` | number | 期末总权益 |
| `peak_equity` | number | 峰值权益 |
| `max_drawdown` | number | 最大回撤（小数，`0.0239` = 2.39%） |
| `position_count` | number | 期末持仓数 |
| `trade_count` | number | 成交笔数 |

**metrics 字段**（全部可选。比率类均为**小数**，前端乘 100 显示为百分比）

| 字段 | 类型 | 展示位置 | 说明 |
|------|------|---------|------|
| `annualized_return` | number | 三层均展示 | 年化收益率。列表页的「最佳年化」取组内各标的的最大值 |
| `roe` | number | 标的层、详情页 | 净资产收益率 |
| `total_return` | number | 标的层、详情页 | 总收益率 |
| `max_drawdown` | number | 标的层、详情页 | 最大回撤 |
| `win_rate` | number | 标的层、详情页 | 胜率 |
| `total_trades` | number | 标的层、详情页 | 总交易数 |
| `sharpe_ratio` | number | 标的层、详情页 | 夏普比率（原值，不转百分比） |
| `sortino_ratio` | number | 详情页 | 索提诺比率 |
| `profit_factor` | number | 详情页 | 盈亏比 |
| `winning_trades` / `losing_trades` | number | 详情页 | 盈利 / 亏损交易数 |
| `avg_trade_pnl` | number | 详情页 | 平均每笔盈亏（金额） |
| `largest_win` / `largest_loss` | number | 详情页 | 最大单笔盈利 / 亏损（金额） |
| `avg_win` / `avg_loss` | number | 详情页 | 平均盈利 / 亏损（金额） |
| `trading_days` | number | 详情页 | 交易天数 |

> 前 7 项会被索引生成器摘取到 `backtest-output-index.json` 中，供列表页直接读取；其余字段由详情页按需读取原始 JSON。metrics 允许包含表中未列出的自定义字段，前端忽略。

#### backtest_equity.csv

权益曲线，**首行必须是表头**（前端以 `date` 开头校验，否则视为无效数据）。

```csv
date,equity,cash
2025-01-01,100000,100000
2025-01-02,100523.4,80523.4
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 日期 `YYYY-MM-DD` |
| `equity` | number | 当日总权益 |
| `cash` | number | 当日可用资金 |

详情页把权益曲线与同期日线收盘价（读 `kline-data/1d/{SYMBOL}_1d.csv`）叠加对比，并据此计算回撤曲线。

#### 历史记录与分组规则

前端保留**全部**历史回测，列表页按以下规则把 run 聚合成行：

**分组键 = 策略 + 回测区间 + 启动日期 + 同日轮次**

「同日轮次」是自动推导的，无需在数据中标记：同一策略同一天内的 run 按 `{HHMMSS}` 升序处理，每个 run 归入第一个"尚未包含该交易对"的轮次。因此：

| 数据情况 | 列表页表现 |
|---------|-----------|
| 一天跑一批多个标的（各标的 `{HHMMSS}` 不同） | 合并为 **1 行**，标的聚合展示 |
| 同一标的当天重跑一次 | 拆成 **2 行**，各有独立的完成时间与指标 |
| 不同日期运行 | 各自成行 |
| 相同日期但回测区间不同 | 各自成行 |

这样逐个标的启动回测（`{HHMMSS}` 相差几秒）不会让列表碎片化，同时同一标的的重跑记录也不会被覆盖。

列表默认按**完成时间倒序**（最新的回测在最前）。行数超过 20 时自动分页。

#### 索引文件

`public/backtest-output-index.json` 由 Vite 插件在启动时自动扫描生成，**无需手动维护**，也不要提交到版本库。开发期间新的回测完成后会自动刷新。

其结构由前端自动产生，仅供参考：

```jsonc
{
  "generated_at": "2026-08-13T07:10:02.262Z",
  "entries": [
    {
      "strategy": "cta_ict_v3",
      "symbol": "BTCUSDT",
      "date": "20260629",          // 目录名
      "time": "101907",            // 目录名
      "path": "cta_ict_v3/20260629/101907/BTCUSDT",
      "sweep": 0,                  // 同日轮次（自动推导）
      "start_date": "2025-01-01",
      "end_date": "2026-06-29",
      "completed_at": "2026-06-29T18:22:41",
      "signals_processed": 492,
      "metrics": { "annualized_return": 2.787, "roe": 2.8991, "total_return": 2.8991,
                   "max_drawdown": 0.0238, "win_rate": 0.8861, "total_trades": 246,
                   "sharpe_ratio": 2.6685 }
    }
  ]
}
```

---

## strategies.json（策略元数据）

策略的中文名、简介、逻辑说明与默认技术指标由**数据源提供**，前端不内置——这些属于使用方的策略资产。

位置：`public/frontend-data/strategies.json`（**全局一份，非每日**）。文件缺失时前端仍可正常工作，只是策略名显示为原始标识、指标用默认值。

### 格式

顶层是一个对象，**键为策略目录名**，与 `manifest.json` 中的 `source_strategy` 对应：

```json
{
  "my_strategy_v1": {
    "display_name": "均线突破",
    "description": "EMA 金叉入场 + ATR 止损",
    "indicators": ["EMA", "ATR", "RSI"],
    "indicator_params": {
      "EMA": { "fast_period": 12, "slow_period": 26 },
      "ATR": { "period": 14 }
    },
    "logic": {
      "entry": ["EMA 快线上穿慢线", "成交量 > 均量"],
      "exit": ["ATR 止损", "移动止盈"],
      "risk": ["单日最大亏损限制", "趋势过滤"]
    }
  }
}
```

### 字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `display_name` | string | 否 | 中文显示名。缺省时显示原始策略标识 |
| `description` | string | 否 | 策略简介 |
| `indicators` | string[] | 否 | 该策略关注的指标，决定详情页默认勾选项。缺省时默认勾选 `RSI`/`MACD`/`ATR` |
| `indicator_params` | object | 否 | 指标参数覆盖，形如 `{ "EMA": { "fast_period": 100 } }`。缺省时各指标用自身默认参数 |
| `logic.entry` | string[] | 否 | 入场条件，逐条展示 |
| `logic.exit` | string[] | 否 | 出场条件 |
| `logic.risk` | string[] | 否 | 风控规则 |

所有字段均为可选：只提供 `display_name` 也是合法配置。`logic` 三段缺失时，策略逻辑区显示「策略逻辑未配置，请查看策略代码」。

### 可用的指标名

`indicators` 与 `indicator_params` 的键须是前端已实现的指标，否则被忽略：

`RSI`、`MACD`、`ATR`、`EMA`、`BOLL`、`KD`、`ADX`、`OBV`、`Donchian`、`Envelope`、`SMA`

### 键的匹配规则

1. 先用 `source_strategy` 精确匹配键（推荐：直接用目录名作键）
2. 未命中时，将 `source_strategy` 去下划线并大写后再匹配一次（如 `obv_atr_v2` → `OBVATRV2`），兼容以缩写为键的配置

推荐直接用目录名作键，无需额外映射表。

## 数据准备检查清单

接入自有数据时，确认以下文件就绪：

- [ ] `public/frontend-data/YYYYMMDD/manifest.json` — 每日策略清单
- [ ] `public/frontend-data/YYYYMMDD/{strategy}/{SYMBOL}/positions.json` — 持仓数据（无仓位时为 `[]`）
- [ ] `public/frontend-data/YYYYMMDD/{strategy}/{SYMBOL}/backtest.json` — 回放数据（可选）
- [ ] `public/frontend-data/YYYYMMDD/{strategy}/{SYMBOL}/comparison.json` — 对比报告（可选）
- [ ] `public/frontend-data/trading_data/trading_positions_YYYYMMDD.csv` — 策略表现数据（可选，需要"策略表现"页时准备）
- [ ] `public/kline-data/{period}/{SYMBOL}_{period}.csv` — K线行情
- [ ] `public/backtest-output/{strategy}/{YYYYMMDD}/{HHMMSS}/{SYMBOL}/backtest_result.json` — 回测结果（可选，需要"策略发现"页时准备）
- [ ] `public/backtest-output/.../backtest_equity.csv` — 回测权益曲线（可选，详情页曲线需要）
- [ ] `public/frontend-data/strategies.json` — 策略元数据（可选，用于展示策略中文名与逻辑说明）

**最低运行要求**：只要有 `manifest.json`、`positions.json`（可为空数组）和 K线 CSV，前端即可运行并展示 K 线图。其他数据文件按需提供，缺失时前端优雅降级。
