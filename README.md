# Trading Review Frontend

交易策略复盘前端。读取 `cta-strategy-code` 项目生成的静态数据（K线、仓位、回测、信号对比），提供策略概览与代币详情可视化。

## 技术栈

- **Vue 3** `<script setup>` + **TypeScript**
- **Vite** 构建
- **Pinia** 状态管理
- **Element Plus** UI 组件
- **Plotly.js** 蜡烛图（`TechnicalChart.vue`）/ **ECharts** + **vue-echarts** ROI/价格趋势图
- **Vitest** 单元测试

## 架构概览

```
cta-strategy-code (数据源)
  └── signal_comparison_output/{date}/
        ├── manifest.yaml              # 所有 runtime 定义
        ├── pnl/kline/{runtime}/       # 仓位 + K线 CSV
        │   └── positions_index.json   # 有仓位的 runtime 索引（脚本生成）
        ├── backtest_results/          # 回测数据
        │   └── index.json             # 回测索引（脚本生成）
        └── comparisons/               # 信号对比 JSON
            ▲
            │ 符号链接 (public/data -> signal_comparison_output)
            ▼
trading-review-frontend (本项目)
  └── public/data/{date}/  ->  静态 fetch  ->  Vue 应用
```

本项目无后端，所有数据通过 `fetch('/data/{date}/...')` 读取静态文件。

## 路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | `StrategyOverview` | 策略概览（页面1）：「策略表格 / 回测详情」tab，展示所有策略、代币、仓位统计 |
| `/detail/:strategy/:symbol` | `TokenDetail` | 代币详情（V1）：蜡烛图、ROI/价格趋势、技术指标、回放对比 |
| `/detail-v2/:strategy/:symbol` | `TokenDetailV2` | 代币详情（V2 数据分离版）：K线与仓位解耦，纯K线模式可选叠加仓位/回测 |

## 可用命令

<!-- AUTO-GENERATED:scripts -->
| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（默认端口 3000） |
| `npm run build` | 类型检查 + 生产构建（产物在 `dist/`） |
| `npm run preview` | 预览生产构建 |
| `npm test` | 运行单元测试（watch 模式） |
| `npm run test:run` | 运行单元测试（单次） |
| `npm run test:coverage` | 运行单元测试并生成覆盖率报告 |
| `npm run type-check` | TypeScript 类型检查（不产出文件） |
<!-- /AUTO-GENERATED:scripts -->

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 建立数据符号链接（指向数据源）
ln -s /path/to/cta-strategy-code/signal_comparison_output public/data

# 3. 启动开发服务器
npm run dev
```

## 生产部署（局域网）

本项目通过符号链接直接读取数据源，无需额外同步：

```bash
cd /path/to/trading-review-frontend
npm install
npm run build

# 数据符号链接
rm -rf public/data
ln -s /path/to/cta-strategy-code/signal_comparison_output public/data

# 启动（开发模式即可用于局域网访问）
npm run dev -- --host
```

数据源每天由 `cta-strategy-code/scripts/daily_backtest_sync.sh` 自动生成，前端即时读取最新数据。

详见 [docs/RUNBOOK.md](docs/RUNBOOK.md)。

## 数据源约定

### Runtime 命名

格式：`{PREFIX}_{TIMEFRAME}_{VERSION}_{SYMBOL}_{MODE}`

- **MODE**: `LIVE` / `PAPER` / `SMOKING`

### 前缀映射

Manifest 与实际数据目录的前缀可能不一致，前端在 `src/models/runtime.ts` 中维护映射：

| Manifest 前缀 | 实际目录前缀 | 策略名 |
|---------------|-------------|--------|
| `EMARSIPULLBACK` | `ERP` | `ema_rsi_pullback` |
| `REGIMEDONCHIANATR` | `RDATR` | `regime_donchian_atr` |
| `VWAPCHANNELMOMENTUM` | `VWAPMOM` | `vwap_channel_momentum` |
| `DOLPHIN` | `DOLPHINV2` | `dolphin_trading_v2`（不同版本 runtime，同策略） |

策略页面显示映射后的短名（`display_name`）。

### 策略展示逻辑

- 合并 `manifest.yaml`（所有策略）与 `positions_index.json`（有仓位的策略），展示**所有**策略
- 有仓位数据的代币标签正常显示且可点击；无仓位的半透明淡化、不可点击
- 颜色按交易模式区分：`live`=红、`paper_trading`=橙、`smoking`=蓝

## 测试

```bash
npm run test:run        # 单次运行
npm run test:coverage   # 覆盖率
```

测试文件与源码同目录，命名为 `*.test.ts`。
