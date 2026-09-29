# YouTube 频道观察站

这是一个不在浏览器暴露 API Key 的静态看板。页面只读取 `public/data/dashboard.json`；采集器使用环境变量里的 `YOUTUBE_API_KEY` 访问 YouTube Data API，再重写这份公开数据快照。

## 添加频道

将频道链接添加到 `config/channels.json`。支持频道 ID、`/channel/UC...`、`/@handle` 和旧式 `/user/...` 链接。

```json
{
  "channels": [
    { "url": "https://www.youtube.com/@example", "label": "可选显示名称" }
  ]
}
```

## 采集

在本机或定时任务的安全环境中设置 `YOUTUBE_API_KEY`，再运行：

```powershell
python scripts/collect_youtube.py
```

建议每 3 小时运行一次。历史快照在 7 天内保留 3 小时间隔，30 天内保留每日值，之后保留每周值。不要把 API Key 写入代码、JSON 或仓库。
