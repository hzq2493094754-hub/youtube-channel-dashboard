const $ = (id) => document.getElementById(id);
const COLORS = ["#6f8ea6", "#8b7fa3", "#7f9c91", "#7699a0", "#8492ab", "#6d91aa", "#91969c", "#8aa7b2", "#a18496", "#7e91a7", "#b09a73", "#789c9a"];
const compact = new Intl.NumberFormat("zh-HK", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const dateOnly = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" });
let data = { channels: [], catalog: [], benchmarks: [], benchmarkCatalog: [], generatedAt: null };
const state = { workspace: "owned", subscriberPeriod: "all", viewsPeriod: "30", trendPeriod: "30", trendMetric: "views", trendChannels: new Set(), trendAllMode: true, breakdownMode: "bar", videoPeriod: "7", videoSort: "desc", videoChannels: new Set(), subscriberGrowthPeriod: "all", subscriberGrowthChannels: new Set(), subscriberGrowthAllMode: true, insightPeriod: "7", insightChannels: new Set(), insightAllMode: true, lifecycleVideoId: null, benchmarkSubscriberPeriod: "all", benchmarkViewsPeriod: "30", benchmarkVideoPeriod: "7", benchmarkVideoSort: "desc", benchmarkVideoChannels: new Set(), benchmarkInsightPeriod: "7", benchmarkInsightChannels: new Set(), benchmarkInsightAllMode: true, benchmarkLifecycleVideoId: null, benchmarkSubscriberGrowthPeriod: "all", benchmarkSubscriberGrowthChannels: new Set(), benchmarkSubscriberGrowthAllMode: true, benchmarkTrendPeriod: "30", benchmarkTrendMetric: "views", benchmarkTrendChannels: new Set(), benchmarkTrendAllMode: true, benchmarkBreakdownMode: "bar" };

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#111820" : "#e8edf3");
  const toggle = $("themeToggle");
  if (!toggle) return;
  toggle.setAttribute("aria-pressed", String(isDark));
  toggle.setAttribute("aria-label", isDark ? "切换至白天模式" : "切换至夜间模式");
  toggle.querySelector(".theme-toggle-icon").textContent = isDark ? "☀" : "☾";
  toggle.querySelector(".theme-toggle-label").textContent = isDark ? "白天模式" : "夜间模式";
}

function initialiseTheme() {
  let saved = null;
  try { saved = localStorage.getItem("yt-dashboard-theme"); } catch (_) { /* Storage can be disabled by the browser. */ }
  applyTheme(saved === "dark" ? "dark" : "light");
}

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const fmt = (value) => number(value) == null ? "—" : compact.format(Number(value));
const exact = (value) => number(value) == null ? "—" : integer.format(Number(value));
const signedExact = (value) => number(value) == null ? "—" : `${Number(value) > 0 ? "+" : ""}${exact(value)}`;
const signedPercent = (value) => `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
const at = (value) => new Date(value).getTime();
const asOf = () => at(data.generatedAt) || Date.now();
const day = (value) => dateOnly.format(new Date(value));
const time = (value) => value ? dateTime.format(new Date(value)).replace(",", "") : "—";
const periodName = (value) => value === "all" ? "全部记录" : `近 ${value} 日`;
const periodStart = (value) => value === "all" ? -Infinity : asOf() - Number(value) * 86400000;
const initial = (row) => Array.from(row.name || "频")[0] || "频";

function avatar(row) {
  const source = row.avatarDataUrl || row.avatar || "";
  return `<span class="mini-avatar" aria-hidden="true">${esc(initial(row))}${source ? `<img src="${esc(source)}" alt="" onerror="this.remove()">` : ""}</span>`;
}

function videoThumb(row) {
  return `<span class="video-thumb">▶${row.thumbnail ? `<img src="${esc(row.thumbnail)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`;
}

function channelHistory(channel) {
  const rows = [...(channel.history || [])].filter((row) => row.observedAt && Number.isFinite(at(row.observedAt)));
  rows.push({ observedAt: data.generatedAt, subscriberCount: channel.subscriberCount, channelViews: channel.channelViews });
  return rows.sort((a, b) => at(a.observedAt) - at(b.observedAt));
}

function baseline(channel, period) {
  const rows = channelHistory(channel).filter((row) => number(row.subscriberCount) != null);
  if (!rows.length) return null;
  if (period === "all") return rows[0];
  const cutoff = periodStart(period);
  return rows.find((row) => at(row.observedAt) >= cutoff) || rows[0];
}

function subscriberDelta(channel, period) {
  const current = number(channel.subscriberCount);
  const start = baseline(channel, period);
  return current == null || !start ? null : current - Number(start.subscriberCount);
}

function videosFor(channelId, period = "all") {
  const start = periodStart(period);
  return data.catalog.filter((row) => row.channelId === channelId && at(row.publishedAt) >= start && at(row.publishedAt) <= asOf());
}

function windowViews(channel, period) {
  if (period === "all") return number(channel.channelViews) || 0;
  return videosFor(channel.id, period).reduce((sum, row) => sum + (number(row.viewCount) || 0), 0);
}

function earliestCoverage() {
  const starts = data.channels.map((channel) => channelHistory(channel).find((row) => number(row.subscriberCount) != null)).filter(Boolean).map((row) => at(row.observedAt));
  return starts.length ? Math.max(...starts) : asOf();
}

function elapsed(start) {
  const hours = Math.max(0, Math.floor((asOf() - start) / 3600000));
  const days = Math.floor(hours / 24);
  return `${days ? `${days} 天` : ""}${days ? " " : ""}${hours % 24} 小时`;
}

function renderDonut(targetId, rows, centerLabel, detail) {
  const target = $(targetId);
  target.classList.remove("has-active");
  const usable = rows.filter((row) => row.value > 0);
  const circumference = 2 * Math.PI * 90;
  let offset = 0;
  const total = usable.reduce((sum, row) => sum + row.value, 0);
  const circles = usable.map((row) => {
    const size = total ? row.value / total * circumference : 0;
    const part = `<circle class="donut-segment" data-channel="${esc(row.channel.name)}" cx="120" cy="120" r="90" fill="none" stroke="${row.color}" stroke-width="28" stroke-dasharray="${size} ${circumference - size}" stroke-dashoffset="${-offset}" transform="rotate(-90 120 120)" tabindex="0" role="img" aria-label="${esc(row.channel.name)} ${esc(detail(row))}"></circle>`;
    offset += size;
    return part;
  }).join("");
  target.innerHTML = `<div class="donut-wrap"><svg viewBox="0 0 240 240" aria-label="占比图"><circle class="donut-empty" cx="120" cy="120" r="90"></circle>${circles}</svg><div class="donut-center"><strong>${fmt(total)}</strong><span>${esc(centerLabel)}</span></div><div class="tooltip" hidden></div></div><div class="legend">${rows.map((row) => `<button class="legend-item" data-channel="${esc(row.channel.name)}" type="button"><i style="background:${row.color}"></i><span>${esc(row.channel.name)}</span><b>${fmt(row.value)}</b></button>`).join("")}</div>`;
  const tip = target.querySelector(".tooltip");
  const wrap = target.querySelector(".donut-wrap");
  const show = (name, event) => {
    const row = rows.find((item) => item.channel.name === name);
    if (!row) return;
    target.classList.add("has-active");
    target.querySelectorAll("[data-channel]").forEach((node) => node.classList.toggle("is-active", node.dataset.channel === name));
    tip.innerHTML = `<strong>${esc(row.channel.name)}</strong><span>${esc(detail(row))}</span>`;
    tip.hidden = false;
    const rect = wrap.getBoundingClientRect();
    const x = event?.clientX ? event.clientX - rect.left + 10 : wrap.clientWidth / 2 + 16;
    const y = event?.clientY ? event.clientY - rect.top + 10 : 28;
    tip.style.left = `${Math.max(8, Math.min(x, wrap.clientWidth - 195))}px`;
    tip.style.top = `${Math.max(8, Math.min(y, wrap.clientHeight - 64))}px`;
  };
  const hide = () => { tip.hidden = true; target.classList.remove("has-active"); target.querySelectorAll("[data-channel]").forEach((node) => node.classList.remove("is-active")); };
  target.querySelectorAll(".donut-segment,.legend-item").forEach((node) => {
    node.addEventListener("mouseenter", (event) => show(node.dataset.channel, event));
    node.addEventListener("mousemove", (event) => show(node.dataset.channel, event));
    node.addEventListener("mouseleave", hide);
    node.addEventListener("focus", () => show(node.dataset.channel));
    node.addEventListener("blur", hide);
  });
}

