(() => {
  "use strict";
  let snapshot = null;
  let pending = null;
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const integer = new Intl.NumberFormat("zh-CN");
  const dateTime = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const boards = [
    { key: "hotlist", prefix: "hotspotsHotlist", title: "热点榜", count: 50, columns: 3 },
    { key: "social", prefix: "hotspotsSocial", title: "社会榜", count: 50, columns: 3 },
    { key: "current", prefix: "hotspotsCurrent", title: "实时热点", count: 30, columns: 5 },
    { key: "rocketing", prefix: "hotspotsRising", title: "飙升热点", count: 30, columns: 5 },
  ];

  function checkBoard(rows, count) {
    return Array.isArray(rows) && rows.length === count && new Set(rows.map((row) => row.topic_name)).size === count
      && rows.every((row, index) => Number(row.rank) === index + 1 && typeof row.topic_name === "string" && row.topic_name.trim() && /^\d+$/.test(String(row.topic_index)));
  }

  function renderRows(rows, id, columns) {
    $(id).innerHTML = rows.map((row) => {
      const direction = String(row.rank_flag) === "1" ? ["up", "↑", "上升"] : String(row.rank_flag) === "-1" ? ["down", "↓", "下降"] : ["steady", "—", "持平"];
      const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(row.topic_name)}`;
      return `<tr><td class="hotspots-rank">${escape(row.rank)}</td><td class="hotspots-topic"><a href="${escape(searchUrl)}" target="_blank" rel="noopener noreferrer">${escape(row.topic_name)}</a></td><td class="hotspots-number" title="${escape(row.topic_index)}">${integer.format(Number(row.topic_index))}</td>${columns === 5 ? `<td class="hotspots-direction"><span class="hotspots-${direction[0]}" aria-label="${direction[2]}" title="${direction[2]}">${direction[1]}</span></td><td class="hotspots-category">${escape(row.category || "—")}</td>` : ""}</tr>`;
    }).join("");
  }

  function render() {
    const delayed = [];
    let total = 0;
    for (const board of boards) {
      const rows = snapshot[board.key];
      const available = checkBoard(rows, board.count);
      const metadata = snapshot.boards?.[board.key] || { generatedAt: snapshot.generatedAt, status: "fresh" };
      const captured = new Date(metadata.generatedAt);
      const hasTime = metadata.generatedAt && Number.isFinite(captured.getTime());
      const stale = !available || !hasTime || metadata.status !== "fresh" || Date.now() - captured.getTime() > 36 * 60 * 60 * 1000;
      if (available) {
        renderRows(rows, `${board.prefix}Rows`, board.columns);
        total += rows.length;
      } else {
        $(`${board.prefix}Rows`).innerHTML = `<tr><td colspan="${board.columns}" class="hotspots-empty">该榜单暂未同步，请稍后再查看。</td></tr>`;
      }
      $(`${board.prefix}Count`).textContent = available ? `${rows.length} 条` : "待同步";
      const updated = $(`${board.prefix}UpdatedAt`);
      updated.textContent = available && hasTime ? `${stale ? "保留上次 · " : ""}采集 ${dateTime.format(captured)}` : "等待首次有效采集";
      updated.title = metadata.sourceUpdatedAt ? `平台更新时间：${metadata.sourceUpdatedAt}（北京时间）` : "此处显示最近一次成功采集时间（北京时间）";
      updated.parentElement.classList.toggle("is-stale", stale);
      if (stale) delayed.push(board.title);
    }
    const pinned = $("hotspotsPinned");
    const pinnedRow = checkBoard(snapshot.hotlist, 50) && Array.isArray(snapshot.pinned) ? snapshot.pinned.find(row => row.topic_name) : null;
    pinned.hidden = !pinnedRow;
    pinned.innerHTML = pinnedRow ? `<span>置顶</span><a href="https://www.douyin.com/search/${encodeURIComponent(pinnedRow.topic_name)}" target="_blank" rel="noopener noreferrer">${escape(pinnedRow.topic_name)}</a>` : "";
    $("hotspotsWorkspaceCount").textContent = `${total} 条`;
    $("hotspotsCapturedAt").textContent = `最新采集 ${dateTime.format(new Date(snapshot.generatedAt))}（北京时间）`;
    const status = $("hotspotsStatus");
    status.classList.toggle("is-error", false);
    status.classList.toggle("is-stale", delayed.length > 0);
    status.hidden = delayed.length === 0;
    status.textContent = delayed.length ? `${delayed.join("、")}暂未同步最新数据，已标注各自最近成功采集时间。` : "";
  }

  async function load() {
    if (snapshot) { render(); return; }
    if (pending) return pending;
    const status = $("hotspotsStatus");
    status.hidden = false;
    status.classList.remove("is-error");
    status.textContent = "正在加载热点数据…";
    pending = (async () => {
      try {
        const response = await fetch("data/douyin-hotspots.json", { cache: "no-cache", signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.json();
        if (!Number.isFinite(new Date(raw.generatedAt).getTime()) || !boards.some(board => checkBoard(raw[board.key], board.count))) throw new Error("榜单数据不完整");
        snapshot = raw;
        render();
      } catch (error) {
        $("hotspotsCapturedAt").textContent = "暂未读取到榜单";
        status.hidden = false;
        status.classList.add("is-error");
        status.innerHTML = `热点数据暂时无法加载，请稍后重试。<button type="button" id="hotspotsRetry">重新加载</button>`;
        $("hotspotsRetry").addEventListener("click", () => { void load(); }, { once: true });
      } finally { pending = null; }
    })();
    return pending;
  }

  window.douyinHotspots = { load };
})();
