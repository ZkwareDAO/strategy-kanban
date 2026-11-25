# Runbook（frontend-data v2）

## 1. 启动

```bash
npm install

# 大 K 线需要正确的 HTTP Range 时（可选）
DATA_ROOT=/path/to/data npm run dev:data   # 终端 1，127.0.0.1:3001

npm run dev                                 # 终端 2，http://localhost:3000
```

`dev:data` 是只读静态数据服务，不做任何 K 线处理；生产环境由 Nginx/CDN 承担。

<!-- AUTO-GENERATED:scripts -->
| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器（端口 3000） |
| `npm run dev:data` | 启动只读静态数据服务（Range/CORS，端口 3001） |
| `npm run build` | 类型检查 + 生产构建（`dist/`） |
| `npm run preview` | 预览生产构建 |
| `npm run sample-data` | 生成虚拟示例数据 |
| `npm test` | Vitest watch 模式 |
| `npm run test:run` | Vitest 单次运行 |
| `npm run test:coverage` | 覆盖率报告 |
| `npm run type-check` | `vue-tsc --noEmit` |
<!-- /AUTO-GENERATED:scripts -->

## 2. 数据准备

数据目录可以放在任意位置，通过 `datasource.config.json` 指向：

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
  }
}
```

本地开发通常把数据软链到 `public/`，并把真实路径写入 `.env.local`（已忽略，不提交）：

```bash
ln -s /path/to/frontend-data public/frontend-data-v2
ln -s /path/to/kline-data    public/kline-data-v2

# .env.local
DATA_ROOT=/path/to/data
VITE_DATA_FRONTEND_BASE_URL=/frontend-data-v2
VITE_DATA_KLINE_BASE_URL=/kline-data-v2
```

`datasource.config.json` 只保留通用默认值，不应写入机器路径。
也可以直接填写绝对 URL（如 `https://data.example.com/frontend-data`），
此时数据侧需允许 CORS，K 线需支持 Range。

环境变量优先于 JSON：

| 变量 | 说明 |
|------|------|
| `DATA_ROOT` | 本机数据根，供 `dev:data` 与 Vite `fs.allow` 使用 |
| `VITE_DATA_FRONTEND_BASE_URL` | 覆盖 `data.frontendBaseUrl` |
| `VITE_DATA_KLINE_BASE_URL` | 覆盖 `data.klineBaseUrl` |
| `VITE_DATA_SERVER` | `dev:data` 代理目标（默认 `http://127.0.0.1:3001`） |

## 3. 页面与数据源

| 页面 | 数据文件 |
|---|---|
| 每日收益 | `{day}/manifest.csv` + 各策略 `live_positions.csv` |
| 区间统计 | `catalog.csv` + 区间内各策略 `live_positions.csv` |
| 每日回放 | `{day}/backtest_runs.csv`（`source=replay`，`is_latest=1`） |
| 策略发现 | `discovery/runs.csv`；缺失时回退每天 `backtest_runs.csv`（`source=discovery`） |
| 标的列表 | 选中批次的 runs |
| 回测详情 | `backtest_results/{runStamp}/{symbol}.json`（含 `daily_equity`） |
| K 线页 | `meta.json`、positions/signals/comparison + `kline-data` |

跳转链路：

- 每日收益标的点击 → K 线页；
- 区间统计“更多” → K 线页；
- 每日回放/策略发现“更多” → 标的列表 → 回测详情（不接 K 线）。

## 4. 新策略接入

不需要改前端任何映射。数据侧生成：

1. `catalog.csv` 当天 `strategies` 增加策略目录名；
2. `{day}/manifest.csv` 增加策略 × 标的行；
3. `{day}/{strategy}/meta.json` 提供展示名/指标/逻辑；
4. positions/signals/comparison 按契约输出。

前端以策略目录名 `{strategy}` 作为统一键。

## 5. 示例数据

```bash
npm run sample-data            # 生成并链接 public/
npm run sample-data -- --days 30 --no-link
```

生成 `sample-data/frontend-data`（v2，含 `discovery/` 与结果 JSON 的 `daily_equity`）
与 `sample-data/kline-data`，全部为虚拟数据。脚本默认链接到 `public/frontend-data` /
`public/kline-data`；若当前 `datasource.config.json` 使用自定义名称，需要同步切换配置或
手动建立软链。

## 6. 自检

```bash
npm run type-check
npm run test:run
```

数据侧检查（以当前配置的 URL 为准）：

```bash
FB=$(node -p "require('./datasource.config.json').data.frontendBaseUrl")
curl -I "http://localhost:3000$FB/catalog.csv"
```

K 线 Range：

```bash
KB=$(node -p "require('./datasource.config.json').data.klineBaseUrl")
curl -i -H 'Range: bytes=0-0' "http://localhost:3000$KB/1m/CL_1m.csv"
# 期望 206 + Content-Range，且 Content-Length 为 1
```

数据服务健康检查：

```bash
curl -I -H 'Range: bytes=0-0' http://127.0.0.1:3001/data/klines/1m/CL_1m.csv
```

## 7. 常见问题

| 现象 | 排查 |
|---|---|
| 每日收益空 | `{day}/manifest.csv` 是否存在、`data_day` 是否为目标日期 |
| 区间统计空 | `catalog.csv` 是否覆盖区间、策略是否有 `live_positions.csv` |
| 每日回放空 | `backtest_runs.csv` 是否有 `source=replay` 且 `is_latest=1` |
| 策略发现空 | 数据源是否产出 `source=discovery` 的回测 |
| 回测详情空 | `run_stamp` 与 URL 是否一致；结果 JSON 是否存在 |
| K 线只有部分周期 | 聚合 CSV 缺失时前端会从 `1m` 聚合；检查 `basePeriod` 与 Range |
| 指标开头缺失 | 预热区间不足：查看页面告警与 `kline.maxWarmupDays` |
| K 线页很慢 | 确认 `dev:data` 在运行且 Range 返回 `Content-Length: 1`；否则会整文件加载 |
| 数据是旧目录 | 检查 `datasource.config.json` 与 `public/` 软链是否指向同一数据源 |

## 8. 回滚

- **数据源切换回滚**：恢复上一版 `datasource.config.json` 的
  `frontendBaseUrl` / `klineBaseUrl`（以及对应软链），刷新页面或点“重新加载”。
- **前端发布回滚**：重新部署上一版 `dist/`；静态资源可整体替换，无需数据库迁移。
- **缓存**：页面读取有内存 LRU；回滚后刷新即可，无需清理服务端。

## 9. 已知边界

- 前端不再生成/读取任何索引 JSON；
- 不再监听数据变化，数据更新后刷新页面或点“重新加载”；
- 结果 JSON 缺少 `daily_equity` 时回测详情显示“无权益曲线数据”。
