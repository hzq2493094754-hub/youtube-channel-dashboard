(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const integer = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
  const dateTime = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const formatDate = value => /^\d{8}$/.test(value || '') ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : '—';
  const metric = value => value == null ? '—' : decimal.format(value);
  let snapshot = null, pending = null, days = '1', selectedRank = null;
  function current() { return snapshot.periods[days]; }
  function filtered() {
    const query = $('hotwordsSearch').value.trim().toLocaleLowerCase();
    const sort = $('hotwordsSort').value;
    return current().items.filter(row => row.title.toLocaleLowerCase().includes(query)).sort((a, b) => (sort === 'heat' ? b.heat - a.heat : sort === 'growth' ? (b.growthRatio ?? -Infinity) - (a.growthRatio ?? -Infinity) : 0) || a.rank - b.rank);
  }
  function trendChart(row) {
    const points = row.trends;
    if (!points.length) return '<p class="hotwords-placeholder">平台暂未提供该内容词的热度曲线。</p>';
    const start = Date.parse(formatDate(points[0].date)), end = Date.parse(formatDate(points.at(-1).date));
    const width = 490, height = 215, left = 58, right = 14, top = 20, bottom = 32;
    const ceiling = Math.max(1, ...points.map(point => point.value)) * 1.08;
    const x = point => end === start ? (width + left - right) / 2 : left + (Date.parse(formatDate(point.date)) - start) / (end - start) * (width - left - right);
    const y = point => height - bottom - point.value / ceiling * (height - top - bottom);
    const axes = [0, .5, 1].map(tick => { const py = height - bottom - tick * (height - top - bottom); return `<line x1="${left}" x2="${width - right}" y1="${py}" y2="${py}" class="hotword-grid"/><text x="${left - 10}" y="${py + 4}" text-anchor="end">${escape(compact.format(ceiling * tick))}</text>`; }).join('');
    const segments = points.slice(1).map((point, index) => {
      const previous = points[index];
      const gap = Date.parse(formatDate(point.date)) - Date.parse(formatDate(previous.date)) > 86400000;
      return `<line x1="${x(previous)}" y1="${y(previous)}" x2="${x(point)}" y2="${y(point)}" class="hotword-line${gap ? ' has-gap' : ''}"/>`;
    }).join('');
    const dots = points.map(point => `<circle cx="${x(point)}" cy="${y(point)}" r="3.4" class="hotword-point"><title>${escape(formatDate(point.date))} · ${escape(decimal.format(point.value))}</title></circle>`).join('');
    const dates = end === start ? `<text x="${x(points[0])}" y="${height - 7}" text-anchor="middle">${escape(formatDate(points[0].date))}</text>` : `<text x="${left}" y="${height - 7}">${escape(formatDate(points[0].date))}</text><text x="${width - right}" y="${height - 7}" text-anchor="end">${escape(formatDate(points.at(-1).date))}</text>`;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(row.title)}：${points.length} 个平台热度记录，${escape(formatDate(points[0].date))} 至 ${escape(formatDate(points.at(-1).date))}">${axes}${segments}${dots}${dates}</svg>`;
  }
  function renderDetail(row) {
    const detail = $('hotwordDetail');
    if (!row) { detail.innerHTML = '<p class="hotwords-placeholder">没有匹配的内容词，请调整搜索条件。</p>'; return; }
    const source = new URL('https://douhot.douyin.com/square/trend/detail');
    source.search = new URLSearchParams({ hot_word: row.title, active_key: row.id, query_day: row.queryDay });
    detail.innerHTML = `<div class="hotword-detail-title"><span class="hotwords-count"># ${row.rank}</span><a href="${escape(source.href)}" target="_blank" rel="noopener noreferrer">热点宝详情 ↗</a></div>
      <h4>${escape(row.title)}</h4><p class="hotwords-meta">近 ${days} 天 · 平台日期 ${escape(formatDate(row.queryDay))}</p>
      <dl class="hotword-metrics"><div><dt>飙升指数</dt><dd>${integer.format(row.heat)}</dd></div><div><dt>上期指数</dt><dd>${metric(row.previousHeat)}</dd></div><div><dt>飙升比例 · 原值</dt><dd>${metric(row.growthRatio)}</dd></div>${row.risingSpeed ? `<div><dt>飙升速度</dt><dd>${escape(row.risingSpeed)}</dd></div>` : ''}</dl>
      <div class="hotword-chart-heading"><h5>热度趋势</h5><span>${row.trends.length} 个记录点</span></div><div class="hotword-chart">${trendChart(row)}</div>
      <p class="hotword-chart-note">曲线为平台提供的热度值，与上方飙升指数口径不同。虚线跨过缺失日期，不补零；仅一个记录时显示单点。</p>
      ${row.trends.length ? `<details class="hotword-points"><summary>查看各日期热度原值</summary><div class="hotword-point-list">${row.trends.map(point => `<div><time datetime="${escape(formatDate(point.date))}">${escape(formatDate(point.date))}</time><b>${metric(point.value)}</b></div>`).join('')}</div></details>` : ''}`;
  }
  function select(rank, reveal = false) {
    selectedRank = rank;
    for (const button of $('hotwordsRows').querySelectorAll('[data-rank]')) {
      const active = Number(button.dataset.rank) === rank;
      button.setAttribute('aria-pressed', String(active));
      button.closest('tr').classList.toggle('is-selected', active);
    }
    renderDetail(current().items.find(row => row.rank === rank));
    if (reveal && window.matchMedia?.('(max-width: 1100px)').matches) $('hotwordDetail').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function render(resetScroll = true) {
    const period = current(), rows = filtered();
    if (!rows.some(row => row.rank === selectedRank)) selectedRank = rows[0]?.rank ?? null;
    $('hotwordsRows').innerHTML = rows.length ? rows.map(row => `<tr><td class="hotspots-rank">${row.rank}</td><td><button type="button" class="hotword-title" data-rank="${row.rank}" aria-pressed="false">${escape(row.title)}</button></td><td class="hotspots-number">${integer.format(row.heat)}</td><td class="hotspots-number hotword-ratio" title="平台 rising_ratio 原值，不转换为百分比">${metric(row.growthRatio)}</td></tr>`).join('') : '<tr><td colspan="4" class="hotspots-empty">前 200 条内没有匹配结果</td></tr>';
    $('hotwordsCount').textContent = `${rows.length} / ${period.count} 条`;
    $('hotwordsMeta').textContent = `近 ${days} 天 · 已同步前 ${period.count} 条 / 平台 ${integer.format(period.platformTotal)} 条 · 搜索仅限已同步内容词`;
    $('hotwordsUpdatedAt').textContent = `采集 ${dateTime.format(new Date(period.capturedAt))}（北京时间）`;
    const stale = Date.now() - Date.parse(period.capturedAt) > 36 * 60 * 60 * 1000;
    const status = $('hotwordsStatus');
    status.hidden = !stale;
    status.classList.toggle('is-stale', stale);
    status.classList.remove('is-error');
    status.textContent = stale ? '内容词保留的是上次成功采集结果；需要在本机登录采集并同步后才会更新。' : '';
    $('hotwordsExport').disabled = !rows.length;
    for (const button of $('hotwordsPeriod').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.days === days));
    select(selectedRank);
    if (resetScroll) $('hotwordsRows').closest('.hotwords-table-scroll').scrollTop = 0;
  }
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\t\r\n]|^\s*[=+@\-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  function exportCsv() {
    if (!snapshot) return;
    const period = current();
    const columns = ['排名', '内容词', '飙升指数', '上期指数', '飙升比例（平台原值）', '飙升速度', '平台日期', '统计天数', '采集时间（北京时间）'];
    const rows = filtered().map(row => [row.rank, row.title, row.heat, row.previousHeat, row.growthRatio, row.risingSpeed, formatDate(row.queryDay), days, dateTime.format(new Date(period.capturedAt))]);
    const csv = '\uFEFF' + [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `douyin-content-words-${days}d-${period.capturedAt.slice(0, 10)}.csv`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function valid(raw) {
    return raw?.schemaVersion === 1 && [1, 7, 30].every(day => {
      const period = raw.periods?.[day];
      return period?.days === day && Number.isFinite(Date.parse(period.capturedAt)) && period.count === 200 && period.platformTotal >= period.count && period.items?.length === period.count
        && new Set(period.items.map(row => row.title)).size === period.count && period.items.every((row, index) => row.rank === index + 1 && typeof row.title === 'string' && Number.isFinite(row.heat) && (row.growthRatio === null || Number.isFinite(row.growthRatio)) && Array.isArray(row.trends) && row.trends.every(point => /^\d{8}$/.test(point.date) && Number.isFinite(point.value) && point.value >= 0));
    });
  }
  async function load() {
    if (snapshot) return;
    if (pending) return pending;
    const status = $('hotwordsStatus'); status.hidden = false; status.classList.remove('is-error'); status.textContent = '正在加载内容词…';
    pending = (async () => {
      try {
        const response = await fetch('data/douyin-hotwords.json', { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.json();
        if (!valid(raw)) throw new Error('内容词快照不完整');
        snapshot = raw; render();
      } catch {
        $('hotwordsMeta').textContent = '内容词暂未成功加载，四个公开榜单仍可查看。';
        status.hidden = false; status.classList.add('is-error');
        status.innerHTML = '内容词暂时无法加载。<button type="button" id="hotwordsRetry">重新加载</button>';
        $('hotwordsRetry').addEventListener('click', () => { void load(); }, { once: true });
      } finally { pending = null; }
    })();
    return pending;
  }
  $('hotwordsPeriod').addEventListener('click', event => { const button = event.target.closest('[data-days]'); if (button && snapshot) { days = button.dataset.days; selectedRank = null; render(); } });
  $('hotwordsSearch').addEventListener('input', () => { if (snapshot) render(); });
  $('hotwordsSort').addEventListener('change', () => { if (snapshot) render(); });
  $('hotwordsRows').addEventListener('click', event => { const button = event.target.closest('[data-rank]'); if (button && snapshot) select(Number(button.dataset.rank), true); });
  $('hotwordsExport').addEventListener('click', exportCsv);
  window.douyinContentWords = { load };
})();
