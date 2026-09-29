'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CircleAlert,
  Eye,
  Film,
  Radio,
  RefreshCw,
  Users,
} from 'lucide-react';

type Period = '7' | '30' | 'all';
type HistoryPoint = { observedAt: string; subscriberCount: number | null; channelViews: number | null };
type Video = { id: string; title: string; publishedAt: string; viewCount: number | null; likeCount: number | null; thumbnail: string | null; url: string };
type Channel = { id: string; name: string; url: string; avatar: string | null; subscriberCount: number | null; channelViews: number | null; videoCount: number | null; lastPublishedAt: string | null; uploads7d: number; history: HistoryPoint[]; videos: Video[] };
type DashboardData = { generatedAt: string | null; collector: { status: 'waiting' | 'ok' | 'error'; message: string; channelsCollected: number }; channels: Channel[] };

const emptyDashboard: DashboardData = {
  generatedAt: null,
  collector: { status: 'waiting', message: '等待频道链接。收到链接后即可开始首次公开数据采集。', channelsCollected: 0 },
  channels: [],
};
const periodLabels: Record<Period, string> = { '7': '近 7 日', '30': '近 30 日', all: '全部记录' };
const dayMs = 24 * 60 * 60 * 1000;

function compact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
function exact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}
function localTime(value: string | null) {
  if (!value) return '尚未采集';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未采集';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
function relativeTime(value: string | null) {
  if (!value) return '未更新';
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta) || delta < 0) return '刚刚更新';
  const hours = Math.floor(delta / (60 * 60 * 1000));
  if (hours < 1) return '刚刚更新';
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.floor(hours / 24)} 天前更新`;
}
function baseline(channel: Channel, period: Period) {
  const history = [...channel.history].filter((point) => point.subscriberCount != null).sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  if (!history.length) return null;
  if (period === 'all') return history[0].subscriberCount;
  const cutoff = Date.now() - Number(period) * dayMs;
  const before = history.filter((point) => new Date(point.observedAt).getTime() <= cutoff);
  return before.length ? before[before.length - 1].subscriberCount : null;
}
function subscriberChange(channel: Channel, period: Period) {
  if (period === 'all' || channel.subscriberCount == null) return null;
  const previous = baseline(channel, period);
  return previous == null ? null : channel.subscriberCount - previous;
}
function Sparkline({ points }: { points: HistoryPoint[] }) {
  const values = points.map((point) => point.subscriberCount).filter((value): value is number => value != null);
  if (values.length < 2) return <span className="spark-empty">数据积累中</span>;
  const min = Math.min(...values); const range = Math.max(...values) - min || 1;
  const coordinates = values.map((value, index) => `${(index / (values.length - 1)) * 100},${32 - ((value - min) / range) * 26}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 100 36" preserveAspectRatio="none" aria-label="订阅历史趋势"><polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="2.6" vectorEffect="non-scaling-stroke" /></svg>;
}
function Avatar({ channel }: { channel: Channel }) {
  return <span className="avatar avatar--empty" aria-hidden="true">{channel.name.trim().slice(0, 1) || '频'}</span>;
}
function MetricCard({ icon, label, value, note, tone = 'mint' }: { icon: React.ReactNode; label: string; value: string; note: string; tone?: 'mint' | 'amber' | 'blue' }) {
  return <article className={`metric-card ${tone}`}><div className="metric-card__head"><span className="metric-card__icon">{icon}</span><span>{label}</span></div><strong>{value}</strong><p>{note}</p></article>;
}