function renderSubscribers() {
  const period = state.subscriberPeriod;
  const coverage = earliestCoverage();
  const all = period === "all";
  const rows = data.channels.filter((channel) => number(channel.subscriberCount) != null).map((channel, index) => {
    const start = baseline(channel, period);
    const value = all ? Number(channel.subscriberCount) : subscriberDelta(channel, period);
    const rate = !all && number(start?.subscriberCount) > 0 ? Number(value || 0) / Number(start.subscriberCount) * 100 : null;
    return { channel, value, rate, color: COLORS[index % COLORS.length] };
  }).filter((row) => row.value != null).sort((a, b) => b.value - a.value);
  const fullyCovered = all || coverage <= periodStart(period);
  $("subscriberNote").textContent = fullyCovered ? `${rows.length} 个频道公开值` : `${rows.length} 个频道公开值 · 部分数据 ${elapsed(coverage)}`;
  $("subscriberPeriod").querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.period === period));
    if (button.dataset.period !== "all" && coverage > periodStart(button.dataset.period)) {
      const target = coverage + Number(button.dataset.period) * 86400000;
      const hours = Math.max(0, Math.ceil((target - Date.now()) / 3600000));
      button.title = `目前仅累积 ${elapsed(coverage)}；完整窗口约还需 ${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
      button.dataset.countdown = "true";
    } else { button.removeAttribute("title"); delete button.dataset.countdown; }
  });
  renderDonut("subscriberChart", rows, all ? "公开订阅 · 全部记录" : `订阅净增长 · ${periodName(period)}`, (row) => all ? `公开订阅：${exact(row.value)}` : `订阅净增长 ${exact(row.value)} · ${periodName(period)}增长率 ${row.rate == null ? "—" : signedPercent(row.rate)}`);
}

function renderViews() {
  const period = state.viewsPeriod;
  const all = period === "all";
  const rows = data.channels.map((channel, index) => ({ channel, value: windowViews(channel, period), videos: videosFor(channel.id, period).length, color: COLORS[index % COLORS.length] })).sort((a, b) => b.value - a.value);
  $("viewsNote").textContent = all ? "频道公开累计值" : `${periodName(period)}发布视频当前播放`;
  $("viewsPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.period === period)));
  renderDonut("viewsChart", rows, all ? "频道总播放 · 全部记录" : `视频播放 · ${periodName(period)}`, (row) => all ? `频道总播放：${exact(row.value)}` : `视频播放：${exact(row.value)} · 发布视频 ${row.videos} 条`);
}

function renderUpdates() {
  const rows = data.channels.map((channel) => {
    const videos = videosFor(channel.id, "7");
    return { channel, split: uploadSplit(videos) };
  }).sort((a, b) => b.split.total - a.split.total || a.channel.name.localeCompare(b.channel.name, "zh-HK"));
  const maximum = Math.max(1, ...rows.map((row) => row.split.total));
  const hasOther = rows.some((row) => row.split.other > 0);
  const total = rows.reduce((sum, row) => sum + row.split.total, 0);
  $("updateCount").textContent = `近 7 日 · ${rows.length} 个频道 · 共 ${exact(total)} 条更新`;
  $("updatesChart").innerHTML = rows.length ? rows.map((row) => {
    const width = row.split.total / maximum * 100;
    return `<div class="channel-update-row"><a class="channel-update-name" href="${esc(row.channel.url)}" target="_blank" rel="noopener noreferrer">${avatar(row.channel)}<span>${esc(row.channel.name)}</span></a><span class="channel-update-track" role="img" aria-label="${esc(row.channel.name)}：共 ${row.split.total} 条更新，长视频 ${row.split.long} 条，Shorts ${row.split.short} 条${row.split.other ? `，其他 ${row.split.other} 条` : ""}"><i class="upload-segment upload-segment--long" style="width:${width * row.split.long / Math.max(1, row.split.total)}%"></i><i class="upload-segment upload-segment--short" style="width:${width * row.split.short / Math.max(1, row.split.total)}%"></i>${row.split.other ? `<i class="upload-segment upload-segment--other" style="width:${width * row.split.other / Math.max(1, row.split.total)}%"></i>` : ""}</span><span class="channel-update-value"><b>${exact(row.split.total)} 条</b><small>长 ${row.split.long} · 短 ${row.split.short}${row.split.other ? ` · 其他 ${row.split.other}` : ""}</small></span></div>`;
  }).join("") : `<div class="empty">近 7 日没有已采集的视频。</div>`;
  $("updatesLegend").innerHTML = `<span><i class="series-dot upload-long-dot"></i>长视频</span><span><i class="series-dot upload-short-dot"></i>短视频</span>${hasOther ? `<span><i class="series-dot upload-other-dot"></i>其他</span>` : ""}`;
  $("updatesNote").textContent = `近 7 日 · 共 ${total} 条更新 · 带 #Shorts 标记或时长不超过 3 分钟归为短视频；直播、待播或缺少时长的项目仅计入总数。`;
}

function renderRecentUpdates() {
  const rows = data.catalog.filter((row) => at(row.publishedAt) >= periodStart("7") && at(row.publishedAt) <= asOf()).sort((a, b) => at(b.publishedAt) - at(a.publishedAt));
  $("recentUpdatesCount").textContent = `${exact(rows.length)} 条 · 最近发布优先`;
  $("recentUpdatesList").innerHTML = rows.length ? rows.map((row) => `<li><a class="update-link" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${videoThumb(row)}<span class="video-copy"><strong>${esc(row.title)}</strong><span class="video-meta"><b>${esc(row.channel)}</b><time>${time(row.publishedAt)}</time><span>${exact(row.viewCount)} 次播放</span></span></span><span class="outbound">↗</span></a></li>`).join("") : `<li class="empty">近 7 日没有已采集的视频。</li>`;
}

function allChannelIds() { return data.channels.map((channel) => channel.id); }
function channelChoices(targetId, selected, allAction, allMode = false) {
  const all = allChannelIds();
  const allSelected = selected.size === all.length;
  $(targetId).innerHTML = `<button type="button" data-action="${allAction}:all" aria-pressed="${allMode}">全部频道</button><button type="button" data-action="${allAction}:select" aria-pressed="${!allMode && allSelected}">全选</button>${data.channels.map((channel) => `<button class="channel-choice" type="button" aria-label="${esc(channel.name)}" data-action="${allAction}:${esc(channel.id)}" aria-pressed="${!allMode && selected.has(channel.id)}">${avatar(channel)}<span>${esc(channel.name)}</span></button>`).join("")}`;
}

function rangeKeys(period, metric) {
  let start = periodStart(period);
  if (period === "all") {
    const values = metric === "subscribers" ? data.channels.flatMap((channel) => channelHistory(channel).map((row) => at(row.observedAt))) : data.catalog.map((row) => at(row.publishedAt));
    start = values.length ? Math.min(...values) : asOf();
  }
  const output = [];
  for (let stamp = new Date(day(start)).getTime(); stamp <= asOf(); stamp += 86400000) output.push(day(stamp));
  return output.slice(-1095);
}

function valueForMetric(video, metric) {
  if (metric === "views") return number(video.viewCount) || 0;
  if (metric === "likes") return number(video.likeCount) || 0;
  if (metric === "comments") return number(video.commentCount) || 0;
  return 1;
}

function channelSeries(channel, keys, period, metric) {
  const values = new Map(keys.map((key) => [key, metric === "subscribers" ? null : 0]));
  if (metric === "subscribers") {
    const base = baseline(channel, period);
    channelHistory(channel).filter((row) => at(row.observedAt) >= periodStart(period) && number(row.subscriberCount) != null).forEach((row) => values.set(day(row.observedAt), Number(row.subscriberCount) - Number(base?.subscriberCount || row.subscriberCount)));
  } else {
    videosFor(channel.id, period).forEach((video) => { const key = day(video.publishedAt); if (values.has(key)) values.set(key, (values.get(key) || 0) + valueForMetric(video, metric)); });
  }
  return { id: channel.id, name: channel.name, color: COLORS[data.channels.findIndex((item) => item.id === channel.id) % COLORS.length], points: keys.map((key) => ({ key, value: values.get(key) })) };
}

function subscriberGrowthSeries(channel, keys, period) {
  const history = channelHistory(channel).filter((row) => number(row.subscriberCount) != null).sort((a, b) => at(a.observedAt) - at(b.observedAt));
  const base = baseline(channel, period);
  const baseValue = number(base?.subscriberCount);
  if (baseValue == null) return { id: channel.id, name: channel.name, color: COLORS[data.channels.findIndex((item) => item.id === channel.id) % COLORS.length], points: keys.map((key) => ({ key, value: null })), baseValue: null, currentValue: number(channel.subscriberCount), startedAt: null };
  const baseTime = at(base.observedAt), baseKey = day(base.observedAt);
  const dailySamples = new Map();
  history.filter((row) => at(row.observedAt) >= baseTime).forEach((row) => dailySamples.set(day(row.observedAt), Number(row.subscriberCount)));
  let latest = null;
  const points = keys.map((key) => {
    if (key === baseKey) latest = baseValue;
    else if (dailySamples.has(key)) latest = dailySamples.get(key);
    return { key, value: latest == null ? null : latest - baseValue };
  });
  return { id: channel.id, name: channel.name, color: COLORS[data.channels.findIndex((item) => item.id === channel.id) % COLORS.length], points, baseValue, currentValue: number(channel.subscriberCount), startedAt: base.observedAt };
}

function aggregateSeries(series, keys, label) {
  return { id: "aggregate", name: label, color: COLORS[0], points: keys.map((key, index) => ({ key, value: series.reduce((sum, row) => sum + (number(row.points[index]?.value) || 0), 0) })) };
}

function drawLineChart(targetId, series, metricLabel, detailSeries = series, tooltipSummary = null, detailCatalog = data.catalog) {
  const target = $(targetId);
  const points = series.flatMap((row) => row.points).filter((row) => number(row.value) != null);
  if (!points.length) { target.innerHTML = `<div class="empty">暂无可用数据。</div>`; return; }
  const width = Math.max(320, Math.round(target.getBoundingClientRect().width || 882)), height = 300, left = 54, right = 14, top = 18, bottom = 38;
  const count = Math.max(...series.map((row) => row.points.length));
  const values = points.map((row) => Number(row.value));
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const x = (index) => count < 2 ? left + (width - left - right) / 2 : left + index / (count - 1) * (width - left - right);
  const y = (value) => top + (max - Number(value)) / Math.max(1, max - min) * (height - top - bottom);
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = min + (max - min) * index / 4;
    const yy = y(value);
    return `<line x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"></line><text x="4" y="${yy + 4}">${fmt(value)}</text>`;
  }).join("");
  const dates = series[0].points;
  const axis = count > 1 ? `<text class="axis-date" text-anchor="start" x="${left}" y="${height - 11}">${dates[0].key}</text><text class="axis-date" text-anchor="end" x="${width - right}" y="${height - 11}">${dates[count - 1].key}</text>` : `<text class="axis-date" text-anchor="middle" x="${x(0)}" y="${height - 11}">${dates[0].key}</text>`;
  const lines = series.map((row) => {
    const path = row.points.map((point, index) => number(point.value) == null ? null : `${index ? "L" : "M"}${x(index)},${y(point.value)}`).filter(Boolean).join(" ");
    const dots = row.points.map((point, index) => number(point.value) == null ? "" : `<circle class="trend-point" data-index="${index}" data-id="${esc(row.id)}" cx="${x(index)}" cy="${y(point.value)}" r="4" fill="${row.color}"></circle>`).join("");
    return `<path d="${path}" fill="none" stroke="${row.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>${dots}`;
  }).join("");
  target.innerHTML = `<div class="trend-canvas"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(metricLabel)}趋势图"><g class="trend-grid">${grid}</g>${axis}${lines}<line class="trend-crosshair" hidden y1="${top}" y2="${height - bottom}"></line><rect class="trend-hitbox" x="${left}" y="${top}" width="${width - left - right}" height="${height - top - bottom}"></rect></svg><div class="trend-tooltip" hidden></div></div>`;
  const canvas = target.querySelector(".trend-canvas"), svg = target.querySelector("svg"), tip = target.querySelector(".trend-tooltip"), crosshair = target.querySelector(".trend-crosshair");
  const detailsFor = (row, key) => detailCatalog.filter((video) => video.channelId === row.id && day(video.publishedAt) === key);
  const show = (index, event) => {
    const list = detailSeries.map((row) => ({ row, point: row.points[index] })).filter((item) => number(item.point?.value) != null).sort((a, b) => Number(b.point.value) - Number(a.point.value));
    if (!list.length) return;
    const key = list[0].point.key;
    const detail = list.map(({ row, point }) => {
      const videos = detailsFor(row, key);
      const kinds = uploadSplit(videos);
      const summary = tooltipSummary ? tooltipSummary(row, point, key) : state.trendMetric === "uploads" ? `${videos.length} 条视频 · 长 ${kinds.long} / 短 ${kinds.short}${kinds.other ? ` / 其他 ${kinds.other}` : ""}` : videos.length ? `${videos.length} 条视频 · ${videos.slice(0, 2).map((video) => video.title).join(" · ")}` : "当天没有可展开的视频明细";
      return `<div class="trend-tooltip-row"><span><i style="background:${row.color}"></i>${esc(row.name)}</span><b>${fmt(point.value)}</b><small>${esc(summary)}</small></div>`;
    }).join("");
    tip.innerHTML = `<strong>${key} · ${esc(metricLabel)}</strong>${detail}`;
    tip.hidden = false;
    const rect = canvas.getBoundingClientRect();
    const proposedX = event.clientX - rect.left + 14;
    const proposedY = event.clientY - rect.top + 14;
    tip.style.left = `${Math.max(8, Math.min(proposedX, rect.width - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(proposedY, rect.height - tip.offsetHeight - 8))}px`;
    crosshair.hidden = false;
    crosshair.setAttribute("x1", String(x(index)));
    crosshair.setAttribute("x2", String(x(index)));
    target.querySelectorAll(".trend-point").forEach((dot) => dot.classList.toggle("is-nearest", Number(dot.dataset.index) === index));
  };
  svg.addEventListener("pointermove", (event) => {
    const rect = svg.getBoundingClientRect();
    const chartX = (event.clientX - rect.left) / rect.width * width;
    const index = Math.max(0, Math.min(count - 1, Math.round((chartX - left) / (width - left - right) * (count - 1))));
    show(index, event);
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; crosshair.hidden = true; target.querySelectorAll(".trend-point").forEach((dot) => dot.classList.remove("is-nearest")); });
}

