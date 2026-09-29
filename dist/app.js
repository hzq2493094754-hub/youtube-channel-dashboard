const $ = (id) => document.getElementById(id);
const COLORS = ["#f17f7f", "#4ed5a0", "#e5bd57", "#ff9f43", "#65a8ff", "#43c6db", "#97c95c", "#a78bfa", "#f36eb5", "#8e9aad", "#f4d35e", "#5dc0a6"];
const compact = new Intl.NumberFormat("zh-HK", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const dateOnly = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" });
let data = { channels: [], catalog: [], generatedAt: null };
const state = { subscriberPeriod: "7", viewsPeriod: "7", trendPeriod: "7", trendMetric: "views", trendChannels: new Set(), breakdownMode: "bar", videoPeriod: "all", videoSort: "desc", videoChannels: new Set() };

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const fmt = (value) => number(value) == null ? "—" : compact.format(Number(value));
const exact = (value) => number(value) == null ? "—" : integer.format(Number(value));
const at = (value) => new Date(value).getTime();
const asOf = () => at(data.generatedAt) || Date.now();
const day = (value) => dateOnly.format(new Date(value));
const time = (value) => value ? dateTime.format(new Date(value)).replace(",", "") : "—";
const periodName = (value) => value === "all" ? "全部记录" : `近 ${value} 日`;
const periodStart = (value) => value === "all" ? -Infinity : asOf() - Number(value) * 86400000;
const initial = (row) => Array.from(row.name || "频")[0] || "频";

function avatar(row) {
  const source = row.avatarDataUrl || row.avatar || "";
  return `<span class="mini-avatar">${esc(initial(row))}${source ? `<img src="${esc(source)}" alt="" onerror="this.remove()">` : ""}</span>`;
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
    target.querySelectorAll("[data-channel]").forEach((node) => node.classList.toggle("is-active", node.dataset.channel === name));
    tip.innerHTML = `<strong>${esc(row.channel.name)}</strong><span>${esc(detail(row))}</span>`;
    tip.hidden = false;
    const rect = wrap.getBoundingClientRect();
    const x = event?.clientX ? event.clientX - rect.left + 10 : wrap.clientWidth / 2 + 16;
    const y = event?.clientY ? event.clientY - rect.top + 10 : 28;
    tip.style.left = `${Math.max(8, Math.min(x, wrap.clientWidth - 195))}px`;
    tip.style.top = `${Math.max(8, Math.min(y, wrap.clientHeight - 64))}px`;
  };
  const hide = () => { tip.hidden = true; target.querySelectorAll("[data-channel]").forEach((node) => node.classList.remove("is-active")); };
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
  const rows = data.channels.filter((channel) => number(channel.subscriberCount) != null).map((channel, index) => ({ channel, value: all ? Number(channel.subscriberCount) : subscriberDelta(channel, period), color: COLORS[index % COLORS.length] })).filter((row) => row.value != null).sort((a, b) => b.value - a.value);
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
  renderDonut("subscriberChart", rows, all ? "公开订阅 · 全部记录" : `订阅净增长 · ${periodName(period)}`, (row) => all ? `公开订阅：${exact(row.value)}` : `订阅净增长：${exact(row.value)} · ${periodName(period)}`);
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
  const rows = data.catalog.filter((row) => at(row.publishedAt) >= periodStart("7") && at(row.publishedAt) <= asOf()).sort((a, b) => at(b.publishedAt) - at(a.publishedAt));
  $("updateCount").textContent = `${exact(rows.length)} 条 · 最近更新优先`;
  $("updatesList").innerHTML = rows.length ? rows.map((row) => `<li><a class="update-link" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${videoThumb(row)}<span class="video-copy"><strong>${esc(row.title)}</strong><span class="video-meta"><b>${esc(row.channel)}</b><time>${time(row.publishedAt)}</time><span>${exact(row.viewCount)} 次播放</span></span></span><span class="outbound">↗</span></a></li>`).join("") : `<li class="empty">近 7 日没有已采集的视频。</li>`;
}

