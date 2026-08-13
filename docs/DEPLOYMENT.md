# 部署运行指南（局域网）

本文档描述如何在本机或局域网内运行交易复盘前端项目。

数据格式规范见 [DATA-SPEC.md](./DATA-SPEC.md)。

---

## 环境要求

| 项目 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 20（推荐 22 / 24） | Vite 8 要求 Node 20+ |
| npm | >= 10 | 随 Node 安装 |
| 操作系统 | Linux / macOS / Windows | Linux 下注意 inotify 限制（见常见问题） |

检查版本：

```bash
node -v
npm -v
```

---

## 快速开始

### 1. 安装依赖

```bash
git clone <仓库地址>
cd strategy-kanban
npm install
```

### 2. 准备数据目录

前端从 `public/` 下的三个路径读取数据。有两种方式：

**方式 A：软链接指向外部数据目录（推荐）**

适合数据由其他程序生成、体积较大的场景：

```bash
# 必需：策略清单、持仓、回放、对比、策略表现数据
ln -s /绝对路径/你的数据目录/frontend_data public/frontend-data

# 必需：K线行情数据（目录下按周期分子目录：1m/5m/15m/1h/4h/1d）
ln -s /绝对路径/你的行情目录 public/kline-data

# 可选：历史回测结果（"策略发现"页需要）
# 目录结构：{策略}/{YYYYMMDD}/{HHMMSS}/{代币}/backtest_result.json
ln -s /绝对路径/你的回测目录 public/backtest-output
```

**方式 B：直接放真实目录**

适合数据量小、手动维护的场景：

```bash
mkdir -p public/frontend-data public/kline-data
# 然后按 DATA-SPEC.md 的结构放入文件
```

> 这三个路径已在 `.gitignore` 中，不会被提交，每台机器需单独配置。

### 3. 验证数据就位

```bash
ls public/frontend-data/          # 应看到 YYYYMMDD 日期目录 和 trading_data/
ls public/kline-data/             # 应看到 1m/ 5m/ 1h/ 等周期目录
ls public/kline-data/1m/ | head   # 应看到 BTCUSDT_1m.csv 等文件
```

软链接如果显示为红色或断链，说明目标路径不存在，需重新创建。

### 4. 启动开发服务器

```bash
npm run dev
```

启动后输出类似：

```
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.1.100:3000/
```

- **本机访问**：打开 `http://localhost:3000`
- **局域网访问**：同网段其他设备打开 `Network` 那个地址

`vite.config.ts` 中已设置 `host: true`，默认监听所有网卡，局域网内可直接访问，无需额外配置。

### 5. 修改端口（可选）

启动时临时指定：

```bash
npm run dev -- --port 8080
```

或编辑 `vite.config.ts` 永久修改：

```typescript
server: {
  host: true,
  port: 3000,   // 改成你需要的端口
}
```

---

## 生产模式运行（局域网）

如果需要更好的性能（构建产物已压缩、无 HMR 开销）：

```bash
npm run build      # 类型检查 + 构建到 dist/
npm run preview -- --host
```

`npm run preview` 默认监听 4173 端口，加 `--host` 后局域网可访问。

> **注意**：`npm run build` 只打包 `src/` 代码，**不会**把 `public/` 下软链接指向的数据复制进 `dist/`。`npm run preview` 仍从 `public/` 读取数据，所以软链接必须保留。

---

## 页面与数据依赖

不是所有页面都需要全部数据。缺失数据时对应页面会优雅降级（显示空状态而非报错）：

| 页面 | 需要的数据 | 缺失时表现 |
|------|-----------|-----------|
| 实盘表现（首页） | `frontend-data/{date}/manifest.json` | 显示"暂无策略数据" |
| ├─ 表现列统计 | `frontend-data/trading_data/*.csv` | 表现列显示 `—` |
| └─ 代币标签 | `frontend-data/{date}/{strategy}/{symbol}/positions.json` | 标签半透明但仍可点击 |
| K线详情页 | `kline-data/{period}/{SYMBOL}_{period}.csv` | 提示"所选范围内无K线数据" |
| ├─ 仓位叠加 | `positions.json` | 纯 K 线模式，无开平仓标记 |
| ├─ 回放对比 | `backtest.json` | 显示"无回放数据" |
| └─ 信号对比报告 | `comparison.json` | 不显示对比模块 |
| 策略表现页 | `frontend-data/trading_data/*.csv` | 显示"暂无策略表现数据" |
| 策略发现页（列表） | `backtest-output/**/backtest_result.json` | 显示"暂无回测数据" |
| ├─ 代币列表 | 同上（按索引筛选，无额外文件） | 显示"该区间暂无回测数据" |
| └─ 回测详情 | `backtest_result.json` | 指标显示 `-` |
| &nbsp;&nbsp;&nbsp;&nbsp;└─ 权益曲线 | `backtest_equity.csv` | 显示"无权益曲线数据"，指标仍正常 |