function videoClass(video) {
  if (video.liveBroadcastContent === "live" || video.liveBroadcastContent === "upcoming" || number(video.durationSeconds) == null) return "other";
  const title = String(video.title || "");
  return /(?:^|\s)#shorts?\b/i.test(title) || Number(video.durationSeconds) <= 180 ? "short" : "long";
}

function uploadSplit(videos) {
  return videos.reduce((split, video) => {
    split[videoClass(video)] += 1;
    split.total += 1;
    return split;
  }, { long: 0, short: 0, other: 0, total: 0 });
}
function metricTotal(channel, period, metric) { if (metric === "subscribers") return subscriberDelta(channel, period); return videosFor(channel.id, period).reduce((sum, video) => sum + valueForMetric(video, metric), 0); }

function renderBreakdown(series, metricLabel) {
  const period = state.trendPeriod, metric = state.trendMetric;
  const target = $("breakdownBarChart");
  $("breakdownLineTitle").textContent = `各频道折线 · ${metricLabel}`;
  drawLineChart("breakdownLineChart", series, metricLabel, series);
  $("breakdownLineLegend").innerHTML = series.map((row) => `<span><i class="series-dot" style="background:${row.color}"></i>${esc(row.name)}</span>`).join("");
  $("breakdownLineNote").textContent = `${periodName(period)} · ${series.length} 个频道 · 按发布日期每日求和，并非当日新增量。`;
  $("breakdownBarTitle").textContent = `各频道柱状 · ${metricLabel}`;
  const chosen = state.trendAllMode ? data.channels : data.channels.filter((channel) => state.trendChannels.has(channel.id));
  const rows = chosen.map((channel) => {
    const videos = videosFor(channel.id, period);
    return { channel, value: metricTotal(channel, period, metric), videos, split: uploadSplit(videos) };
  }).sort((a, b) => (number(b.value) || -Infinity) - (number(a.value) || -Infinity));
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(number(row.value) || 0)));
  target.innerHTML = `<div class="breakdown-bars">${rows.map((row) => {
    const width = Math.abs(number(row.value) || 0) / maximum * 100;
    const stack = metric === "uploads"
      ? `<span class="bar-track stacked upload-stack" role="img" aria-label="${esc(row.channel.name)}：长视频 ${row.split.long} 条，Shorts ${row.split.short} 条${row.split.other ? `，其他 ${row.split.other} 条` : ""}"><i class="upload-segment upload-segment--long" style="width:${width * row.split.long / Math.max(1, row.split.total)}%"></i><i class="upload-segment upload-segment--short" style="width:${width * row.split.short / Math.max(1, row.split.total)}%"></i>${row.split.other ? `<i class="upload-segment upload-segment--other" style="width:${width * row.split.other / Math.max(1, row.split.total)}%"></i>` : ""}</span>`
      : `<span class="bar-track"><span style="width:${width}%;background:${row.channel.color || COLORS[data.channels.indexOf(row.channel) % COLORS.length]}"></span></span>`;
    const value = metric === "uploads"
      ? `<span class="metric-bar-value update-value"><b>${exact(row.split.total)} 条</b><small>长 ${row.split.long} · 短 ${row.split.short}${row.split.other ? ` · 其他 ${row.split.other}` : ""}</small></span>`
      : `<b class="metric-bar-value">${exact(row.value)}</b>`;
    return `<div class="metric-bar-row${metric === "uploads" ? " is-upload-breakdown" : ""}"><a class="metric-bar-channel" href="${esc(row.channel.url)}" target="_blank" rel="noopener noreferrer">${avatar(row.channel)}<span>${esc(row.channel.name)}</span></a>${stack}${value}</div>`;
  }).join("")}</div>`;
  const hasOtherUploads = rows.some((row) => row.split.other > 0);
  $("breakdownBarLegend").innerHTML = metric === "uploads" ? `<span><i class="series-dot upload-long-dot"></i>长视频</span><span><i class="series-dot upload-short-dot"></i>短视频</span>${hasOtherUploads ? `<span><i class="series-dot upload-other-dot"></i>其他</span>` : ""}` : "";
  $("breakdownBarNote").textContent = metric === "uploads"
    ? `${periodName(period)} · ${rows.length} 个频道 · 带 #Shorts 标记或时长不超过 3 分钟归为短视频，其余为长视频；直播、待播或缺少时长的项目仅计入总数。`
    : `${periodName(period)} · ${rows.length} 个频道 · 跟随上方指标与时间窗口；柱状图合计窗口内发布视频的最近累计值；折线按发布日期每日求和，并非当日新增量。`;
}

