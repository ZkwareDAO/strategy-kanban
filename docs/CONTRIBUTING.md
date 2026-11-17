# Contributing

交易策略复盘前端的开发贡献指南。

## 开发环境

### 前置条件

- **Node.js**（推荐通过 nvm 管理）
- **npm**
- 一份符合 [DATA-SPEC.md](DATA-SPEC.md) 的数据（本项目只消费静态文件，数据如何产出不做限制）。
  手上没有数据时可用 `npm run sample-data` 生成虚拟数据，见下方「用示例数据快速起步」

### 初始化

```bash
git clone <repo-url> strategy-kanban
cd strategy-kanban
npm install

# 建立数据目录（可以是复制进来的真实目录，也可以是指向数据目录的符号链接）
ln -s /path/to/your-data/frontend-data public/frontend-data   # 策略、持仓、信号、回测（必需）
ln -s /path/to/your-data/kline-data    public/kline-data      # K线行情（必需）
```

`datasource.config.json` 是**可提交的通用默认配置**（默认 `/frontend-data`、`/kline-data`）。
本机真实路径不要改这个文件，统一写入已忽略的 `.env.local`：

```bash
# .env.local（不提交）
DATA_ROOT=/path/to/data
VITE_DATA_FRONTEND_BASE_URL=/frontend-data-v2
VITE_DATA_KLINE_BASE_URL=/kline-data-v2
```

软链名可以是 `frontend-data-v2` 等自定义名称，只要与 `VITE_DATA_FRONTEND_BASE_URL` 一致。

> 这些目录应加入 `vite.config.ts` 的 `server.watch.ignored`，并保持
> `followSymlinks: false`，避免 Vite 监听大体量数据耗尽 inotify（`ENOSPC`）。
> 这只影响文件监听，不影响静态文件 serving。

### 大文件 K 线（可选）

Vite 静态服务对大 CSV 的 HTTP Range 支持不完整；`1m` K 线较大时，二分读取会退化为
整文件加载。需要完整的逐字节 Range 时，额外启动只读数据服务：

```bash
# 终端 1
DATA_ROOT=/path/to/data npm run dev:data   # 默认 127.0.0.1:3001
# 终端 2
npm run dev
```

Vite 通过 `/kline-data-v2` 代理到该服务。生产环境对应 Nginx/CDN 的 Range 支持，
不需要该脚本。

各目录的字段规范与最小可运行配置见 [DATA-SPEC.md](DATA-SPEC.md) 与 [DEPLOYMENT.md](DEPLOYMENT.md)。

### 用示例数据快速起步

没有真实数据（或只是想改 UI）时，用生成器铺一套虚拟数据即可跑通全部页面：

```bash
npm run sample-data
npm run dev
```

数据全部由程序合成，日期跟随运行当天。脚本默认链接到 `public/frontend-data` 与
`public/kline-data`；若这些路径已被真实数据占用会跳过不覆盖。使用自定义数据 URL 时，
需要把 `datasource.config.json` 临时切回上述默认名称，或手动把示例目录链到当前配置名。

## 可用命令

<!-- AUTO-GENERATED:scripts -->
| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（默认端口 3000，局域网用 `-- --host`） |
| `npm run dev:data` | 启动只读静态数据服务（Range/CORS，默认 `127.0.0.1:3001`，供大 K 线使用） |
| `npm run build` | `vue-tsc -b` 类型检查 + `vite build` 生产构建（产物在 `dist/`） |
| `npm run preview` | 预览生产构建 |
| `npm run sample-data` | 生成示例数据（虚拟数据，用于无真实数据时起步） |
| `npm test` | 运行单元测试（watch 模式） |
| `npm run test:run` | 运行单元测试（单次） |
| `npm run test:coverage` | 运行单元测试并生成覆盖率报告 |
| `npm run type-check` | `vue-tsc --noEmit` 类型检查（不产出文件） |
<!-- /AUTO-GENERATED:scripts -->

## 配置与环境变量

数据源主配置在 `datasource.config.json`（`data` / `kline` / `paths`）。
以下环境变量优先级高于 JSON：

