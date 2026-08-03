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
                                                         │  trading-review-         │
                                                         │  frontend/public/data    │
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
git clone <repo-url> trading-review-frontend
cd trading-review-frontend

# 2. 安装依赖
npm install

# 3. 建立数据符号链接（关键步骤）
rm -rf public/data
ln -s /path/to/cta-strategy-code/signal_comparison_output public/data

# 4. 启动（局域网访问用开发模式即可）
npm run dev -- --host
#    或后台运行：
#    nohup npm run dev -- --host > logs/frontend.log 2>&1 &
```

访问 `http://<机器IP>:3000`。

### 更新前端代码

```bash
cd /path/to/trading-review-frontend
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

## 健康检查

| 检查项 | 方法 |
|--------|------|
| 前端服务 | `curl http://localhost:3000` 返回 HTML |
| 数据符号链接 | `ls -la public/data` 应显示 `->` 指向数据源 |
| 当日数据 | `ls public/data/$(date +%Y%m%d)/` 应有 manifest.yaml |
| 仓位索引 | `cat public/data/$(date +%Y%m%d)/pnl/positions_index.json` 有 runtimes |
| 回测索引 | `cat public/data/$(date +%Y%m%d)/backtest_results/index.json` 有 runs |

## 常见问题

### 策略列表为空

1. 检查符号链接是否有效：`ls -la public/data`
2. 检查当日 `positions_index.json` 是否生成：见上方健康检查
3. 检查 `daily_backtest_sync.sh` 日志：`logs/daily_comparison_*.log`

### 某策略显示但代币不可点击（半透明）

该 runtime 无仓位数据（`positions_index.json` 中无对应条目）。属于正常现象--下个版本会将 K线数据与仓位数据分离。

### 点击代币后 K线图空白

当前 K线数据与仓位数据耦合，无仓位则无 K线。临时方案：等待该策略产生仓位；长期方案：数据分离（规划中）。

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