function allChannelIds() { return data.channels.map((channel) => channel.id); }
function channelChoices(targetId, selected, allAction) {
  const all = allChannelIds();
  const allSelected = selected.size === all.length;
  $(targetId).innerHTML = `<button type="button" data-action="${allAction}:all" aria-pressed="${allSelected}">全部频道</button><button type="button" data-action="${allAction}:select" aria-pressed="${allSelected}">全选</button>${data.channels.map((channel) => `<button class="channel-choice" type="button" data-action="${allAction}:${esc(channel.id)}" aria-pressed="${selected.has(channel.id)}">${avatar(channel)}<span>${esc(channel.name)}</span></button>`).join("")}`;
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

function aggregateSeries(series, keys, label) {
  return { id: "aggregate", name: label, color: COLORS[0], points: keys.map((key, index) => ({ key, value: series.reduce((sum, row) => sum + (number(row.points[index]?.value) || 0), 0) })) };
}

function drawLineChart(targetId, series, metricLabel, showTooltip = true) {
  const target = $(targetId);
  const rows = series.flatMap((row) => row.points).filter((row) => number(row.value) != null);
  if (!rows.length) { target.innerHTML = `<div class="empty">暂无可用数据。</div>`; return; }
  const width = 720, height = 310, left = 52, right = 18, top = 18, bottom = 38;
  const count = Math.max(...series.map((row) => row.points.length));
  const values = rows.map((row) => Number(row.value));
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const x = (index) => count < 2 ? left + (width - left - right) / 2 : left + index / (count - 1) * (width - left - right);
  const y = (value) => top + (max - Number(value)) / Math.max(1, max - min) * (height - top - bottom);
  const grid = Array.from({ length: 5 }, (_, index) => { const value = min + (max - min) * index / 4; const yy = y(value); return `<line class="chart-gridline" x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"></line><text class="chart-axis" x="4" y="${yy + 4}">${fmt(value)}</text>`; }).join("");
  const labels = series[0].points.map((row, index) => index % Math.max(1, Math.ceil(count / 6)) === 0 || index === count - 1 ? `<text class="chart-axis" text-anchor="middle" x="${x(index)}" y="${height - 12}">${row.key.slice(5).replace("-", "/")}</text>` : "").join("");
  const paths = series.map((row) => { const path = row.points.map((point, index) => number(point.value) == null ? null : `${index ? "L" : "M"}${x(index)},${y(point.value)}`).filter(Boolean).join(" "); const dots = row.points.map((point, index) => number(point.value) == null ? "" : `<circle class="chart-point" data-index="${index}" data-id="${esc(row.id)}" cx="${x(index)}" cy="${y(point.value)}" r="4" fill="${row.color}"></circle>`).join(""); return `<path class="chart-line" stroke="${row.color}" d="${path}"></path>${dots}`; }).join("");
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(metricLabel)}趋势图">${grid}${labels}${paths}</svg>${showTooltip ? `<div class="tooltip" hidden></div>` : ""}`;
  if (!showTooltip) return;
  const tip = target.querySelector(".tooltip"), svg = target.querySelector("svg");
  const show = (index, event) => { const list = series.map((row) => ({ row, point: row.points[index] })).filter((item) => number(item.point?.value) != null).sort((a, b) => Number(b.point.value) - Number(a.point.value)); if (!list.length) return; tip.innerHTML = `<strong>${list[0].point.key} · ${esc(metricLabel)}</strong>${list.map((item) => `<span><i class="series-dot" style="display:inline-block;background:${item.row.color}"></i> ${esc(item.row.name)}：${fmt(item.point.value)}</span>`).join("")}`; tip.hidden = false; const rect = target.getBoundingClientRect(); const xPos = event.clientX - rect.left + 14; const yPos = event.clientY - rect.top + 14; tip.style.left = `${Math.min(xPos, rect.width - 220)}px`; tip.style.top = `${Math.min(yPos, rect.height - 105)}px`; };
  svg.addEventListener("pointermove", (event) => { const rect = svg.getBoundingClientRect(); const chartX = (event.clientX - rect.left) / rect.width * width; show(Math.max(0, Math.min(count - 1, Math.round((chartX - left) / (width - left - right) * (count - 1)))), event); });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; });
}

