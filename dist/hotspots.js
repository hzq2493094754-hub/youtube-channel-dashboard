(() => {
  "use strict";
  let snapshot = null;
  let pending = null;
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const integer = new Intl.NumberFormat("zh-CN");
  const dateTime = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

  function checkBoard(rows) {
    return Array.isArray(rows) && rows.length === 30 && new Set(rows.map((row) => row.topic_name)).size === 30
      && rows.every((row, index) => Number(row.rank) === index + 1 && typeof row.topic_name === "string" && row.topic_name.trim() && /^\d+$/.test(String(row.topic_index)));
  }

  function renderRows(rows, id) {
    $(id).innerHTML = rows.map((row) => {
      const direction = String(row.rank_flag) === "1" ? ["up", "↑", "上升"] : String(row.rank_flag) === "-1" ? ["down", "↓", "下降"] : ["steady", "—", "持平"];
      const searchUrl = `https://www.douyin.com/search/${encodeURIComponent(row.topic_name)}`;
      return `<tr><td class="hotspots-rank">${escape(row.rank)}</td><td class="hotspots-topic"><a href="${escape(searchUrl)}" target="_blank" rel="noopener noreferrer">${escape(row.topic_name)}</a></td><td class="hotspots-number" title="${escape(row.topic_index)}">${integer.format(Number(row.topic_index))}</td><td class="hotspots-direction"><span class="hotspots-${direction[0]}" aria-label="${direction[2]}" title="${direction[2]}">${direction[1]}</span></td><td class="hotspots-category">${escape(row.category || "—")}</td></tr>`;
    }).join("");
  }

  function render() {
    renderRows(snapshot.current, "hotspotsCurrentRows");
    renderRows(snapshot.rocketing, "hotspotsRisingRows");
    $("hotspotsCurrentCount").textContent = `${snapshot.current.length} 条`;
    $("hotspotsRisingCount").textContent = `${snapshot.rocketing.length} 条`;
    $("hotspotsWorkspaceCount").textContent = "60 条";
    $("hotspotsCapturedAt").textContent = `最近采集 ${dateTime.format(new Date(snapshot.generatedAt))}（北京时间）`;
    const status = $("hotspotsStatus");
    const stale = Date.now() - new Date(snapshot.generatedAt).getTime() > 36 * 60 * 60 * 1000;
    status.classList.toggle("is-error", false);
    status.classList.toggle("is-stale", stale);
    status.hidden = !stale;
    status.textContent = stale ? "当前展示上次成功采集的榜单，最新数据暂未同步。" : "";
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
        if (!Number.isFinite(new Date(raw.generatedAt).getTime()) || !checkBoard(raw.current) || !checkBoard(raw.rocketing)) throw new Error("榜单数据不完整");
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
