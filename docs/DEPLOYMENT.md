# 部署指南（frontend-data v2）

前端是纯静态应用，可独立部署到任意静态服务器；数据可放在另一台静态服务器/CDN。

## 1. 构建

```bash
npm install
npm run build
# 产物在 dist/
```

## 2. 数据源配置

编辑项目根目录 `datasource.config.json`：

```json
{
  "data": {
    "frontendBaseUrl": "https://data.example.com/frontend-data",
    "klineBaseUrl": "https://data.example.com/kline-data"
  }
}
```

或构建时用环境变量覆盖：

```bash
VITE_DATA_FRONTEND_BASE_URL=https://data.example.com/frontend-data \
VITE_DATA_KLINE_BASE_URL=https://data.example.com/kline-data \
npm run build
```

相对路径（`/frontend-data`）适用于前端与数据同域部署。

## 3. 数据服务器要求

- `frontend-data` 与 `kline-data` 按 [DATA-SPEC.md](./DATA-SPEC.md) 布局；
- 允许 GET；跨域时配置 `Access-Control-Allow-Origin`；
- K 线 CSV 需支持 HTTP Range（`Accept-Ranges: bytes`，返回 206）；
- 建议对 CSV 设置 `Cache-Control: no-cache` 或短缓存，数据更新后前端“重新加载”即可。

Nginx 示例：

```nginx
location /frontend-data/ {
  root /srv;
  add_header Access-Control-Allow-Origin *;
  add_header Cache-Control "no-cache";
}

location /kline-data/ {
  root /srv;
  add_header Access-Control-Allow-Origin *;
  add_header Accept-Ranges bytes;
}
```

Nginx 静态文件默认支持 Range；反向代理到对象存储时需确认 206 透传。

## 4. 前端静态服务

```nginx
server {
  listen 80;
  server_name review.example.com;
  root /srv/trading-review-frontend/dist;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

## 5. 本地/局域网运行

```bash
npm run dev
# 默认 host: true，监听所有网卡
```

## 6. 页面数据依赖

| 页面 | 依赖 |
|---|---|
| 每日收益 | `{day}/manifest.csv` + `live_positions.csv` |
| 区间统计 | `catalog.csv` + 区间内 `live_positions.csv` |
| 每日回放 | `{day}/backtest_runs.csv`（`source=replay`） |
| 策略发现 | `discovery/runs.csv`（回退 `{day}/backtest_runs.csv` 的 discovery 行） |
| 回测详情 | `backtest_results/{runStamp}/{symbol}.json`（+ 权益曲线） |
| K 线页 | `meta.json`、positions/signals/comparison、`kline-data` |

缺失文件按空数据处理，页面显示空态，不会报错。

## 7. 部署检查

```bash
curl -I https://data.example.com/frontend-data/catalog.csv
curl -I -H 'Range: bytes=0-0' https://data.example.com/kline-data/1m/BTCUSDT_1m.csv
# 第二条期望 206
```

前端打开后：

- 每日收益/区间统计有数据；
- 点击标的进入 K 线页，信号点与原因可见；
- 每日回放/策略发现进入标的列表与回测详情；
- 不存在任何前端生成的索引文件。

## 8. 升级提示

- v2 不再读取 `manifest.json`、`positions.json`、`backtest.json`、`comparison.json`、
  `trading_data/*.csv`、`backtest-output-index.json`、`replay-index.json`；
- 旧的 `public/backtest-output`、`public/data` 软链可以移除；
- 新增策略无需修改前端映射。