function videoClass(video) { if (video.liveBroadcastContent === "live" || video.liveBroadcastContent === "upcoming") return "live"; if (number(video.durationSeconds) != null && Number(video.durationSeconds) <= 180) return "short"; return "long"; }
function metricTotal(channel, period, metric) { if (metric === "subscribers") return subscriberDelta(channel, period); return videosFor(channel.id, period).reduce((sum, video) => sum + valueForMetric(video, metric), 0); }

function renderBreakdown(series, metricLabel) {
  const period = state.trendPeriod, metric = state.trendMetric;
  const target = $("breakdownChart");
  $("breakdownMode").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === state.breakdownMode)));
  if (state.breakdownMode === "line") { drawLineChart("breakdownChart", series, metricLabel, true); $("breakdownLegend").innerHTML = series.map((row) => `<span><i class="series-dot" style="background:${row.color}"></i>${esc(row.name)}</span>`).join(""); $("breakdownNote").textContent = `按 ${periodName(period)} 显示所选频道折线。`; return; }
  const rows = data.channels.filter((channel) => state.trendChannels.has(channel.id)).map((channel) => ({ channel, value: metricTotal(channel, period, metric) })).sort((a, b) => (number(b.value) || -Infinity) - (number(a.value) || -Infinity));
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(number(row.value) || 0)));
  target.innerHTML = `<div class="breakdown-bars">${rows.map((row) => { const width = Math.abs(number(row.value) || 0) / maximum * 100; const videos = videosFor(row.channel.id, period); const groups = videos.reduce((map, video) => { const key = videoClass(video); map[key] = (map[key] || 0) + 1; return map; }, { long: 0, short: 0, live: 0 }); const stack = metric === "uploads" ? `<span class="bar-track stacked"><i style="width:${(groups.long || 0) / Math.max(1, videos.length) * 100}%;background:#4ed5a0"></i><i style="width:${(groups.short || 0) / Math.max(1, videos.length) * 100}%;background:#e5bd57"></i><i style="width:${(groups.live || 0) / Math.max(1, videos.length) * 100}%;background:#f17f7f"></i></span>` : `<span class="bar-track"><span style="width:${width}%"></span></span>`; return `<div class="metric-bar-row"><a class="metric-bar-channel" href="${esc(row.channel.url)}" target="_blank" rel="noopener noreferrer">${avatar(row.channel)}<span>${esc(row.channel.name)}</span></a>${stack}<b class="metric-bar-value">${fmt(row.value)}</b></div>`; }).join("")}</div>`;
  $("breakdownLegend").innerHTML = metric === "uploads" ? `<span><i class="series-dot" style="background:#4ed5a0"></i>长视频</span><span><i class="series-dot" style="background:#e5bd57"></i>短视频</span><span><i class="series-dot" style="background:#f17f7f"></i>直播</span>` : "";
  $("breakdownNote").textContent = `按 ${periodName(period)} 汇总；点击频道可在 YouTube 打开。`;
}