function renderTrend() {
  const metric = state.trendMetric, period = state.trendPeriod;
  const labels = { views: "播放量", subscribers: "新增订阅", likes: "点赞数量", comments: "评论数量", uploads: "更新数量" };
  const keys = rangeKeys(period, metric);
  const chosen = state.trendAllMode ? data.channels : data.channels.filter((channel) => state.trendChannels.has(channel.id));
  const source = chosen.map((channel) => channelSeries(channel, keys, period, metric));
  const all = state.trendAllMode;
  const main = chosen.length === 1 ? source : [aggregateSeries(source, keys, all ? "全部频道总和" : `所选频道总和 · ${chosen.length} 个频道`)];
  main.forEach((row) => { if (row.id === "aggregate") row.color = "#c6a96a"; });
  $("aggregateTitle").textContent = main[0]?.name || "全部频道总和";
  $("trendDescription").textContent = metric === "subscribers" ? `${periodName(period)} · ${main[0]?.name || "全部频道总和"}；公开订阅快照差值，历史不足时显示已累积区间。` : `${periodName(period)} · ${main[0]?.name || "全部频道总和"}；按视频发布日期每日求和，采用最近采集的累计值，并非当日新增量。`;
  $("trendPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  $("trendMetric").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === metric)));
  channelChoices("trendChannels", state.trendChannels, "trend", state.trendAllMode);
  drawLineChart("trendChart", main, labels[metric], source);
  const total = main[0]?.points.reduce((sum, point) => sum + (number(point.value) || 0), 0) || 0;
  $("trendLegend").innerHTML = main.map((row) => `<span><i class="series-dot" style="background:${row.color}"></i>${esc(row.name)} <b>${esc(labels[metric])} · ${exact(total)} · 窗口内合计</b></span>`).join("");
  renderBreakdown(source, labels[metric]);
}

function renderInventory() {
  const period = state.videoPeriod, start = periodStart(period), selected = state.videoChannels;
  const rows = data.catalog.filter((row) => at(row.publishedAt) >= start && at(row.publishedAt) <= asOf() && (!selected.size || selected.has(row.channelId))).sort((a, b) => state.videoSort === "asc" ? (number(a.viewCount) || 0) - (number(b.viewCount) || 0) : (number(b.viewCount) || 0) - (number(a.viewCount) || 0) || at(b.publishedAt) - at(a.publishedAt));
  $("videoPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  $("videoSort").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === state.videoSort)));
  channelChoices("videoChannels", selected, "video", selected.size === 0);
  $("allVideosCount").textContent = `${selected.size ? `已选 ${selected.size} 个频道` : "全部频道"} · ${periodName(period)}发布 · ${exact(rows.length)} 条视频`;
  $("allVideosList").innerHTML = rows.length ? rows.map((row) => `<li><a class="video-link" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${videoThumb(row)}<span class="video-copy"><strong>${esc(row.title)}</strong><span class="video-meta"><b>${esc(row.channel)}</b><time>${time(row.publishedAt)}</time></span></span><span class="views-cell"><b>${exact(row.viewCount)}</b><small>次播放</small></span></a></li>`).join("") : `<li class="empty">所选频道在该时间窗口内暂无已采集视频。</li>`;
}

function renderSubscriberGrowth() {
  const period = state.subscriberGrowthPeriod;
  const selected = state.subscriberGrowthAllMode ? data.channels : data.channels.filter((channel) => state.subscriberGrowthChannels.has(channel.id));
  const keys = rangeKeys(period, "subscribers");
  const series = selected.filter((channel) => number(channel.subscriberCount) != null).map((channel) => subscriberGrowthSeries(channel, keys, period));
  const populated = series.filter((row) => row.points.some((point) => number(point.value) != null));
  const starts = populated.map((row) => row.startedAt).filter(Boolean).map(at);
  $("subscriberGrowthPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  channelChoices("subscriberGrowthChannels", state.subscriberGrowthChannels, "subscriberGrowth", state.subscriberGrowthAllMode);
  $("subscriberGrowthDescription").textContent = `${periodName(period)} · 每条折线以该频道窗口内首个可用公开订阅快照为 0，展示之后的净变化。`;
  drawLineChart("subscriberGrowthChart", populated, "订阅净变化", populated, (row, point) => `订阅净变化 ${signedExact(point.value)} · 当前公开订阅 ${exact(row.currentValue)}`);
  $("subscriberGrowthLegend").innerHTML = populated.map((row) => {
    const latest = [...row.points].reverse().find((point) => number(point.value) != null)?.value;
    return `<span><i class="series-dot" style="background:${row.color}"></i>${esc(row.name)} <b>${signedExact(latest)} · 当前 ${exact(row.currentValue)}</b></span>`;
  }).join("");
  $("subscriberGrowthNote").textContent = populated.length
    ? `${periodName(period)} · 已选择 ${selected.length} 个频道，其中 ${populated.length} 个有公开订阅快照；共同可比较记录自 ${day(Math.max(...starts))} 起。未采集日沿用最近一次公开快照。`
    : `${periodName(period)} · 所选频道尚无可用的公开订阅历史快照。`;
}

function insightSource() {
  const chosen = state.insightAllMode ? data.channels : data.channels.filter((channel) => state.insightChannels.has(channel.id));
  const chosenIds = new Set(chosen.map((channel) => channel.id));
  const rows = data.catalog.filter((video) => chosenIds.has(video.channelId) && at(video.publishedAt) >= periodStart(state.insightPeriod) && at(video.publishedAt) <= asOf());
  return { chosen, rows };
}

function renderInsights() {
  const period = state.insightPeriod;
  const { chosen, rows } = insightSource();
  const viewCount = rows.reduce((sum, video) => sum + (number(video.viewCount) || 0), 0);
  const interactionCount = rows.reduce((sum, video) => sum + (number(video.likeCount) || 0) + (number(video.commentCount) || 0), 0);
  const engagement = viewCount ? interactionCount / viewCount * 1000 : null;
  $("insightPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  channelChoices("insightChannels", state.insightChannels, "insight", state.insightAllMode);
  $("insightsDescription").textContent = `${periodName(period)} · ${state.insightAllMode ? "全部频道" : `已选 ${chosen.length} 个频道`}的内容表现、互动密度与发布节奏。`;
  $("insightVideoCount").textContent = `${exact(rows.length)} 条视频`;

  const topVideos = [...rows].sort((a, b) => (number(b.viewCount) || 0) - (number(a.viewCount) || 0) || at(b.publishedAt) - at(a.publishedAt)).slice(0, 8);
  $("insightTopVideos").innerHTML = topVideos.length ? topVideos.map((video, index) => {
    const views = number(video.viewCount) || 0, likes = number(video.likeCount) || 0, comments = number(video.commentCount) || 0;
    const rate = views ? (likes + comments) / views * 1000 : null;
    return `<li><a href="${esc(video.url)}" target="_blank" rel="noopener noreferrer"><b class="insight-rank">${index + 1}</b>${videoThumb(video)}<span class="insight-video-copy"><strong>${esc(video.title)}</strong><span>${esc(video.channel)} · ${time(video.publishedAt)}</span></span><span class="insight-video-value"><b>${fmt(views)}</b><small>播放 · ${rate == null ? "—" : rate.toFixed(1)}‰ 互动</small></span></a></li>`;
  }).join("") : `<li class="empty">所选窗口内暂无已采集视频。</li>`;

  const engagementRows = chosen.map((channel) => {
    const videos = rows.filter((video) => video.channelId === channel.id);
    const views = videos.reduce((sum, video) => sum + (number(video.viewCount) || 0), 0);
    const interactions = videos.reduce((sum, video) => sum + (number(video.likeCount) || 0) + (number(video.commentCount) || 0), 0);
    return { channel, videos: videos.length, views, interactions, rate: views ? interactions / views * 1000 : null };
  }).filter((row) => row.rate != null).sort((a, b) => b.rate - a.rate || b.views - a.views);
  const maxRate = Math.max(1, ...engagementRows.map((row) => row.rate));
  $("insightEngagement").innerHTML = engagementRows.length ? engagementRows.map((row, index) => `<div class="insight-ranking-row"><span class="insight-rank">${index + 1}</span><a href="${esc(row.channel.url)}" target="_blank" rel="noopener noreferrer">${avatar(row.channel)}<span>${esc(row.channel.name)}</span></a><span class="insight-rate-track"><i style="width:${row.rate / maxRate * 100}%"></i></span><span class="insight-rate-value"><b>${row.rate.toFixed(1)}‰</b><small>${exact(row.interactions)} 次互动 · ${row.videos} 条</small></span></div>`).join("") : `<div class="empty">所选窗口内暂无可比较的播放与互动数据。</div>`;

  const split = uploadSplit(rows), total = Math.max(1, split.total);
  const mixPart = (label, count, kind) => `<span><i class="series-dot upload-${kind}-dot"></i><b>${label}</b><strong>${exact(count)} 条</strong><small>${(count / total * 100).toFixed(0)}%</small></span>`;
  $("insightMix").innerHTML = `<div class="content-mix-track" role="img" aria-label="内容结构：长视频 ${split.long} 条，Shorts ${split.short} 条，其他 ${split.other} 条"><i class="upload-segment upload-segment--long" style="width:${split.long / total * 100}%"></i><i class="upload-segment upload-segment--short" style="width:${split.short / total * 100}%"></i><i class="upload-segment upload-segment--other" style="width:${split.other / total * 100}%"></i></div><div class="content-mix-values">${mixPart("长视频", split.long, "long")}${mixPart("短视频", split.short, "short")}${mixPart("直播 / 其他", split.other, "other")}</div>`;

  const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const weekdays = Array(7).fill(0);
  rows.forEach((video) => { const weekday = (new Date(`${day(video.publishedAt)}T00:00:00Z`).getUTCDay() + 6) % 7; weekdays[weekday] += 1; });
  const maxWeekday = Math.max(1, ...weekdays);
  const peakIndex = weekdays.indexOf(Math.max(...weekdays));
  $("insightCadence").innerHTML = `<div class="cadence-heading"><b>发布节奏</b><span>最多发布：${weekdayLabels[peakIndex]} · ${exact(weekdays[peakIndex])} 条</span></div><div class="cadence-bars">${weekdays.map((count, index) => `<span title="${weekdayLabels[index]} ${count} 条"><i style="height:${Math.max(count ? 10 : 2, count / maxWeekday * 100)}%"></i><b>${exact(count)}</b><small>${weekdayLabels[index]}</small></span>`).join("")}</div>`;
  $("insightsNote").textContent = `${periodName(period)} · ${exact(rows.length)} 条视频 · 当前累计播放 ${exact(viewCount)} · 公开互动 ${exact(interactionCount)}${engagement == null ? "" : ` · 整体互动密度 ${engagement.toFixed(1)}‰`}。播放与互动均为最近一次采集时的公开累计值，不是窗口内新增。`;
}

const RESEARCH_STOP_WORDS = new Set(["这个", "那个", "我们", "你们", "他们", "就是", "不是", "可以", "真的", "视频", "老师", "谢谢", "感谢", "请问", "一个", "什么", "怎么", "为何", "因为", "觉得", "还是", "已经", "没有", "今天", "现在", "这样", "内容", "看到", "希望", "分享", "分析", "影片", "频道", "财经", "投资", "市场", "the", "and", "with", "this", "that", "for", "from", "your", "you", "are", "is", "to", "of", "in", "on"]);
const wordSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh-Hant", { granularity: "word" }) : null;

function researchTokens(text) {
  const source = String(text || "").replace(/https?:\/\/\S+/gi, " ").replace(/#[\p{L}\p{N}_-]+/gu, " ");
  const values = wordSegmenter
    ? [...wordSegmenter.segment(source)].filter((part) => part.isWordLike).map((part) => part.segment)
    : source.match(/[\p{Script=Han}]{2,}|[A-Za-z][A-Za-z0-9-]{2,}/gu) || [];
  return [...new Set(values.map((value) => value.trim().toLocaleLowerCase()).filter((value) => value.length >= 2 && value.length <= 18 && !/^\d+$/.test(value) && !RESEARCH_STOP_WORDS.has(value)))];
}

function rankedTerms(rows, textForRow) {
  const totals = new Map();
  rows.forEach((row) => researchTokens(textForRow(row)).forEach((term) => totals.set(term, (totals.get(term) || 0) + 1)));
  return [...totals].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-HK")).slice(0, 8);
}

function rankedHashtags(rows) {
  const totals = new Map();
  rows.forEach((video) => {
    const tags = new Set();
    [video.title, ...(Array.isArray(video.tags) ? video.tags : [])].forEach((source) => {
      const text = String(source || "");
      const matches = text.match(/#[\p{L}\p{N}_-]+/gu) || [];
      matches.forEach((tag) => tags.add(tag.slice(1).toLocaleLowerCase()));
      if (!matches.length && source && Array.isArray(video.tags) && video.tags.includes(source)) tags.add(text.replace(/^#/, "").trim().toLocaleLowerCase());
    });
    tags.forEach((tag) => { if (tag.length >= 2 && tag.length <= 40) totals.set(tag, (totals.get(tag) || 0) + 1); });
  });
  return [...totals].map(([label, count]) => ({ label: `#${label}`, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-HK")).slice(0, 8);
}

function renderTokenRanking(targetId, rows, emptyMessage) {
  $(targetId).innerHTML = rows.length
    ? rows.map((row, index) => `<div class="token-row"><span>${index + 1}</span><b>${esc(row.label)}</b><small>${exact(row.count)} 条</small></div>`).join("")
    : `<p class="research-empty">${esc(emptyMessage)}</p>`;
}

function lifecycleHistory(video) {
  const fallbackAt = video.observedAt || data.generatedAt;
  const rows = [...(Array.isArray(video.metricHistory) ? video.metricHistory : []), { observedAt: fallbackAt, viewCount: video.viewCount, likeCount: video.likeCount, commentCount: video.commentCount }]
    .filter((row) => row.observedAt && Number.isFinite(at(row.observedAt)))
    .sort((a, b) => at(a.observedAt) - at(b.observedAt));
  return [...new Map(rows.map((row) => [row.observedAt, row])).values()];
}

function lifecycleMilestone(history, publishedAt, days) {
  const target = at(publishedAt) + days * 86400000;
  const sample = history.find((row) => at(row.observedAt) >= target);
  return sample && at(sample.observedAt) - target <= 36 * 3600000 ? number(sample.viewCount) : null;
}

function renderResearch() {
  const { rows } = insightSource();
  $("researchDescription").textContent = `${periodName(state.insightPeriod)} · ${state.insightAllMode ? "全部频道" : `已选 ${state.insightChannels.size} 个频道`}；性能曲线会随每次自动采集补齐。`;
  const videoOptions = [...rows].sort((a, b) => at(b.publishedAt) - at(a.publishedAt)).slice(0, 60);
  if (!videoOptions.some((video) => video.id === state.lifecycleVideoId)) state.lifecycleVideoId = videoOptions[0]?.id || null;
  $("lifecycleVideo").innerHTML = videoOptions.length ? videoOptions.map((video) => `<option value="${esc(video.id)}"${video.id === state.lifecycleVideoId ? " selected" : ""}>${esc(video.channel)} · ${esc(video.title).slice(0, 58)}</option>`).join("") : `<option value="">暂无可选视频</option>`;
  const lifecycleVideo = videoOptions.find((video) => video.id === state.lifecycleVideoId);
  if (!lifecycleVideo) {
    $("lifecycleMilestones").innerHTML = "";
    $("lifecycleChart").innerHTML = `<div class="empty">所选窗口内暂无视频。</div>`;
    $("lifecycleNote").textContent = "";
  } else {
    const history = lifecycleHistory(lifecycleVideo);
    const published = at(lifecycleVideo.publishedAt);
    const byDay = new Map();
    history.forEach((row) => { const age = Math.max(0, Math.floor((at(row.observedAt) - published) / 86400000)); if (age <= 30) byDay.set(age, row); });
    const points = [...byDay].sort((a, b) => a[0] - b[0]).map(([age, row]) => ({ key: `D${age}`, value: number(row.viewCount) || 0 }));
    const milestones = [1, 7, 30].map((days) => ({ days, value: lifecycleMilestone(history, lifecycleVideo.publishedAt, days) }));
    $("lifecycleMilestones").innerHTML = milestones.map((item) => `<span><small>D${item.days}</small><b>${item.value == null ? "—" : fmt(item.value)}</b><em>累计播放</em></span>`).join("");
    drawLineChart("lifecycleChart", [{ id: lifecycleVideo.id, name: lifecycleVideo.title, color: "#c6a96a", points }], "发布后累计播放", []);
    $("lifecycleNote").textContent = `已保存 ${history.length} 个性能快照；D1 / D7 / D30 仅在目标日后 36 小时内有快照时显示，避免将后期累计值误当作早期表现。`;
  }

  renderTokenRanking("titleKeywords", rankedTerms(rows, (video) => video.title), "所选窗口内暂无标题关键词。");
  const categories = new Map();
  rows.forEach((video) => {
    const label = String(video.categoryTitle || "").trim();
    if (label) categories.set(label, (categories.get(label) || 0) + 1);
  });
  renderTokenRanking("categoryRanking", [...categories].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-HK")).slice(0, 6), "分类将在下一次采集后显示。");
  renderTokenRanking("hashtagRanking", rankedHashtags(rows), "所选窗口内没有可识别的 # 标签。");

  const samples = rows.flatMap((video) => (Array.isArray(video.commentSamples) ? video.commentSamples : []).map((comment) => ({ ...comment, video })));
  $("commentSampleCount").textContent = samples.length ? `${exact(samples.length)} 条公开样本` : "等待首次采集";
  renderTokenRanking("commentTopics", rankedTerms(samples, (comment) => comment.text), "尚未取得公开评论样本。下一次采集后显示。");
  const questions = samples.filter((comment) => /[？?]/.test(String(comment.text || ""))).sort((a, b) => (number(b.likeCount) || 0) - (number(a.likeCount) || 0) || at(b.publishedAt) - at(a.publishedAt)).slice(0, 3);
  $("commentQuestions").innerHTML = questions.length ? questions.map((comment) => `<li><span>${esc(comment.text)}</span><small>${esc(comment.video.channel)} · ${exact(comment.likeCount)} 赞</small></li>`).join("") : `<li class="research-empty">尚未采到带问号的公开评论。</li>`;
  $("commentsResearchNote").textContent = samples.length
    ? `只使用采样到的公开顶级评论（不展示用户名）；高频词按出现过该词的评论数统计，不能代表全部评论。`
    : `采集器会按频道轮换抽样近期可评论视频，每条最多保存 25 条公开顶级评论。`;
}

function benchmarkChannelIds() { return data.benchmarks.map((channel) => channel.id); }

function benchmarkChannelChoices(targetId, selected, action, allMode = false) {
  const ids = benchmarkChannelIds();
  const allSelected = selected.size === ids.length;
  $(targetId).innerHTML = `<button type="button" data-action="${action}:all" aria-pressed="${allMode}">全部频道</button><button type="button" data-action="${action}:select" aria-pressed="${!allMode && allSelected}">全选</button>${data.benchmarks.map((channel) => `<button class="channel-choice" type="button" aria-label="${esc(channel.name)}" data-action="${action}:${esc(channel.id)}" aria-pressed="${!allMode && selected.has(channel.id)}">${avatar(channel)}<span>${esc(channel.name)}</span></button>`).join("")}`;
}

function benchmarkRangeKeys(period, metric = "subscribers") {
  let start = periodStart(period);
  if (period === "all") {
    const values = metric === "subscribers" ? data.benchmarks.flatMap((channel) => channelHistory(channel).map((row) => at(row.observedAt))) : data.benchmarkCatalog.map((video) => at(video.publishedAt));
    start = values.length ? Math.min(...values) : asOf();
  }
  const output = [];
  for (let stamp = new Date(day(start)).getTime(); stamp <= asOf(); stamp += 86400000) output.push(day(stamp));
  return output.slice(-1095);
}

function benchmarkSubscriberGrowthSeries(channel, keys, period) {
  const history = channelHistory(channel).filter((row) => number(row.subscriberCount) != null).sort((a, b) => at(a.observedAt) - at(b.observedAt));
  const base = baseline(channel, period);
  const baseValue = number(base?.subscriberCount);
  const color = COLORS[data.benchmarks.findIndex((item) => item.id === channel.id) % COLORS.length];
  if (baseValue == null) return { id: channel.id, name: channel.name, color, points: keys.map((key) => ({ key, value: null })), currentValue: number(channel.subscriberCount), startedAt: null };
  const baseTime = at(base.observedAt), baseKey = day(base.observedAt);
  const dailySamples = new Map();
  history.filter((row) => at(row.observedAt) >= baseTime).forEach((row) => dailySamples.set(day(row.observedAt), Number(row.subscriberCount)));
  let latest = null;
  const points = keys.map((key) => {
    if (key === baseKey) latest = baseValue;
    else if (dailySamples.has(key)) latest = dailySamples.get(key);
    return { key, value: latest == null ? null : latest - baseValue };
  });
  return { id: channel.id, name: channel.name, color, points, currentValue: number(channel.subscriberCount), startedAt: base.observedAt };
}

function benchmarkWindowViews(channel, period) {
  if (period === "all") return number(channel.channelViews) || 0;
  return benchmarkVideosFor(channel.id, period).reduce((sum, video) => sum + (number(video.viewCount) || 0), 0);
}

function renderBenchmarkSubscribers() {
  const period = state.benchmarkSubscriberPeriod;
  const all = period === "all";
  const rows = data.benchmarks.filter((channel) => number(channel.subscriberCount) != null).map((channel, index) => {
    const start = baseline(channel, period);
    const value = all ? Number(channel.subscriberCount) : subscriberDelta(channel, period);
    const rate = !all && number(start?.subscriberCount) > 0 ? Number(value || 0) / Number(start.subscriberCount) * 100 : null;
    return { channel, value, rate, color: COLORS[index % COLORS.length] };
  }).filter((row) => row.value != null).sort((a, b) => b.value - a.value);
  $("benchmarkSubscriberNote").textContent = `${rows.length} 个账号公开值`;
  $("benchmarkSubscriberPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.period === period)));
  renderDonut("benchmarkSubscriberChart", rows, all ? "公开订阅 · 全部记录" : `订阅净增长 · ${periodName(period)}`, (row) => all ? `公开订阅：${exact(row.value)}` : `订阅净增长 ${exact(row.value)} · ${periodName(period)}增长率 ${row.rate == null ? "—" : signedPercent(row.rate)}`);
}

function renderBenchmarkViews() {
  const period = state.benchmarkViewsPeriod;
  const all = period === "all";
  const rows = data.benchmarks.map((channel, index) => ({ channel, value: benchmarkWindowViews(channel, period), videos: benchmarkVideosFor(channel.id, period).length, color: COLORS[index % COLORS.length] })).sort((a, b) => b.value - a.value);
  $("benchmarkViewsNote").textContent = all ? "频道公开累计值" : `${periodName(period)}发布视频当前播放`;
  $("benchmarkViewsPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.period === period)));
  renderDonut("benchmarkViewsChart", rows, all ? "频道总播放 · 全部记录" : `视频播放 · ${periodName(period)}`, (row) => all ? `频道总播放：${exact(row.value)}` : `视频播放：${exact(row.value)} · 发布视频 ${row.videos} 条`);
}

function renderBenchmarkInventory() {
  const period = state.benchmarkVideoPeriod, start = periodStart(period), selected = state.benchmarkVideoChannels;
  const rows = data.benchmarkCatalog.filter((row) => at(row.publishedAt) >= start && at(row.publishedAt) <= asOf() && (!selected.size || selected.has(row.channelId))).sort((a, b) => state.benchmarkVideoSort === "asc" ? (number(a.viewCount) || 0) - (number(b.viewCount) || 0) : (number(b.viewCount) || 0) - (number(a.viewCount) || 0) || at(b.publishedAt) - at(a.publishedAt));
  $("benchmarkVideoPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  $("benchmarkVideoSort").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === state.benchmarkVideoSort)));
  benchmarkChannelChoices("benchmarkVideoChannels", selected, "benchmarkVideo", selected.size === 0);
  $("benchmarkAllVideosCount").textContent = `${selected.size ? `已选 ${selected.size} 个频道` : "全部频道"} · ${periodName(period)}发布 · ${exact(rows.length)} 条视频`;
  $("benchmarkAllVideosList").innerHTML = rows.length ? rows.map((row) => `<li><a class="video-link" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${videoThumb(row)}<span class="video-copy"><strong>${esc(row.title)}</strong><span class="video-meta"><b>${esc(row.channel)}</b><time>${time(row.publishedAt)}</time></span></span><span class="views-cell"><b>${exact(row.viewCount)}</b><small>次播放</small></span></a></li>`).join("") : `<li class="empty">所选频道在该时间窗口内暂无已采集视频。</li>`;
}

function renderBenchmarkRecentUpdates() {
  const rows = data.benchmarkCatalog.filter((row) => at(row.publishedAt) >= periodStart("7") && at(row.publishedAt) <= asOf()).sort((a, b) => at(b.publishedAt) - at(a.publishedAt));
  $("benchmarkRecentUpdatesCount").textContent = `${exact(rows.length)} 条 · 最近发布优先`;
  $("benchmarkRecentUpdatesList").innerHTML = rows.length ? rows.map((row) => `<li><a class="update-link" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${videoThumb(row)}<span class="video-copy"><strong>${esc(row.title)}</strong><span class="video-meta"><b>${esc(row.channel)}</b><time>${time(row.publishedAt)}</time><span>${exact(row.viewCount)} 次播放</span></span></span><span class="outbound">↗</span></a></li>`).join("") : `<li class="empty">近 7 日没有已采集的视频。</li>`;
}

function renderBenchmarkSubscriberGrowth() {
  const period = state.benchmarkSubscriberGrowthPeriod;
  const selected = state.benchmarkSubscriberGrowthAllMode ? data.benchmarks : data.benchmarks.filter((channel) => state.benchmarkSubscriberGrowthChannels.has(channel.id));
  const keys = benchmarkRangeKeys(period);
  const series = selected.filter((channel) => number(channel.subscriberCount) != null).map((channel) => benchmarkSubscriberGrowthSeries(channel, keys, period));
  const populated = series.filter((row) => row.points.some((point) => number(point.value) != null));
  const starts = populated.map((row) => row.startedAt).filter(Boolean).map(at);
  $("benchmarkSubscriberGrowthPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  benchmarkChannelChoices("benchmarkSubscriberGrowthChannels", state.benchmarkSubscriberGrowthChannels, "benchmarkSubscriberGrowth", state.benchmarkSubscriberGrowthAllMode);
  $("benchmarkSubscriberGrowthDescription").textContent = `${periodName(period)} · 每条折线以该账号窗口内首个可用公开订阅快照为 0，展示之后的净变化。`;
  drawLineChart("benchmarkSubscriberGrowthChart", populated, "订阅净变化", populated, (row, point) => `订阅净变化 ${signedExact(point.value)} · 当前公开订阅 ${exact(row.currentValue)}`);
  $("benchmarkSubscriberGrowthLegend").innerHTML = populated.map((row) => {
    const latest = [...row.points].reverse().find((point) => number(point.value) != null)?.value;
    return `<span><i class="series-dot" style="background:${row.color}"></i>${esc(row.name)} <b>${signedExact(latest)} · 当前 ${exact(row.currentValue)}</b></span>`;
  }).join("");
  $("benchmarkSubscriberGrowthNote").textContent = populated.length
    ? `${periodName(period)} · 已选择 ${selected.length} 个账号，其中 ${populated.length} 个有公开订阅快照；共同可比较记录自 ${day(Math.max(...starts))} 起。未采集日沿用最近一次公开快照。`
    : `${periodName(period)} · 所选账号尚无可用的公开订阅历史快照。`;
}

function benchmarkVideosFor(channelId, period = "all") {
  const start = periodStart(period);
  return data.benchmarkCatalog.filter((video) => video.channelId === channelId && at(video.publishedAt) >= start && at(video.publishedAt) <= asOf());
}

function benchmarkChannelSeries(channel, keys, period, metric) {
  const values = new Map(keys.map((key) => [key, metric === "subscribers" ? null : 0]));
  if (metric === "subscribers") {
    const base = baseline(channel, period);
    channelHistory(channel).filter((row) => at(row.observedAt) >= periodStart(period) && number(row.subscriberCount) != null).forEach((row) => values.set(day(row.observedAt), Number(row.subscriberCount) - Number(base?.subscriberCount || row.subscriberCount)));
  } else {
    benchmarkVideosFor(channel.id, period).forEach((video) => { const key = day(video.publishedAt); if (values.has(key)) values.set(key, (values.get(key) || 0) + valueForMetric(video, metric)); });
  }
  return { id: channel.id, name: channel.name, color: COLORS[data.benchmarks.findIndex((item) => item.id === channel.id) % COLORS.length], points: keys.map((key) => ({ key, value: values.get(key) })) };
}

function benchmarkTooltipSummary(metric, row, key) {
  const videos = data.benchmarkCatalog.filter((video) => video.channelId === row.id && day(video.publishedAt) === key);
  const kinds = uploadSplit(videos);
  if (metric === "uploads") return `${videos.length} 条视频 · 长 ${kinds.long} / 短 ${kinds.short}${kinds.other ? ` / 其他 ${kinds.other}` : ""}`;
  return videos.length ? `${videos.length} 条视频 · ${videos.slice(0, 2).map((video) => video.title).join(" · ")}` : "当天没有可展开的视频明细";
}

function renderBenchmarkBreakdown(series, metricLabel) {
  const period = state.benchmarkTrendPeriod, metric = state.benchmarkTrendMetric;
  const target = $("benchmarkBreakdownBarChart");
  $("benchmarkBreakdownLineTitle").textContent = `各频道折线 · ${metricLabel}`;
  drawLineChart("benchmarkBreakdownLineChart", series, metricLabel, series, (row, point, key) => benchmarkTooltipSummary(metric, row, key), data.benchmarkCatalog);
  $("benchmarkBreakdownLineLegend").innerHTML = series.map((row) => `<span><i class="series-dot" style="background:${row.color}"></i>${esc(row.name)}</span>`).join("");
  $("benchmarkBreakdownLineNote").textContent = `${periodName(period)} · ${series.length} 个频道 · 按发布日期每日求和，并非当日新增量。`;
  $("benchmarkBreakdownBarTitle").textContent = `各频道柱状 · ${metricLabel}`;
  const chosen = state.benchmarkTrendAllMode ? data.benchmarks : data.benchmarks.filter((channel) => state.benchmarkTrendChannels.has(channel.id));
  const rows = chosen.map((channel) => {
    const videos = benchmarkVideosFor(channel.id, period);
    const value = metric === "subscribers" ? subscriberDelta(channel, period) : videos.reduce((sum, video) => sum + valueForMetric(video, metric), 0);
    return { channel, value, videos, split: uploadSplit(videos) };
  }).sort((a, b) => (number(b.value) || -Infinity) - (number(a.value) || -Infinity));
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(number(row.value) || 0)));
  target.innerHTML = `<div class="breakdown-bars">${rows.map((row) => {
    const width = Math.abs(number(row.value) || 0) / maximum * 100;
    const stack = metric === "uploads"
      ? `<span class="bar-track stacked upload-stack" role="img" aria-label="${esc(row.channel.name)}：长视频 ${row.split.long} 条，Shorts ${row.split.short} 条${row.split.other ? `，其他 ${row.split.other} 条` : ""}"><i class="upload-segment upload-segment--long" style="width:${width * row.split.long / Math.max(1, row.split.total)}%"></i><i class="upload-segment upload-segment--short" style="width:${width * row.split.short / Math.max(1, row.split.total)}%"></i>${row.split.other ? `<i class="upload-segment upload-segment--other" style="width:${width * row.split.other / Math.max(1, row.split.total)}%"></i>` : ""}</span>`
      : `<span class="bar-track"><span style="width:${width}%;background:${COLORS[data.benchmarks.indexOf(row.channel) % COLORS.length]}"></span></span>`;
    const value = metric === "uploads"
      ? `<span class="metric-bar-value update-value"><b>${exact(row.split.total)} 条</b><small>长 ${row.split.long} · 短 ${row.split.short}${row.split.other ? ` · 其他 ${row.split.other}` : ""}</small></span>`
      : `<b class="metric-bar-value">${exact(row.value)}</b>`;
    return `<div class="metric-bar-row${metric === "uploads" ? " is-upload-breakdown" : ""}"><a class="metric-bar-channel" href="${esc(row.channel.url)}" target="_blank" rel="noopener noreferrer">${avatar(row.channel)}<span>${esc(row.channel.name)}</span></a>${stack}${value}</div>`;
  }).join("")}</div>`;
  const hasOtherUploads = rows.some((row) => row.split.other > 0);
  $("benchmarkBreakdownBarLegend").innerHTML = metric === "uploads" ? `<span><i class="series-dot upload-long-dot"></i>长视频</span><span><i class="series-dot upload-short-dot"></i>短视频</span>${hasOtherUploads ? `<span><i class="series-dot upload-other-dot"></i>其他</span>` : ""}` : "";
  $("benchmarkBreakdownBarNote").textContent = metric === "uploads"
    ? `${periodName(period)} · ${rows.length} 个频道 · 带 #Shorts 标记或时长不超过 3 分钟归为短视频；直播、待播或缺少时长的项目仅计入总数。`
    : `${periodName(period)} · ${rows.length} 个频道 · 跟随上方指标与时间窗口；柱状图合计窗口内发布视频的最近累计值；折线按发布日期每日求和，并非当日新增量。`;
}

function renderBenchmarkTrend() {
  const metric = state.benchmarkTrendMetric, period = state.benchmarkTrendPeriod;
  const labels = { views: "播放量", subscribers: "新增订阅", likes: "点赞数量", comments: "评论数量", uploads: "更新数量" };
  const keys = benchmarkRangeKeys(period, metric);
  const chosen = state.benchmarkTrendAllMode ? data.benchmarks : data.benchmarks.filter((channel) => state.benchmarkTrendChannels.has(channel.id));
  const source = chosen.map((channel) => benchmarkChannelSeries(channel, keys, period, metric));
  const main = chosen.length === 1 ? source : [aggregateSeries(source, keys, state.benchmarkTrendAllMode ? "全部频道总和" : `所选频道总和 · ${chosen.length} 个频道`)];
  main.forEach((row) => { if (row.id === "aggregate") row.color = "#c6a96a"; });
  $("benchmarkAggregateTitle").textContent = main[0]?.name || "全部频道总和";
  $("benchmarkTrendDescription").textContent = metric === "subscribers" ? `${periodName(period)} · ${main[0]?.name || "全部频道总和"}；公开订阅快照差值，历史不足时显示已累积区间。` : `${periodName(period)} · ${main[0]?.name || "全部频道总和"}；按视频发布日期每日求和，采用最近采集的累计值，并非当日新增量。`;
  $("benchmarkTrendPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  $("benchmarkTrendMetric").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === metric)));
  benchmarkChannelChoices("benchmarkTrendChannels", state.benchmarkTrendChannels, "benchmarkTrend", state.benchmarkTrendAllMode);
  drawLineChart("benchmarkTrendChart", main, labels[metric], source, (row, point, key) => benchmarkTooltipSummary(metric, row, key), data.benchmarkCatalog);
  const total = main[0]?.points.reduce((sum, point) => sum + (number(point.value) || 0), 0) || 0;
  $("benchmarkTrendLegend").innerHTML = main.map((row) => `<span><i class="series-dot" style="background:${row.color}"></i>${esc(row.name)} <b>${esc(labels[metric])} · ${exact(total)} · 窗口内合计</b></span>`).join("");
  renderBenchmarkBreakdown(source, labels[metric]);
}

function renderBenchmarkUpdates() {
  const rows = data.benchmarks.map((channel) => {
    const videos = data.benchmarkCatalog.filter((video) => video.channelId === channel.id && at(video.publishedAt) >= periodStart("7") && at(video.publishedAt) <= asOf());
    return { channel, split: uploadSplit(videos) };
  }).sort((a, b) => b.split.total - a.split.total || a.channel.name.localeCompare(b.channel.name, "zh-HK"));
  const maximum = Math.max(1, ...rows.map((row) => row.split.total));
  const total = rows.reduce((sum, row) => sum + row.split.total, 0);
  const hasOther = rows.some((row) => row.split.other > 0);
  $("benchmarkUpdateCount").textContent = `近 7 日 · ${rows.length} 个频道 · 共 ${exact(total)} 条更新`;
  $("benchmarkUpdatesChart").innerHTML = rows.length ? rows.map((row) => {
    const width = row.split.total / maximum * 100;
    return `<div class="channel-update-row"><a class="channel-update-name" href="${esc(row.channel.url)}" target="_blank" rel="noopener noreferrer">${avatar(row.channel)}<span>${esc(row.channel.name)}</span></a><span class="channel-update-track" role="img" aria-label="${esc(row.channel.name)}：共 ${row.split.total} 条更新，长视频 ${row.split.long} 条，Shorts ${row.split.short} 条${row.split.other ? `，其他 ${row.split.other} 条` : ""}"><i class="upload-segment upload-segment--long" style="width:${width * row.split.long / Math.max(1, row.split.total)}%"></i><i class="upload-segment upload-segment--short" style="width:${width * row.split.short / Math.max(1, row.split.total)}%"></i>${row.split.other ? `<i class="upload-segment upload-segment--other" style="width:${width * row.split.other / Math.max(1, row.split.total)}%"></i>` : ""}</span><span class="channel-update-value"><b>${exact(row.split.total)} 条</b><small>长 ${row.split.long} · 短 ${row.split.short}${row.split.other ? ` · 其他 ${row.split.other}` : ""}</small></span></div>`;
  }).join("") : `<div class="empty">近 7 日没有已采集的视频。</div>`;
  $("benchmarkUpdatesLegend").innerHTML = `<span><i class="series-dot upload-long-dot"></i>长视频</span><span><i class="series-dot upload-short-dot"></i>短视频</span>${hasOther ? `<span><i class="series-dot upload-other-dot"></i>其他</span>` : ""}`;
  $("benchmarkUpdatesNote").textContent = `近 7 日 · 共 ${total} 条更新 · 带 #Shorts 标记或时长不超过 3 分钟归为短视频；直播、待播或缺少时长的项目仅计入总数。`;
}

function benchmarkInsightSource() {
  const chosen = state.benchmarkInsightAllMode ? data.benchmarks : data.benchmarks.filter((channel) => state.benchmarkInsightChannels.has(channel.id));
  const chosenIds = new Set(chosen.map((channel) => channel.id));
  const rows = data.benchmarkCatalog.filter((video) => chosenIds.has(video.channelId) && at(video.publishedAt) >= periodStart(state.benchmarkInsightPeriod) && at(video.publishedAt) <= asOf());
  return { chosen, rows };
}

function renderBenchmarkInsights() {
  const period = state.benchmarkInsightPeriod;
  const { chosen, rows } = benchmarkInsightSource();
  const viewCount = rows.reduce((sum, video) => sum + (number(video.viewCount) || 0), 0);
  const interactionCount = rows.reduce((sum, video) => sum + (number(video.likeCount) || 0) + (number(video.commentCount) || 0), 0);
  const engagement = viewCount ? interactionCount / viewCount * 1000 : null;
  $("benchmarkInsightPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  benchmarkChannelChoices("benchmarkInsightChannels", state.benchmarkInsightChannels, "benchmarkInsight", state.benchmarkInsightAllMode);
  $("benchmarkInsightsDescription").textContent = `${periodName(period)} · ${state.benchmarkInsightAllMode ? "全部对标账号" : `已选 ${chosen.length} 个账号`}的内容表现、互动密度与发布节奏。`;
  $("benchmarkInsightVideoCount").textContent = `${exact(rows.length)} 条视频`;

  const topVideos = [...rows].sort((a, b) => (number(b.viewCount) || 0) - (number(a.viewCount) || 0) || at(b.publishedAt) - at(a.publishedAt)).slice(0, 8);
  $("benchmarkInsightTopVideos").innerHTML = topVideos.length ? topVideos.map((video, index) => {
    const views = number(video.viewCount) || 0, likes = number(video.likeCount) || 0, comments = number(video.commentCount) || 0;
    const rate = views ? (likes + comments) / views * 1000 : null;
    return `<li><a href="${esc(video.url)}" target="_blank" rel="noopener noreferrer"><b class="insight-rank">${index + 1}</b>${videoThumb(video)}<span class="insight-video-copy"><strong>${esc(video.title)}</strong><span>${esc(video.channel)} · ${time(video.publishedAt)}</span></span><span class="insight-video-value"><b>${fmt(views)}</b><small>播放 · ${rate == null ? "—" : rate.toFixed(1)}‰ 互动</small></span></a></li>`;
  }).join("") : `<li class="empty">所选窗口内暂无已采集视频。</li>`;

  const engagementRows = chosen.map((channel) => {
    const videos = rows.filter((video) => video.channelId === channel.id);
    const views = videos.reduce((sum, video) => sum + (number(video.viewCount) || 0), 0);
    const interactions = videos.reduce((sum, video) => sum + (number(video.likeCount) || 0) + (number(video.commentCount) || 0), 0);
    return { channel, videos: videos.length, views, interactions, rate: views ? interactions / views * 1000 : null };
  }).filter((row) => row.rate != null).sort((a, b) => b.rate - a.rate || b.views - a.views);
  const maxRate = Math.max(1, ...engagementRows.map((row) => row.rate));
  $("benchmarkInsightEngagement").innerHTML = engagementRows.length ? engagementRows.map((row, index) => `<div class="insight-ranking-row"><span class="insight-rank">${index + 1}</span><a href="${esc(row.channel.url)}" target="_blank" rel="noopener noreferrer">${avatar(row.channel)}<span>${esc(row.channel.name)}</span></a><span class="insight-rate-track"><i style="width:${row.rate / maxRate * 100}%"></i></span><span class="insight-rate-value"><b>${row.rate.toFixed(1)}‰</b><small>${exact(row.interactions)} 次互动 · ${row.videos} 条</small></span></div>`).join("") : `<div class="empty">所选窗口内暂无可比较的播放与互动数据。</div>`;

  const split = uploadSplit(rows), total = Math.max(1, split.total);
  const mixPart = (label, count, kind) => `<span><i class="series-dot upload-${kind}-dot"></i><b>${label}</b><strong>${exact(count)} 条</strong><small>${(count / total * 100).toFixed(0)}%</small></span>`;
  $("benchmarkInsightMix").innerHTML = `<div class="content-mix-track" role="img" aria-label="内容结构：长视频 ${split.long} 条，Shorts ${split.short} 条，其他 ${split.other} 条"><i class="upload-segment upload-segment--long" style="width:${split.long / total * 100}%"></i><i class="upload-segment upload-segment--short" style="width:${split.short / total * 100}%"></i><i class="upload-segment upload-segment--other" style="width:${split.other / total * 100}%"></i></div><div class="content-mix-values">${mixPart("长视频", split.long, "long")}${mixPart("短视频", split.short, "short")}${mixPart("直播 / 其他", split.other, "other")}</div>`;

  const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const weekdays = Array(7).fill(0);
  rows.forEach((video) => { const weekday = (new Date(`${day(video.publishedAt)}T00:00:00Z`).getUTCDay() + 6) % 7; weekdays[weekday] += 1; });
  const maxWeekday = Math.max(1, ...weekdays);
  const peakIndex = weekdays.indexOf(Math.max(...weekdays));
  $("benchmarkInsightCadence").innerHTML = `<div class="cadence-heading"><b>发布节奏</b><span>最多发布：${weekdayLabels[peakIndex]} · ${exact(weekdays[peakIndex])} 条</span></div><div class="cadence-bars">${weekdays.map((count, index) => `<span title="${weekdayLabels[index]} ${count} 条"><i style="height:${Math.max(count ? 10 : 2, count / maxWeekday * 100)}%"></i><b>${exact(count)}</b><small>${weekdayLabels[index]}</small></span>`).join("")}</div>`;
  $("benchmarkInsightsNote").textContent = `${periodName(period)} · ${exact(rows.length)} 条视频 · 当前累计播放 ${exact(viewCount)} · 公开互动 ${exact(interactionCount)}${engagement == null ? "" : ` · 整体互动密度 ${engagement.toFixed(1)}‰`}。播放与互动均为最近一次采集时的公开累计值，不是窗口内新增。`;
}

function renderBenchmarkResearch() {
  const { rows } = benchmarkInsightSource();
  $("benchmarkResearchDescription").textContent = `${periodName(state.benchmarkInsightPeriod)} · ${state.benchmarkInsightAllMode ? "全部对标账号" : `已选 ${state.benchmarkInsightChannels.size} 个账号`}；性能曲线会随每次自动采集补齐。`;
  const videoOptions = [...rows].sort((a, b) => at(b.publishedAt) - at(a.publishedAt)).slice(0, 60);
  if (!videoOptions.some((video) => video.id === state.benchmarkLifecycleVideoId)) state.benchmarkLifecycleVideoId = videoOptions[0]?.id || null;
  $("benchmarkLifecycleVideo").innerHTML = videoOptions.length ? videoOptions.map((video) => `<option value="${esc(video.id)}"${video.id === state.benchmarkLifecycleVideoId ? " selected" : ""}>${esc(video.channel)} · ${esc(video.title).slice(0, 58)}</option>`).join("") : `<option value="">暂无可选视频</option>`;
  const lifecycleVideo = videoOptions.find((video) => video.id === state.benchmarkLifecycleVideoId);
  if (!lifecycleVideo) {
    $("benchmarkLifecycleMilestones").innerHTML = "";
    $("benchmarkLifecycleChart").innerHTML = `<div class="empty">所选窗口内暂无视频。</div>`;
    $("benchmarkLifecycleNote").textContent = "";
  } else {
    const history = lifecycleHistory(lifecycleVideo);
    const published = at(lifecycleVideo.publishedAt);
    const byDay = new Map();
    history.forEach((row) => { const age = Math.max(0, Math.floor((at(row.observedAt) - published) / 86400000)); if (age <= 30) byDay.set(age, row); });
    const points = [...byDay].sort((a, b) => a[0] - b[0]).map(([age, row]) => ({ key: `D${age}`, value: number(row.viewCount) || 0 }));
    const milestones = [1, 7, 30].map((days) => ({ days, value: lifecycleMilestone(history, lifecycleVideo.publishedAt, days) }));
    $("benchmarkLifecycleMilestones").innerHTML = milestones.map((item) => `<span><small>D${item.days}</small><b>${item.value == null ? "—" : fmt(item.value)}</b><em>累计播放</em></span>`).join("");
    drawLineChart("benchmarkLifecycleChart", [{ id: lifecycleVideo.id, name: lifecycleVideo.title, color: "#c6a96a", points }], "发布后累计播放", []);
    $("benchmarkLifecycleNote").textContent = `已保存 ${history.length} 个性能快照；D1 / D7 / D30 仅在目标日后 36 小时内有快照时显示，避免将后期累计值误当作早期表现。`;
  }

  renderTokenRanking("benchmarkTitleKeywords", rankedTerms(rows, (video) => video.title), "所选窗口内暂无标题关键词。");
  const categories = new Map();
  rows.forEach((video) => {
    const label = String(video.categoryTitle || "").trim();
    if (label) categories.set(label, (categories.get(label) || 0) + 1);
  });
  renderTokenRanking("benchmarkCategoryRanking", [...categories].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-HK")).slice(0, 6), "分类将在下一次采集后显示。");
  renderTokenRanking("benchmarkHashtagRanking", rankedHashtags(rows), "所选窗口内没有可识别的 # 标签。");

  const samples = rows.flatMap((video) => (Array.isArray(video.commentSamples) ? video.commentSamples : []).map((comment) => ({ ...comment, video })));
  $("benchmarkCommentSampleCount").textContent = samples.length ? `${exact(samples.length)} 条公开样本` : "等待首次采集";
  renderTokenRanking("benchmarkCommentTopics", rankedTerms(samples, (comment) => comment.text), "尚未取得公开评论样本。下一次采集后显示。");
  const questions = samples.filter((comment) => /[？?]/.test(String(comment.text || ""))).sort((a, b) => (number(b.likeCount) || 0) - (number(a.likeCount) || 0) || at(b.publishedAt) - at(a.publishedAt)).slice(0, 3);
  $("benchmarkCommentQuestions").innerHTML = questions.length ? questions.map((comment) => `<li><span>${esc(comment.text)}</span><small>${esc(comment.video.channel)} · ${exact(comment.likeCount)} 赞</small></li>`).join("") : `<li class="research-empty">尚未采到带问号的公开评论。</li>`;
  $("benchmarkCommentsResearchNote").textContent = samples.length
    ? `只使用采样到的公开顶级评论（不展示用户名）；高频词按出现过该词的评论数统计，不能代表全部评论。`
    : `采集器会按账号轮换抽样近期可评论视频，每条最多保存 25 条公开顶级评论。`;
}

function renderBenchmarks() {
  $("ownedWorkspaceCount").textContent = `${exact(data.channels.length)} 个频道`;
  $("benchmarkWorkspaceCount").textContent = `${exact(data.benchmarks.length)} 个账号`;
  renderBenchmarkSubscribers();
  renderBenchmarkViews();
  renderBenchmarkInventory();
  renderBenchmarkRecentUpdates();
  renderBenchmarkTrend();
  renderBenchmarkUpdates();
  renderBenchmarkInsights();
  renderBenchmarkResearch();
  renderBenchmarkSubscriberGrowth();
}

function setWorkspace(workspace) {
  state.workspace = workspace === "benchmarks" ? "benchmarks" : "owned";
  $("ownedWorkspace").hidden = state.workspace !== "owned";
  $("benchmarkWorkspace").hidden = state.workspace !== "benchmarks";
  document.querySelectorAll("[data-workspace]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.workspace === state.workspace)));
}

function render() { renderSubscribers(); renderViews(); renderUpdates(); renderRecentUpdates(); renderTrend(); renderInventory(); renderSubscriberGrowth(); renderInsights(); renderResearch(); renderBenchmarks(); setWorkspace(state.workspace); }

function bindControls() {
  $("themeToggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("yt-dashboard-theme", next); } catch (_) { /* The visual switch still works without storage. */ }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.workspace) { setWorkspace(button.dataset.workspace); return; }
    const inGroup = (id) => button.closest(`#${id}`);
    if (inGroup("subscriberPeriod")) { state.subscriberPeriod = button.dataset.period; renderSubscribers(); return; }
    if (inGroup("viewsPeriod")) { state.viewsPeriod = button.dataset.period; renderViews(); return; }
    if (inGroup("trendPeriod")) { state.trendPeriod = button.dataset.value; renderTrend(); return; }
    if (inGroup("trendMetric")) { state.trendMetric = button.dataset.value; renderTrend(); return; }
    if (inGroup("breakdownMode")) { state.breakdownMode = button.dataset.value; renderTrend(); return; }
    if (inGroup("videoPeriod")) { state.videoPeriod = button.dataset.value; renderInventory(); return; }
    if (inGroup("videoSort")) { state.videoSort = button.dataset.value; renderInventory(); return; }
    if (inGroup("subscriberGrowthPeriod")) { state.subscriberGrowthPeriod = button.dataset.value; renderSubscriberGrowth(); return; }
    if (inGroup("benchmarkSubscriberPeriod")) { state.benchmarkSubscriberPeriod = button.dataset.period; renderBenchmarkSubscribers(); return; }
    if (inGroup("benchmarkViewsPeriod")) { state.benchmarkViewsPeriod = button.dataset.period; renderBenchmarkViews(); return; }
    if (inGroup("benchmarkVideoPeriod")) { state.benchmarkVideoPeriod = button.dataset.value; renderBenchmarkInventory(); return; }
    if (inGroup("benchmarkVideoSort")) { state.benchmarkVideoSort = button.dataset.value; renderBenchmarkInventory(); return; }
    if (inGroup("benchmarkInsightPeriod")) { state.benchmarkInsightPeriod = button.dataset.value; renderBenchmarkInsights(); renderBenchmarkResearch(); return; }
    if (inGroup("benchmarkSubscriberGrowthPeriod")) { state.benchmarkSubscriberGrowthPeriod = button.dataset.value; renderBenchmarkSubscriberGrowth(); return; }
    if (inGroup("benchmarkTrendPeriod")) { state.benchmarkTrendPeriod = button.dataset.value; renderBenchmarkTrend(); return; }
    if (inGroup("benchmarkTrendMetric")) { state.benchmarkTrendMetric = button.dataset.value; renderBenchmarkTrend(); return; }
    if (inGroup("benchmarkBreakdownMode")) { state.benchmarkBreakdownMode = button.dataset.value; renderBenchmarkTrend(); return; }
    if (inGroup("insightPeriod")) { state.insightPeriod = button.dataset.value; renderInsights(); renderResearch(); return; }
    const action = button.dataset.action; if (!action) return;
    const [kind, value] = action.split(":"); const isBenchmark = kind === "benchmarkVideo" || kind === "benchmarkInsight" || kind === "benchmarkSubscriberGrowth" || kind === "benchmarkTrend"; const ids = isBenchmark ? benchmarkChannelIds() : allChannelIds(); const target = kind === "trend" ? state.trendChannels : kind === "subscriberGrowth" ? state.subscriberGrowthChannels : kind === "insight" ? state.insightChannels : kind === "benchmarkInsight" ? state.benchmarkInsightChannels : kind === "benchmarkSubscriberGrowth" ? state.benchmarkSubscriberGrowthChannels : kind === "benchmarkTrend" ? state.benchmarkTrendChannels : kind === "benchmarkVideo" ? state.benchmarkVideoChannels : state.videoChannels;
    if (value === "all") {
      target.clear();
      if (kind === "trend") state.trendAllMode = true;
      if (kind === "subscriberGrowth") state.subscriberGrowthAllMode = true;
      if (kind === "insight") state.insightAllMode = true;
      if (kind === "benchmarkInsight") state.benchmarkInsightAllMode = true;
      if (kind === "benchmarkSubscriberGrowth") state.benchmarkSubscriberGrowthAllMode = true;
      if (kind === "benchmarkTrend") state.benchmarkTrendAllMode = true;
    } else if (value === "select") {
      target.clear(); ids.forEach((id) => target.add(id));
      if (kind === "trend") state.trendAllMode = false;
      if (kind === "subscriberGrowth") state.subscriberGrowthAllMode = false;
      if (kind === "insight") state.insightAllMode = false;
      if (kind === "benchmarkInsight") state.benchmarkInsightAllMode = false;
      if (kind === "benchmarkSubscriberGrowth") state.benchmarkSubscriberGrowthAllMode = false;
      if (kind === "benchmarkTrend") state.benchmarkTrendAllMode = false;
    } else {
      if (kind === "trend" && state.trendAllMode) { state.trendAllMode = false; target.clear(); }
      if (kind === "subscriberGrowth" && state.subscriberGrowthAllMode) { state.subscriberGrowthAllMode = false; target.clear(); }
      if (kind === "insight" && state.insightAllMode) { state.insightAllMode = false; target.clear(); }
      if (kind === "benchmarkInsight" && state.benchmarkInsightAllMode) { state.benchmarkInsightAllMode = false; target.clear(); }
      if (kind === "benchmarkSubscriberGrowth" && state.benchmarkSubscriberGrowthAllMode) { state.benchmarkSubscriberGrowthAllMode = false; target.clear(); }
      if (kind === "benchmarkTrend" && state.benchmarkTrendAllMode) { state.benchmarkTrendAllMode = false; target.clear(); }
      if (target.has(value)) target.delete(value); else target.add(value);
    }
    if (kind === "trend") renderTrend(); else if (kind === "subscriberGrowth") renderSubscriberGrowth(); else if (kind === "insight") { renderInsights(); renderResearch(); } else if (kind === "benchmarkInsight") { renderBenchmarkInsights(); renderBenchmarkResearch(); } else if (kind === "benchmarkSubscriberGrowth") renderBenchmarkSubscriberGrowth(); else if (kind === "benchmarkTrend") renderBenchmarkTrend(); else if (kind === "benchmarkVideo") renderBenchmarkInventory(); else renderInventory();
  });
  document.addEventListener("change", (event) => {
    if (event.target?.id === "lifecycleVideo") { state.lifecycleVideoId = event.target.value || null; renderResearch(); }
    if (event.target?.id === "benchmarkLifecycleVideo") { state.benchmarkLifecycleVideoId = event.target.value || null; renderBenchmarkResearch(); }
  });
  window.addEventListener("resize", () => { if (data.channels.length) { renderTrend(); renderSubscriberGrowth(); renderResearch(); } if (data.benchmarks.length) { renderBenchmarkTrend(); renderBenchmarkResearch(); renderBenchmarkSubscriberGrowth(); } });
}

function normaliseGroup(sourceChannels, storedRows) {
  const channels = (sourceChannels || []).map((row) => ({ ...row, id: row.id || row.channelId, name: row.name || row.channel || row.id }));
  const byId = new Map(channels.map((row) => [row.id, row]));
  const fallback = channels.flatMap((channel) => (channel.videos || []).map((video) => ({ ...video, channelId: channel.id, channel: channel.name })));
  const stored = storedRows || fallback;
  const catalog = [...new Map(stored.map((video) => {
    const channel = byId.get(video.channelId || video.channel_id);
    const id = video.id || video.videoId;
    return [id, { ...video, id, channelId: channel?.id || video.channelId, channel: channel?.name || video.channel || "未知频道", url: video.url || `https://www.youtube.com/watch?v=${id}` }];
  })).values()].filter((video) => video.id && video.channelId && video.publishedAt);
  return { channels, catalog };
}

async function init() {
  initialiseTheme();
  try {
    const [response, seedResponse] = await Promise.all([
      fetch("data/dashboard.json", { cache: "no-store" }),
      fetch("data/benchmark-seeds.json", { cache: "no-store" }).catch(() => null),
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    const seedPayload = seedResponse?.ok ? await seedResponse.json() : {};
    const owned = normaliseGroup(raw.channels, raw.videoCatalog || raw.catalog);
    const benchmarkRows = raw.benchmarks?.length ? raw.benchmarks : seedPayload.benchmarks || [];
    const benchmarks = normaliseGroup(benchmarkRows, raw.benchmarkVideoCatalog || raw.benchmarkCatalog);
    data = { ...owned, benchmarks: benchmarks.channels, benchmarkCatalog: benchmarks.catalog, generatedAt: raw.generatedAt };
    bindControls(); render();
  } catch (error) { $("loadError").hidden = false; $("loadError").textContent = `数据加载失败：${error.message}`; }
}
init();