**最小可运行配置**：只要有 `manifest.json` + 一份对应交易对的 K 线 CSV，就能启动并查看蜡烛图。

---

## 配置策略信息

前端需要一份策略配置来展示中文名称、策略逻辑和默认技术指标。

编辑 `src/config/strategies.ts`：

1. **删除或替换** `STRATEGY_CONFIGS` 数组中的示例策略
2. 按你的策略添加配置（字段说明见 [DATA-SPEC.md 的策略配置格式](./DATA-SPEC.md)）
3. 如果策略目录名的缩写与 `source_strategy` 不一致，在同文件的 `STRATEGY_DIR_MAP` 中添加映射

未配置的策略仍可正常显示，只是：
- 策略名显示为原始标识（如 `dolphin_trading_v2`）
- 默认加载 RSI / MACD / ATR 三个指标
- 策略逻辑区显示"策略逻辑未配置，请查看策略代码"

修改后 Vite 会热更新，无需重启。

---

## 环境变量

项目根目录的 `.env` 是**可选的**。当前版本前端已与后端 API 解耦，所有数据从静态文件读取，`.env.example` 中的 `VITE_API_POSITION_*` 是遗留配置，不配置也能正常运行。

如需保留后端代理（例如你自行扩展了 API 调用）：

```bash
cp .env.example .env
# 编辑 .env 填入实际地址
```

---

## 常见问题

### 启动时报 ENOSPC / inotify 错误

Linux 下 Vite 监听文件数量受 inotify 限制。项目已在 `vite.config.ts` 中关闭对数据目录的监听（`followSymlinks: false` + `ignored` 列表），正常情况不会触发。如仍报错，提高系统限制：

```bash
sudo sysctl fs.inotify.max_user_watches=524288
# 永久生效
echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf
```

### 局域网设备访问不了

1. 确认 `npm run dev` 输出中有 `Network:` 地址（没有说明 `host` 未启用）
2. 检查本机防火墙是否放行端口：
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 3000
   # CentOS/RHEL
   sudo firewall-cmd --add-port=3000/tcp --permanent && sudo firewall-cmd --reload
   ```
3. 确认访问设备与本机在同一网段

### K线图显示空白

1. 检查软链接是否有效：`ls -la public/kline-data`
2. 确认对应交易对的 CSV 存在：`ls public/kline-data/1m/ | grep BTCUSDT`
3. 打开浏览器开发者工具 Network 面板，看 `/kline-data/...` 请求是否 404
4. 确认 CSV 首行是表头、数据按时间升序、时间戳带时区（如 `2026-08-09 00:00:00+00:00`）

### 页面显示"暂无策略数据"

1. 确认 `public/frontend-data/{选中日期}/manifest.json` 存在
2. 日期选择器默认是昨天，如果那天没数据需手动切到有数据的日期
3. 检查 manifest.json 格式：必须是 `{"date": "...", "strategies": [...]}`，`strategies` 不能为空数组

### 表现列全是 `—`

说明 `public/frontend-data/trading_data/trading_positions_{date}.csv` 不存在或为空。这份数据是可选的，不影响其他功能。

### 修改数据文件后页面没更新

数据目录被排除在 HMR 之外（避免监听大量文件），需手动刷新浏览器。

### 策略发现页显示"暂无回测数据"

1. 检查软链接：`ls -la public/backtest-output`
2. 确认目录层级是 `{策略}/{YYYYMMDD}/{HHMMSS}/{代币}/`（四层，缺一层扫不到）
3. 确认叶子目录里有 `backtest_result.json` —— 只有它存在才算"回测完成"
4. 若回测存在却不显示，检查 `signals_processed` 是否为 `0`（空回测按设计不展示）
5. 查看索引是否生成：`cat public/backtest-output-index.json`，`entries` 应非空。索引在 `npm run dev` 启动时生成，新增回测后会自动刷新

### 回测详情页没有权益曲线

缺少 `backtest_equity.csv`，或其首行不是表头 `date,equity,cash`。该文件是可选的，其余指标不受影响。

---

## 命令参考

```bash
npm run dev           # 启动开发服务器（支持局域网访问）
npm run build         # 类型检查 + 构建到 dist/
npm run preview       # 预览构建产物
npm run type-check    # 仅做 TypeScript 类型检查
npm run test          # 运行测试（watch 模式）
npm run test:run      # 运行测试（单次）
npm run test:coverage # 运行测试并生成覆盖率报告
```
