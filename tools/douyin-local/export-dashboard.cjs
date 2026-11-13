const fs = require('node:fs/promises');
const path = require('node:path');
const SOURCE = 'https://douhot.douyin.com/square/trend?active_tab=hotword_all';

function cleanSnapshot(raw) {
  if (![1, 7, 30].includes(raw.days) || !Number.isFinite(Date.parse(raw.capturedAt)) || !Array.isArray(raw.items) || raw.items.length < 200) throw new Error('需要完整的前 200 条内容词和有效采集时间。');
  const date = value => {
    if (!/^\d{8}$/.test(String(value))) throw new Error('平台日期无效。');
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) throw new Error('平台日期无效。');
    return value;
  };
  const number = value => value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  const items = raw.items.slice(0, 200).map((row, index) => {
    if (row.rank !== index + 1 || typeof row.title !== 'string' || !row.title.trim() || number(row.heat) === null) throw new Error('排名或指数不完整，原有看板文件已保留。');
    const points = new Map();
    for (const point of row.trends || []) {
      const value = number(point.value);
      if (value === null || value < 0) throw new Error('平台趋势值无效。');
      points.set(date(point.date), value);
    }
    return { rank: row.rank, title: row.title.trim(), heat: number(row.heat), previousHeat: number(row.previousHeat), growthRatio: number(row.growthRatio), risingSpeed: typeof row.risingSpeed === 'string' ? row.risingSpeed : '', id: typeof row.id === 'string' ? row.id : '', queryDay: date(row.queryDay), trends: [...points].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })) };
  });
  if (new Set(items.map(item => item.title)).size !== 200 || !Number.isSafeInteger(raw.platformTotal) || raw.platformTotal < 200) throw new Error('内容词重复或平台总数无效。');
  return { days: raw.days, capturedAt: new Date(raw.capturedAt).toISOString(), platformTotal: raw.platformTotal, count: items.length, complete: raw.platformTotal === items.length, items };
}

async function exportDashboard(root = path.resolve(__dirname, '../..')) {
  const directory = path.join(root, '.local/douyin-content-words');
  const files = (await fs.readdir(directory)).filter(name => /^hotwords-.*\.json$/.test(name) && !name.includes('latest'));
  const periods = {}, skipped = [];
  for (const name of files) {
    let snapshot;
    try { snapshot = cleanSnapshot(JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))); }
    catch { skipped.push(name); continue; }
    if (!periods[snapshot.days] || snapshot.capturedAt > periods[snapshot.days].capturedAt) periods[snapshot.days] = snapshot;
  }
  if (![1, 7, 30].every(days => periods[days])) throw new Error('请先完成近 1、7、30 天各前 200 条采集，原有看板文件已保留。');
  const result = { schemaVersion: 1, source: '抖音热点宝 · 内容词趋势', sourceUrl: SOURCE, timeZone: 'Asia/Shanghai', generatedAt: Object.values(periods).map(snapshot => snapshot.capturedAt).sort().at(-1), periods };
  const target = path.join(root, 'dist/data/douyin-hotwords.json');
  await fs.writeFile(target + '.tmp', JSON.stringify(result) + '\n', 'utf8');
  await fs.rename(target + '.tmp', target);
  return { file: target, skipped, periods: Object.fromEntries(Object.entries(periods).map(([days, snapshot]) => [days, { count: snapshot.count, capturedAt: snapshot.capturedAt }])) };
}
if (require.main === module) exportDashboard().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { cleanSnapshot, exportDashboard };