<!-- AUTO-GENERATED:env -->
| 变量 | 必需 | 说明 | 示例 |
|------|------|------|------|
| `VITE_DATA_FRONTEND_BASE_URL` | 否 | 覆盖 `data.frontendBaseUrl` | `https://data.example.com/frontend-data` |
| `VITE_DATA_KLINE_BASE_URL` | 否 | 覆盖 `data.klineBaseUrl` | `https://data.example.com/kline-data` |
| `VITE_DATA_SERVER` | 否 | `dev:data` 代理目标 | `http://127.0.0.1:3001` |
| `VITE_API_POSITION_TARGET` | 否 | 遗留 `/api/position` 代理目标 | `https://api.example.com` |
| `VITE_API_POSITION_PREFIX` | 否 | 遗留代理路径前缀 | `/api/position` |
<!-- /AUTO-GENERATED:env -->

## 测试

- 框架：**Vitest** + `@vue/test-utils` + `happy-dom`
- 测试文件与源码**同目录**，命名 `*.test.ts`
- 运行：`npm run test:run`（单次）/ `npm run test:coverage`（覆盖率）
- 覆盖率目标：≥ 80%
- 示例数据生成器的测试为 `scripts/sample-data/sample-data.test.mjs`（`.mjs`，与脚本同目录）

### 测试结构（AAA 模式）

```typescript
test('returns empty array when no markets match query', () => {
  // Arrange
  const markets = [{ symbol: 'BTCUSDT', mode: 'LIVE' }]

  // Act
  const result = filterMarkets(markets, 'ETHUSDT')

  // Assert
  expect(result).toEqual([])
})
```

测试名应描述被测行为，而非被测函数名。

## 代码风格

- **Vue 3** `<script setup>` + **TypeScript**（严格类型，禁用 `any`）
- **不可变优先**：返回新对象，不就地修改；`update(obj, field, value)` 而非 `modify`
- **KISS / DRY / YAGNI**：先写能跑的最简方案，真实重复出现时再抽象
- **小文件**：200–400 行为宜，800 行上限；按领域（feature/domain）组织而非按类型
- **命名**：变量/函数 `camelCase`（布尔用 `is`/`has`/`should`/`can`）；接口/类型/组件 `PascalCase`；常量 `UPPER_SNAKE_CASE`；composable `use*`
- **错误处理**：边界显式校验输入，显式处理错误，不静默吞异常
- **早返回**优于深层嵌套（>4 层需重构）
- 无 `console.log`/调试语句残留；无硬编码密钥

## 技术栈

- **Vue 3** + **TypeScript** + **Vite**
- **Pinia** 状态管理 / **Vue Router** 路由
- **Element Plus** UI
- **Plotly.js** 蜡烛图 / **ECharts** + **vue-echarts** 趋势图
- **axios** / **papaparse** / **dayjs** / **js-yaml**

## 路由

| 路径 | 页面 |
|------|------|
| `/` | `StrategyOverview`（每日收益 / 每日回放 / 区间统计 / 策略发现 tab） |
| `/detail/:strategy/:symbol` | `TokenDetail`（V1，遗留） |
| `/detail-v2/:strategy/:symbol` | `TokenDetailV2`（v2 K 线技术指标页） |
| `/backtest-detail/:strategy/:symbol` | `BacktestDetail`（回测结果 + `daily_equity`） |
| `/performance-detail/:strategyName` | `PerformanceDetail`（区间统计下钻） |
| `/backtest-token-list` | `BacktestTokenList`（策略发现标的列表） |
| `/replay-token-list` | `ReplayTokenList`（每日回放标的列表） |

详见 [README.md](../README.md)、[DATA-SPEC.md](DATA-SPEC.md) 与 [RUNBOOK.md](RUNBOOK.md)。

## PR 检查清单

- [ ] `npm run type-check` 通过
- [ ] `npm run test:run` 通过，新增功能有测试，覆盖率 ≥ 80%
- [ ] 无 `console.log` / 调试代码 / 硬编码密钥
- [ ] 提交信息遵循 Conventional Commits（`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`）
- [ ] 文档与代码同步（路由、命令、数据源变更需更新 README / RUNBOOK）
- [ ] 分支已 rebase 到目标分支，无合并冲突
