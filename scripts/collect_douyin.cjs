// Fetch the two public Douyin Index boards without account credentials.
// Invalid or incomplete responses never replace the last successful snapshot.
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PAGE = 'https://creator.douyin.com/creator-micro/creator-count/arithmetic-index?type=1&source=creator';
const APP_ENTRY = 'https://creator.douyin.com/goofy/douyin_creator_pc/mono/creator_count/';
const ENDPOINT = 'https://creator.douyin.com/api/v2/hot/get_current_hot_topic';

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

function validateBoard(rows, name) {
  if (!Array.isArray(rows) || rows.length !== 30) throw new Error(`${name}: expected 30 rows`);
  if (new Set(rows.map(row => row.topic_name)).size !== 30) throw new Error(`${name}: duplicate topics`);
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

async function collect() {
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
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: '抖音指数', sourceUrl: SOURCE_PAGE, sourceUpdatedAt: null,
    current: result.current, rocketing: result.rocketing,
  };
  const content = JSON.stringify(snapshot) + '\n';
  for (const directory of ['public/data', 'dist/data']) {
    const target = path.join(ROOT, directory, 'douyin-hotspots.json');
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    await fs.writeFile(temporary, content, 'utf8');
    await fs.rename(temporary, target);
  }
  console.log(`Douyin Index: current=30, rocketing=30, capturedAt=${snapshot.generatedAt}, bytes=${Buffer.byteLength(content)}`);
  return snapshot;
}

module.exports = { validateBoard, collect };
if (require.main === module) collect().catch(error => { console.error(`Douyin collection failed: ${error.message}`); process.exitCode = 1; });