function renderTrend() {
  const metric = state.trendMetric, period = state.trendPeriod;
  const labels = { views: "播放量", subscribers: "新增订阅", likes: "点赞数量", comments: "评论数量", uploads: "更新数量" };
  const keys = rangeKeys(period, metric);
  const chosen = data.channels.filter((channel) => state.trendChannels.has(channel.id));
  const source = chosen.map((channel) => channelSeries(channel, keys, period, metric));
  const all = chosen.length === data.channels.length;
  const main = chosen.length === 1 ? source : [aggregateSeries(source, keys, all ? "全部频道总和" : `所选频道总和 · ${chosen.length} 个频道`)];
  $("aggregateTitle").textContent = main[0]?.name || "全部频道总和";
  $("trendDescription").textContent = metric === "subscribers" ? `${periodName(period)}内的公开订阅快照差值；历史不足时显示已累积区间。` : `${periodName(period)}按视频发布时间汇总当前${labels[metric]}；数值不是当天新增量。`;
  $("trendPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  $("trendMetric").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === metric)));
  channelChoices("trendChannels", state.trendChannels, "trend");
  drawLineChart("trendChart", main, labels[metric]);
  $("trendLegend").innerHTML = main.map((row) => `<span><i class="series-dot" style="background:${row.color}"></i>${esc(row.name)}</span>`).join("");
  renderBreakdown(source, labels[metric]);
}

function renderInventory() {
  const period = state.videoPeriod, start = periodStart(period), selected = state.videoChannels;
  const rows = data.catalog.filter((row) => at(row.publishedAt) >= start && at(row.publishedAt) <= asOf() && (!selected.size || selected.has(row.channelId))).sort((a, b) => state.videoSort === "asc" ? (number(a.viewCount) || 0) - (number(b.viewCount) || 0) : (number(b.viewCount) || 0) - (number(a.viewCount) || 0) || at(b.publishedAt) - at(a.publishedAt));
  $("videoPeriod").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === period)));
  $("videoSort").querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === state.videoSort)));
  channelChoices("videoChannels", selected, "video");
  $("allVideosCount").textContent = `${selected.size ? `已选 ${selected.size} 个频道` : "全部频道"} · ${periodName(period)}发布 · ${exact(rows.length)} 条视频`;
  $("allVideosList").innerHTML = rows.length ? rows.map((row) => `<li><a class="video-link" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${videoThumb(row)}<span class="video-copy"><strong>${esc(row.title)}</strong><span class="video-meta"><b>${esc(row.channel)}</b><time>${time(row.publishedAt)}</time></span></span><span class="views-cell"><b>${exact(row.viewCount)}</b><small>次播放</small></span></a></li>`).join("") : `<li class="empty">所选频道在该时间窗口内暂无已采集视频。</li>`;
}

function render() { renderSubscribers(); renderViews(); renderUpdates(); renderTrend(); renderInventory(); }

function bindControls() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    const inGroup = (id) => button.closest(`#${id}`);
    if (inGroup("subscriberPeriod")) { state.subscriberPeriod = button.dataset.period; renderSubscribers(); return; }
    if (inGroup("viewsPeriod")) { state.viewsPeriod = button.dataset.period; renderViews(); return; }
    if (inGroup("trendPeriod")) { state.trendPeriod = button.dataset.value; renderTrend(); return; }
    if (inGroup("trendMetric")) { state.trendMetric = button.dataset.value; renderTrend(); return; }
    if (inGroup("breakdownMode")) { state.breakdownMode = button.dataset.value; renderTrend(); return; }
    if (inGroup("videoPeriod")) { state.videoPeriod = button.dataset.value; renderInventory(); return; }
    if (inGroup("videoSort")) { state.videoSort = button.dataset.value; renderInventory(); return; }
    const action = button.dataset.action; if (!action) return;
    const [kind, value] = action.split(":"); const ids = allChannelIds(); const target = kind === "trend" ? state.trendChannels : state.videoChannels;
    if (value === "all") { target.clear(); if (kind === "trend") ids.forEach((id) => target.add(id)); }
    else if (value === "select") { target.clear(); ids.forEach((id) => target.add(id)); }
    else if (target.has(value)) target.delete(value); else target.add(value);
    if (kind === "trend") renderTrend(); else renderInventory();
  });
  window.addEventListener("resize", () => { if (data.channels.length) renderTrend(); });
}

async function init() {
  try {
    const response = await fetch("data/dashboard.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    const channels = (raw.channels || []).map((row) => ({ ...row, id: row.id || row.channelId, name: row.name || row.channel || row.id }));
    const byId = new Map(channels.map((row) => [row.id, row]));
    const stored = raw.videoCatalog || raw.catalog || channels.flatMap((channel) => (channel.videos || []).map((video) => ({ ...video, channelId: channel.id, channel: channel.name })));
    const catalog = [...new Map(stored.map((video) => { const channel = byId.get(video.channelId || video.channel_id); const id = video.id || video.videoId; return [id, { ...video, id, channelId: channel?.id || video.channelId, channel: channel?.name || video.channel || "未知频道", url: video.url || `https://www.youtube.com/watch?v=${id}` }]; })).values()].filter((video) => video.id && video.channelId && video.publishedAt);
    data = { channels, catalog, generatedAt: raw.generatedAt };
    allChannelIds().forEach((id) => state.trendChannels.add(id));
    bindControls(); render();
  } catch (error) { $("loadError").hidden = false; $("loadError").textContent = `数据加载失败：${error.message}`; }
}
init();