export default function Home() {
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [period, setPeriod] = useState<Period>('7');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch('/data/dashboard.json', { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error('无法读取看板数据'); return response.json();
    }).then((payload: DashboardData) => active && setData(payload)).catch(() => active && setData(emptyDashboard)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  const totals = useMemo(() => data.channels.reduce((summary, channel) => ({ subscribers: summary.subscribers + (channel.subscriberCount ?? 0), views: summary.views + (channel.channelViews ?? 0), uploads: summary.uploads + channel.uploads7d }), { subscribers: 0, views: 0, uploads: 0 }), [data.channels]);
  const ranked = useMemo(() => [...data.channels].sort((a, b) => (b.subscriberCount ?? -1) - (a.subscriberCount ?? -1)), [data.channels]);
  const recentVideos = useMemo(() => data.channels.flatMap((channel) => channel.videos.map((video) => ({ ...video, channel: channel.name }))).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()).slice(0, 8), [data.channels]);

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Activity size={19} strokeWidth={2.4} /></span><span>CHANNEL / OBSERVER</span></div><div className="topbar-status"><span className={data.collector.status === 'ok' ? 'status-dot live' : 'status-dot'} />{loading ? '正在读取看板' : relativeTime(data.generatedAt)}</div></header>
    <section className="dashboard-wrap">
      <div className="dashboard-heading"><div><p className="eyebrow">PUBLIC YOUTUBE INTELLIGENCE</p><h1>YouTube 频道观察站</h1><p className="subtitle">追踪指定频道的公开数据、最近上传和自己积累的增长快照。</p></div><div className="period-switch" aria-label="统计时间窗口">{(Object.keys(periodLabels) as Period[]).map((item) => <button type="button" key={item} onClick={() => setPeriod(item)} aria-pressed={period === item}>{item === 'all' ? '全部' : `${item}D`}</button>)}</div></div>
      <section className="metric-grid" aria-label="频道汇总"><MetricCard icon={<Users size={18} />} label="公开订阅合计" value={data.channels.length ? compact(totals.subscribers) : '—'} note={data.channels.length ? `${data.channels.length} 个频道公开值` : '等待首次采集'} /><MetricCard icon={<Eye size={18} />} label="频道总播放合计" value={data.channels.length ? compact(totals.views) : '—'} note={data.channels.length ? '频道公开累计播放' : '等待首次采集'} tone="blue" /><MetricCard icon={<Film size={18} />} label="近 7 日更新" value={data.channels.length ? exact(totals.uploads) : '—'} note={data.channels.length ? '按公开视频发布时间统计' : '等待频道目录'} tone="amber" /></section>
      <section className="content-grid">
        <article className="panel leaderboard"><div className="panel-heading"><div><p className="eyebrow">CHANNEL RANKING</p><h2>频道排行</h2></div><span className="panel-note">{periodLabels[period]}</span></div>{ranked.length ? <div className="rank-list">{ranked.map((channel, index) => { const delta = subscriberChange(channel, period); return <div className="rank-row" key={channel.id}><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><Avatar channel={channel} /><div className="rank-name"><a href={channel.url} target="_blank" rel="noreferrer">{channel.name}</a><span>{exact(channel.videoCount)} 条公开视频</span></div><div className="rank-stat"><strong>{compact(channel.subscriberCount)}</strong><span>订阅</span></div><div className={`delta ${delta == null ? 'neutral' : delta >= 0 ? 'up' : 'down'}`}>{delta == null ? '历史积累中' : <>{delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{delta > 0 ? '+' : ''}{exact(delta)}</>}</div></div>; })}</div> : <div className="empty-state"><Radio size={20} /><div><strong>尚未添加监测频道</strong><p>把频道链接发到本对话。首次采集完成后，这里会显示公开订阅排行和增长变化。</p></div></div>}</article>
        <aside className="panel collector-panel"><div className="panel-heading"><div><p className="eyebrow">COLLECTOR</p><h2>采集状态</h2></div><RefreshCw size={17} className={loading ? 'spin' : ''} /></div><div className={`collector-status ${data.collector.status}`}><span className="status-dot" />{data.collector.status === 'ok' ? '采集正常' : '等待配置'}</div><p className="collector-message">{data.collector.message}</p><dl className="collector-meta"><div><dt>上次生成</dt><dd>{localTime(data.generatedAt)}</dd></div><div><dt>已采集频道</dt><dd>{data.collector.channelsCollected} 个</dd></div><div><dt>数据来源</dt><dd>YouTube Data API</dd></div></dl><div className="collector-foot"><CircleAlert size={15} /><span>只读取公开视频与统计，不需要频道主授权。</span></div></aside>
      </section>
      {ranked.length > 0 && <section className="channel-section"><div className="section-heading"><div><p className="eyebrow">CHANNEL PULSE</p><h2>频道脉冲</h2></div><span>{periodLabels[period]}订阅变化</span></div><div className="channel-grid">{ranked.map((channel) => { const delta = subscriberChange(channel, period); return <article className="channel-card" key={channel.id}><div className="channel-card__head"><div className="channel-title"><Avatar channel={channel} /><div><a href={channel.url} target="_blank" rel="noreferrer">{channel.name}</a><span>{channel.lastPublishedAt ? `最近更新 ${localTime(channel.lastPublishedAt)}` : '暂无发布时间'}</span></div></div><BarChart3 size={18} /></div><div className="channel-card__metrics"><div><span>公开订阅</span><strong>{compact(channel.subscriberCount)}</strong></div><div><span>{periodLabels[period]}变化</span><strong className={delta == null ? '' : delta >= 0 ? 'positive' : 'negative'}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${exact(delta)}`}</strong></div><Sparkline points={channel.history} /></div></article>; })}</div></section>}
      <section className="panel videos-panel"><div className="panel-heading"><div><p className="eyebrow">RECENT UPLOADS</p><h2>最近更新</h2></div><span className="panel-note">按发布时间排序</span></div>{recentVideos.length ? <div className="video-list">{recentVideos.map((video) => <a className="video-row" href={video.url} key={video.id} target="_blank" rel="noreferrer"><span className="video-thumb"><Film size={18} /></span><span className="video-copy"><strong>{video.title}</strong><span>{video.channel} · {localTime(video.publishedAt)}</span></span><span className="video-views"><strong>{compact(video.viewCount)}</strong><span>次播放</span></span></a>)}</div> : <div className="empty-videos"><CalendarClock size={19} /><span>频道加入后，这里会汇总各频道最近公开视频。</span></div>}</section>
    </section>
  </main>;
}
