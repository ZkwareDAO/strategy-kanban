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

# 建立数据目录（可以是真实目录，也可以是指向你的数据目录的符号链接）
ln -s /path/to/your-data/frontend-data   public/frontend-data     # 策略、持仓、对比（必需）
ln -s /path/to/your-data/kline           public/kline-data        # K线行情（必需）
ln -s /path/to/your-data/backtest_output public/backtest-output   # 历史回测（可选，策略发现页）
```

> 这些目录均在 `vite.config.ts` 的 `server.watch.ignored` 中，并设置了
> `followSymlinks: false`，避免 Vite 监听大体量数据耗尽 inotify（`ENOSPC`）。
> 这只影响文件监听，不影响静态文件 serving。

各目录的字段规范与最小可运行配置见 [DATA-SPEC.md](DATA-SPEC.md) 与 [DEPLOYMENT.md](DEPLOYMENT.md)。

### 用示例数据快速起步

没有真实数据（或只是想改 UI）时，用生成器铺一套虚拟数据即可跑通全部页面：

```bash
npm run sample-data
npm run dev
```

数据全部由程序合成，日期跟随运行当天，因此永远落在各页面的默认日期窗口内。
若 `public/` 下已有指向真实数据的符号链接，脚本会跳过不覆盖。
生成器本身的说明见 [DATA-SPEC.md 的「参考实现」一节](DATA-SPEC.md)。

## 可用命令

<!-- AUTO-GENERATED:scripts -->
| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（默认端口 3000，局域网用 `-- --host`） |
| `npm run build` | `vue-tsc -b` 类型检查 + `vite build` 生产构建（产物在 `dist/`） |
| `npm run preview` | 预览生产构建 |
| `npm run sample-data` | 生成示例数据（虚拟数据，用于无真实数据时起步） |
| `npm test` | 运行单元测试（watch 模式） |
| `npm run test:run` | 运行单元测试（单次） |
| `npm run test:coverage` | 运行单元测试并生成覆盖率报告 |
| `npm run type-check` | `vue-tsc --noEmit` 类型检查（不产出文件） |
<!-- /AUTO-GENERATED:scripts -->

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
| `/` | `StrategyOverview`（策略表格 / 回测详情 tab） |
| `/detail/:strategy/:symbol` | `TokenDetail`（V1） |
| `/detail-v2/:strategy/:symbol` | `TokenDetailV2`（数据分离版） |

详见 [README.md](../README.md)、[DATA-SPEC.md](DATA-SPEC.md) 与 [RUNBOOK.md](RUNBOOK.md)。

## PR 检查清单

- [ ] `npm run type-check` 通过
- [ ] `npm run test:run` 通过，新增功能有测试，覆盖率 ≥ 80%
- [ ] 无 `console.log` / 调试代码 / 硬编码密钥
- [ ] 提交信息遵循 Conventional Commits（`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`）
- [ ] 文档与代码同步（路由、命令、数据源变更需更新 README / RUNBOOK）
- [ ] 分支已 rebase 到目标分支，无合并冲突
