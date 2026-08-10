# 数据规范

本文档描述交易复盘前端项目所需的全部数据，包括目录结构、文件格式和字段含义。

只要按本规范准备好数据文件，放入 `public/` 对应目录即可运行，不依赖任何特定的后端或策略框架。

---

## 目录结构

前端通过静态文件服务读取数据，需在 `public/` 下建立以下目录（可为真实目录或符号链接）：

```
public/
├── frontend-data/                  # 策略与持仓数据根目录
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
└── backtest-output/                # 历史回测结果（可选）
    └── ...
```

### 目录说明

| 静态路径 | 必需 | 说明 |
|---------|------|------|
| `public/frontend-data` | 是 | 策略、持仓、对比、策略表现数据，按本规范组织 |
| `public/kline-data` | 是 | K线 CSV 文件，按周期分目录 |
| `public/backtest-output` | 否 | 回测结果，用于回测详情页 |

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

策略表现页面的订单/仓位数据，每日一份 CSV。**仅需包含前端使用的 7 个字段**，其余订单系统元数据（user_id、order_id、leverage、margin 等）无需存储。

前端按日期范围读取多日文件并在浏览器端聚合统计（按策略、按交易对计算胜率、盈亏等），无需后端 API。

```csv
asset,strategy_name,pos_type,pnl_value,deleted,created_at,close_time
BTCUSDT,NEWOBV_4H_1_BTCUSDT,2,1.092,0,2026-08-06T04:01:03+08:00,
BTCUSDT,DOLPHINV2_4H_2_BTCUSDT,2,50.0,1,2026-08-06T16:45:00+08:00,2026-08-06T23:22:00+08:00
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

## 策略配置格式

除数据文件外，前端还需要一份策略配置，用于展示策略的中文名称、逻辑说明和默认技术指标。配置位于前端源码 `src/config/strategies.ts`，部署前根据自有策略编辑。

### 配置接口

```typescript
interface StrategyConfig {
  /** 策略前缀，匹配 manifest.json 中的 strategy 目录名或 runtime_name 前缀 */
  strategy_prefix: string

  /** 中文显示名 */
  display_name: string

  /** 策略简介 */
  description: string

  /** 使用的技术指标列表（须是前端已实现的指标） */
  indicators: IndicatorType[]

  /** 指标参数覆盖（可选） */
  indicator_params?: Record<string, Record<string, unknown>>

  /** 策略逻辑（中文描述，展示在详情页可展开的"策略逻辑"区域） */
  logic: {
    /** 开仓条件列表 */
    entry: string[]
    /** 平仓条件列表 */
    exit: string[]
    /** 风控规则列表 */
    risk: string[]
  }
}
```

### 完整示例

```typescript
{
  strategy_prefix: 'DOLPHINV2',
  REDACTED
  REDACTED
  indicators: ['ATR', 'EMA', 'MACD'],
  indicator_params: {
    ATR: { period: 14 },
    REDACTED
  },
  logic: {
    entry: [
      REDACTED
      REDACTED
      REDACTED
    ],
    exit: [
      REDACTED
      REDACTED
    ],
    risk: [
      REDACTED
      REDACTED
      REDACTED
    ],
  },
}
```

### 支持的技术指标

`indicators` 字段只能使用以下前端已实现的指标：

| 指标 | 说明 |
|------|------|
| `RSI` | 相对强弱指标 |
| `MACD` | 指数平滑异同移动平均线 |
| `ATR` | 平均真实波幅 |
| `EMA` | 指数移动平均线 |
| `BOLL` | 布林带 |
| `KD` | 随机指标 |
| `ADX` | 平均趋向指数 |
| `OBV` | 能量潮 |
| `Donchian` | 唐奇安通道 |
| `Envelope` | 包络线 |
| `SMA` | 简单移动平均线 |

### 配置匹配规则

前端通过 `manifest.json` 中的 `source_strategy` 查找策略配置：

1. 先查 `STRATEGY_DIR_MAP`（source_strategy → strategy_prefix 的映射）
2. 未命中时，将 source_strategy 去掉下划线并大写作为 prefix 匹配

| source_strategy | 匹配到的 prefix | 说明 |
|-----------------|----------------|------|
| `dolphin_trading_v2` | `DOLPHINV2` | 去下划线大写即可 |
| `new_dolphin` | `NEWDOLPHIN` | 同上 |
| `ema_rsi_pullback` | `ERP` | 缩写名不同，需在 DIR_MAP 显式配置 |
| `vwap_channel_momentum` | `VWAPMOM` | 同上 |

对于缩写名与目录名不一致的策略，在 `STRATEGY_DIR_MAP` 中添加映射：

```typescript
const STRATEGY_DIR_MAP: Record<string, string> = {
  ema_rsi_pullback: 'ERP',
  regime_donchian_atr: 'RDATR',
  vwap_channel_momentum: 'VWAPMOM',
  sar_snt3_v3: 'SAR_SNT3_V3',
}
```

未匹配到配置的策略：
- 显示 source_strategy 作为名称
- 默认加载 `RSI`、`MACD`、`ATR` 三个指标
- 策略逻辑区域显示"策略逻辑未配置，请查看策略代码"

---

## 数据准备检查清单

接入自有数据时，确认以下文件就绪：

- [ ] `public/frontend-data/YYYYMMDD/manifest.json` — 每日策略清单
- [ ] `public/frontend-data/YYYYMMDD/{strategy}/{SYMBOL}/positions.json` — 持仓数据（无仓位时为 `[]`）
- [ ] `public/frontend-data/YYYYMMDD/{strategy}/{SYMBOL}/backtest.json` — 回放数据（可选）
- [ ] `public/frontend-data/YYYYMMDD/{strategy}/{SYMBOL}/comparison.json` — 对比报告（可选）
- [ ] `public/frontend-data/trading_data/trading_positions_YYYYMMDD.csv` — 策略表现数据（可选，需要"策略表现"页时准备）
- [ ] `public/kline-data/{period}/{SYMBOL}_{period}.csv` — K线行情
- [ ] `src/config/strategies.ts` 中添加了自有策略的配置

**最低运行要求**：只要有 `manifest.json`、`positions.json`（可为空数组）和 K线 CSV，前端即可运行并展示 K 线图。其他数据文件按需提供，缺失时前端优雅降级。
