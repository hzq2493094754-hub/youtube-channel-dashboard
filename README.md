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

参考看板的运行模式已加入：历史快照在 7 天内保留 3 小时间隔，30 天内保留每日值，之后保留每周值。不要把 API Key 写入代码、JSON 或仓库。

## 本机自动采集

第一次配置时，用当前 Windows 用户的 DPAPI 加密保存密钥：

```powershell
$key = Read-Host 'YouTube API Key' -AsSecureString
.\scripts\set_youtube_key.ps1 -ApiKey $key
```

手动刷新：

```powershell
.\scripts\update_dashboard.ps1
```

安装每天 08:30 运行一次的 Windows 计划任务（本机应使用北京时间）：

```powershell
.\scripts\install_refresh_task.ps1
```

密钥只保存在 `.secrets/youtube-api-key.dpapi`，并且不会进入 Git、网页或数据快照。频道头像会优先缓存为数据 URI；当本机网络无法读取图片源时，看板会自动改用频道首字标识，不会显示破图。

## GitHub Pages 自动发布

仓库内的 `.github/workflows/publish-pages.yml` 会在每次推送后发布网页。定时采集和发布在 GitHub 云端执行，无需本机开机，时间均为北京时间：

- YouTube 自有频道、对标频道与四个公开抖音榜单每天 08:30 统一采集并发布。
- 抖音板块展示四个榜单：热点榜 50 条、社会榜 50 条、实时热点 30 条、飙升热点 30 条。各榜单保留独立采集时间；单个来源失败时保留该榜单上次有效数据，其他来源继续更新。
- 同一板块还展示热点宝内容词：近 1／7／30 天各前 200 条，支持搜索、排序、单词热度曲线和 CSV 导出。该来源需要本机专用浏览器登录后采集，再同步发布，不在云端自动登录。页面显示每个周期的实际采集时间与平台日期；曲线缺失日期不补零，指数与曲线使用各自的平台原值。

内容词采集完成后运行 `node tools/douyin-local/export-dashboard.cjs`，将本机三种周期最近的有效快照校验并合并到 `dist/data/douyin-hotwords.json`，然后发布该数据文件。导出只保留公开内容词字段；专用浏览器登录目录、账号信息与 Cookie 不进入发布目录。每日云端公开榜单刷新会保留这份内容词快照。

推送更新或手动运行工作流时会刷新两类数据。GitHub 定时任务可能因排队延迟，页面显示最近一次成功采集的时间；采集失败时保留上次有效数据。

首次连接 GitHub 后，请在仓库网页完成三项一次性设置：

1. `Settings` → `Pages` → `Build and deployment` → `Source`：选择 **GitHub Actions**。
2. `Settings` → `Secrets and variables` → `Actions`：新建名为 `YOUTUBE_API_KEY` 的 repository secret，并粘贴你的 YouTube Data API 密钥。
3. `Settings` → `Actions` → `General` → `Workflow permissions`：选择 **Read and write permissions**，让定时任务能把新快照提交回仓库。

之后到 `Actions` 页面手动运行一次 **Refresh and publish dashboard**；页面地址将是：

`https://hzq2493094754-hub.github.io/youtube-channel-dashboard/`

不要把 API 密钥提交到仓库、Issue、README 或网页配置中。
