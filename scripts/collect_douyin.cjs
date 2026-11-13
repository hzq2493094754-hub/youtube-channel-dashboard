// Fetch public Douyin rankings without account credentials.
// Each board keeps its own last successful snapshot when a source fails.
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PAGE = 'https://creator.douyin.com/creator-micro/creator-count/arithmetic-index?type=1&source=creator';
const APP_ENTRY = 'https://creator.douyin.com/goofy/douyin_creator_pc/mono/creator_count/';
const ENDPOINT = 'https://creator.douyin.com/api/v2/hot/get_current_hot_topic';
const RANKING_ENDPOINT = 'https://so-landing.douyin.com/aweme/v1/hot/search/list/';
const BOARD_DEFINITIONS = {
  hotlist: { title: '抖音热点榜', count: 50, sourceUrl: 'https://so-landing.douyin.com/landings/hotlist?board_type=0' },
  social: { title: '抖音社会榜', count: 50, sourceUrl: 'https://so-landing.douyin.com/landings/hotlist?board_type=2&board_sub_type=4' },
  current: { title: '抖音实时热点', count: 30, sourceUrl: SOURCE_PAGE },
  rocketing: { title: '抖音飙升热点', count: 30, sourceUrl: SOURCE_PAGE },
};

async function get(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { text: await response.text(), encoding: response.headers.get('x-encrypted') };
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

function validateBoard(rows, name, count = 30) {
  if (!Array.isArray(rows) || rows.length !== count) throw new Error(`${name}: expected ${count} rows`);
  if (new Set(rows.map(row => row.topic_name)).size !== count) throw new Error(`${name}: duplicate topics`);
  if (!rows.every((row, index) => Number(row.rank) === index + 1
    && typeof row.topic_name === 'string' && row.topic_name.trim()
    && !/(\.\.\.|…)$/.test(row.topic_name) && /^\d+$/.test(String(row.topic_index)))) {
    throw new Error(`${name}: incomplete titles, ranks or indices`);
  }
}

async function decode(mainText, polyfillText, payload, encoding) {
  if (!encoding) return payload;
  const modules = {};
  // Register the site's public client modules, but do not execute its app
  // bootstrap. Only the normal response decoder and Babel helpers are called.
  // The context has no browser session, filesystem or network access.
  const sandbox = {
    window: { crypto: webcrypto, atob, TextDecoder, JSON },
    self: { webpackChunkcount_fe: { push(chunk) { Object.assign(modules, chunk[1]); } } },
    Uint8Array, TextDecoder, atob, URL, Promise,
  };
  const context = vm.createContext(sandbox);
  for (const source of [mainText, polyfillText]) vm.runInContext(source, context, { timeout: 3000 });
  const cache = {};
  function load(id) {
    if (cache[id]) return cache[id].exports;
    if (!modules[id]) throw new Error('Douyin response decoder changed; retained the previous snapshot.');
    const module = { exports: {} };
    cache[id] = module;
    modules[id](module, module.exports, load);
    return module.exports;
  }
  load.d = (exports, definitions) => {
    for (const [key, getter] of Object.entries(definitions)) Object.defineProperty(exports, key, { enumerable: true, get: getter });
  };
  sandbox.i = load(23563);
  sandbox.c = load(95067);
  if (!modules[7434]) throw new Error('Douyin response decoder module changed.');
  const source = modules[7434].toString();
  const start = source.indexOf('!function(e,t,n)');
  const end = source.indexOf(';n(62862)', start);
  if (start < 0 || end < 0) throw new Error('Douyin response decoder changed.');
  vm.runInContext(`var a;${source.slice(start, end)};globalThis.decodeHotResponse=a;`, context, { timeout: 3000 });
  const result = await Promise.race([
    sandbox.decodeHotResponse(payload, encoding),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Decoding timed out')), 8000); timer.unref(); }),
  ]);
  if (!result || typeof result !== 'object') throw new Error('Could not read the original page response.');
  return result;
}

async function collectIndex() {
  const entry = await get(APP_ENTRY);
  const scripts = [...entry.text.matchAll(/<script\b[^>]*src=["']([^"']+)["']/g)].map(match => new URL(match[1], APP_ENTRY));
  const asset = pattern => {
    const url = scripts.find(url => url.protocol === 'https:' && url.hostname === 'lf-fe-creator.douyinstatic.com' && pattern.test(url.pathname));
    if (!url) throw new Error('Could not find the original page data reader.');
    return url.href;
  };
  const [mainScript, polyfillScript, raw] = await Promise.all([
    get(asset(/\/static\/js\/main\.[\w]+\.js$/)),
    get(asset(/\/static\/js\/lib-polyfill\.[\w]+\.js$/)),
    get(ENDPOINT),
  ]);
  const envelope = JSON.parse(raw.text);
  if (envelope.status !== 0) throw new Error(`Douyin returned status ${envelope.status}`);
  const result = await decode(mainScript.text, polyfillScript.text, envelope.data, raw.encoding);
  validateBoard(result.current, 'current');
  validateBoard(result.rocketing, 'rocketing');
  return { current: result.current, rocketing: result.rocketing, sourceUpdatedAt: null };
}

async function collectRanking(boardType, boardSubType, key) {
  const url = new URL(RANKING_ENDPOINT);
  const parameters = { detail_list: '1', board_type: String(boardType), board_sub_type: boardSubType, need_board_tab: 'true', need_covid_tab: 'false', aid: '581610', version_code: '32.3.0' };
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  const response = JSON.parse((await get(url)).text);
  if (response.status_code !== 0 || !Array.isArray(response.data?.word_list)) throw new Error(`${key}: source did not return a ranking`);
  const board = response.board_tabs?.find(row => row.board_type === boardType && String(row.board_sub_type) === boardSubType);
  if (!board || (key === 'social' && board.tab_name !== '社会榜')) throw new Error(`${key}: source board changed`);
  const ranked = response.data.word_list.filter(row => Number.isInteger(row.position) && row.position > 0).sort((a, b) => a.position - b.position);
  for (const row of ranked) {
    const origin = JSON.parse(row.hotlist_param);
    if (origin.board_type !== boardType || String(origin.board_sub_type || '') !== boardSubType) throw new Error(`${key}: unexpected source board`);
  }
  const rows = ranked.map(row => ({
    rank: row.position, topic_name: row.word, topic_index: String(row.hot_value),
    highest_rank: row.max_rank ?? null, view_count: row.view_count ?? null,
    video_count: row.video_count ?? null, sentence_id: row.sentence_id, label_code: row.label ?? 0,
  }));
  validateBoard(rows, key, 50);
  return {
    [key]: rows, sourceUpdatedAt: response.data.active_time || null,
    pinned: key === 'hotlist' ? response.data.word_list.filter(row => !row.position && typeof row.word === 'string' && row.word.trim()).map(row => ({ topic_name: row.word })) : [],
  };
}

function combineSnapshots(previous, results, capturedAt) {
  const snapshot = { schemaVersion: 2, generatedAt: capturedAt, source: '抖音热点', sourceUrl: SOURCE_PAGE, boards: {}, pinned: previous.pinned || [] };
  const groups = [['current', 'rocketing'], ['hotlist'], ['social']];
  let refreshed = 0;
  for (const [index, keys] of groups.entries()) {
    const result = results[index];
    if (result.status === 'fulfilled') {
      for (const key of keys) {
        validateBoard(result.value[key], key, BOARD_DEFINITIONS[key].count);
        snapshot[key] = result.value[key];
        snapshot.boards[key] = { ...BOARD_DEFINITIONS[key], generatedAt: capturedAt, sourceUpdatedAt: result.value.sourceUpdatedAt, status: 'fresh' };
        refreshed++;
      }
      if (keys.includes('hotlist')) snapshot.pinned = result.value.pinned;
    } else {
      console.warn(`Retained previous ${keys.join('/')} board: ${result.reason?.message || 'collection failed'}`);
      for (const key of keys) {
        let available = false;
        try { validateBoard(previous[key], key, BOARD_DEFINITIONS[key].count); available = true; } catch {}
        snapshot[key] = available ? previous[key] : [];
        snapshot.boards[key] = {
          ...BOARD_DEFINITIONS[key], generatedAt: available ? (previous.boards?.[key]?.generatedAt || previous.generatedAt) : null,
          sourceUpdatedAt: previous.boards?.[key]?.sourceUpdatedAt || null, status: available ? 'retained' : 'unavailable',
        };
      }
    }
  }
  if (!refreshed) throw new Error('All Douyin sources failed; the previous snapshot was preserved.');
  return snapshot;
}

async function collect() {
  let previous = {};
  try { previous = JSON.parse(await fs.readFile(path.join(ROOT, 'dist/data/douyin-hotspots.json'), 'utf8')); } catch {}
  const results = await Promise.allSettled([collectIndex(), collectRanking(0, '', 'hotlist'), collectRanking(2, '4', 'social')]);
  const snapshot = combineSnapshots(previous, results, new Date().toISOString());
  const content = JSON.stringify(snapshot) + '\n';
  for (const directory of ['public/data', 'dist/data']) {
    const target = path.join(ROOT, directory, 'douyin-hotspots.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    await fs.writeFile(temporary, content, 'utf8');
    await fs.rename(temporary, target);
  }
  console.log(`Douyin boards: ${Object.keys(BOARD_DEFINITIONS).map(key => `${key}=${snapshot[key].length}(${snapshot.boards[key].status})`).join(', ')}, capturedAt=${snapshot.generatedAt}, bytes=${Buffer.byteLength(content)}`);
  return snapshot;
}

module.exports = { validateBoard, combineSnapshots, collect, BOARD_DEFINITIONS };
if (require.main === module) collect().catch(error => { console.error(`Douyin collection failed: ${error.message}`); process.exitCode = 1; });
