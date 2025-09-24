#!/usr/bin/env node
/**
 * webuster.js
 *
 * Usage:
 *   node find_api_and_swagger_v2.js <target-url> [--out=results.json] [--paths=my_paths.txt] [--puppeteer] [--fuzz]
 *
 * - --puppeteer  : run headless browser (install puppeteer) to capture runtime requests (optional)
 * - --fuzz       : aggressive fuzzing of many swagger/openapi-like paths (use carefully)
 * - --paths=file : additional custom probe paths (one per line)
 *
 * Node 18+ recommended (global fetch). If Node < 18, install node-fetch and adapt the fetch usage.
 *
 * Ethical reminder: only scan sites you own or have explicit permission to test.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as wait } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- Configuration ----------------
const DEFAULT_TIMEOUT = 10000; // ms per fetch
const CONCURRENCY = 8;
const USER_AGENT = 'find_api_and_swagger_v2/1.0 (+https://example)'; // change if you like
const POLITE_DELAY_MS = 15; // small delay between requests to be polite

// ANSI colors (no dependency)
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const COLORS = {
        swagger: 'color: #1E90FF; font-weight: bold;',     // Blue
        altDocs: 'color: #32CD32; font-weight: bold;',     // Green
        config: 'color: #FF8C00; font-weight: bold;',      // Orange
        api: 'color: #DC143C; font-weight: bold;',         // Red
        normal: 'color: #000;'
    };

function c(text, col = '') { return (col || '') + text + colors.reset; }

// ---------------- Lists & Regexes ----------------

// Extended common swagger/openapi paths (includes v1,v2,v3 variants and many filenames)
const COMMON_SWAGGER_PATHS = [
  '/swagger.json',
  '/openapi.json',
  '/openapi.yaml',
  '/openapi.yml',
  '/v1/openapi.json',
  '/v2/openapi.json',
  '/v3/openapi.json',
  '/v1/swagger.json',
  '/v2/swagger.json',
  '/v3/swagger.json',
  '/swagger/v1/swagger.json',
  '/swagger/v2/swagger.json',
  '/api-docs',
  '/api-docs.json',
  '/api-docs/swagger.json',
  '/v3/api-docs',
  '/v3/api-docs/swagger-config',
  '/swagger-resources',
  '/swagger-resources/configuration/ui',
  '/swagger-resources/configuration/security',
  '/swagger-ui/index.html',
  '/swagger-ui.html',
  '/swagger-ui/',
  '/docs/swagger.json',
  '/docs/openapi.json',
  '/docs/openapi.yaml',
  '/docs/swagger.yaml',
  '/api/openapi.json',
  '/api/swagger.json',
  '/.well-known/openapi.json',
  '/swagger.json.gz',
  '/openapi.json.gz',
  '/openapi/v1.json',
  '/openapi/v2.json',
  '/openapi/v3.json'
];

// Aggressive fuzz list (use with --fuzz). This is a compact but broad set — editable.
const AGGRESSIVE_SWAGGER_WORDLIST = [
  '/swagger.json','/openapi.json','/openapi.yaml','/openapi.yml','/api-docs.json','/v1/openapi.json','/v2/openapi.json',
  '/v3/openapi.json','/v3/api-docs','/docs/swagger.json','/swagger-ui/index.html','/swagger-ui.html','/api/swagger.json',
  '/api/v1/swagger.json','/api/v2/swagger.json','/api/v3/swagger.json','/swagger-resources','/api/openapi.yaml','/openapi/v3.json',
  '/static/swagger.json','/static/openapi.json','/manifest.json','/appsettings.json','/config.json','/config.js','/dist/openapi.json',
  '/api-docs','/openapi','/swagger','/v3/openapi.yaml','/swagger.json.gz','/.well-known/openapi.json','/redoc', '/redoc/index.html', '/docs', '/docs/index.html', '/api/docs', '/apidocs',
  '/api-docs/v1','/api-docs/v2','/api-docs/v3','/v1/api-docs','/v2/api-docs','/v3/api-docs','/swagger/v1/swagger.json',
  '/swagger/v2/swagger.json','/swagger/v3/swagger.json','/api/swagger/v1/swagger.json','/api/swagger/v2/swagger.json',
  '/api/swagger/v3/swagger.json','/v1/openapi.yaml','/v2/openapi.yaml','/v3/openapi.yaml','/v1/openapi.yml','/v2/openapi.yml',
  '/v3/openapi.yml','/docs/openapi.yml','/docs/openapi.yaml','/docs/swagger.yaml','/docs/swagger.yml','/api-docs/swagger.json',
  '/v3/api-docs/swagger-config','/swagger-resources/configuration/ui','/swagger-resources/configuration/security',
  '/swagger-ui/index.html?url=/openapi.json','/swagger-ui/index.html?url=/swagger.json','/graphql', '/graphql/playground', '/graphiql', '/playground', '/api/graphql',  '/rapi-doc', '/rapi-doc/index.html', '/rapipdf', '/rapipdf/index.html','/elements', '/elements/index.html', '/docs/elements', '/postman.json', '/collection.json', '/collections.json', '/api/collection.json',  '/asyncapi.json', '/asyncapi.yaml', '/asyncapi.yml',  '/api-docs/index.html', '/help/api', '/developer', '/developers', '/reference',
   '/.well-known/apiconfig.json', '/apiconfig.json', '/env.json', '/service/openapi.json', '/services/openapi.json', '/gateway/openapi.json'
  // Note: this list can be extended further, but be careful with too many entries as
  // additional fuzzing entries will be generated dynamically (see code)
];

// Common config / possible files where backend / base API url is defined
const COMMON_CONFIG_PATHS = [
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.env.development',
  '/env',
  '/config.js',
  '/config.json',
  '/appsettings.json',
  '/package.json',
  '/manifest.json',
  '/static/config.json',
  '/assets/config.json',
  '/config/settings.json',
  '/webpack.config.js',
  '/nuxt.config.js',
  '/vite.config.js',
  '/next.config.js',
  '/public/config.json',
  '/src/config.js',
  '/src/config/index.js',
  '/src/settings.js',
  '/src/settings/index.js',
  '/settings.js',
  '/settings.json',
  '/app/config.js',
  '/app/config.json',
  '/appsettings.Development.json',
  '/appsettings.Production.json',
  '/config/appsettings.json',
  '/config/appsettings.Development.json',
  '/config/appsettings.Production.json',
  '/server/config.js',
  '/server/config.json',
  '/backend/config.js',
  '/backend/config.json',
  '/public/env.js',
  '/public/env.json',
  '/public/config.js',
  '/public/config.json',
  '/config/local.js',
  '/config/local.json',
  '/config/default.js',
  '/config/default.json',
  '/config/production.js',
  '/config/production.json',
  '/config/development.js',
  '/config/development.json',
  '/settings.local.js',
  '/settings.local.json',
  '/settings.default.js',
  '/settings.default.json',
  '/settings.production.js',
  '/settings.production.json',
  '/settings.development.js',
  '/settings.development.json'
];

// Regexes to detect API-like strings and config keys
const API_REGEX = /(?:(?:"|%22|'|%27|`|%60))((?:\/api\/|\/v\d+\/|https?:\/\/[A-Za-z0-9\-\._]+(?::\d+)?(?:\/(?:api|v\d+|openapi|swagger)[A-Za-z0-9_?&=\/\-\#\.\:]*)?)[A-Za-z0-9_?&=\/\-\#\.\:\%]*)(?:(?:"|%22|'|%27|`|%60))/g;
const SWAGGER_FILENAME_REGEX = /(?:["'`]|%27|%60)(\/?(?:[A-Za-z0-9_\-\/]*)(?:swagger|openapi)[A-Za-z0-9_\-\/\.]*\.(?:json|yaml|yml))(?:["'`]|%27|%60)/gi;

// config keys / patterns that often hold backend URL
const BACKEND_KEY_REGEX = /\b(?:API_URL|API_BASE_URL|BACKEND_URL|BASE_URL|REACT_APP_API_URL|VUE_APP_API_URL|NEXT_PUBLIC_API_URL|axios\.create|fetch\(|proxy|server_url|backendHost|apiHost)\b/i;
const URL_IN_TEXT_REGEX = /https?:\/\/[A-Za-z0-9\-\._]+(?::\d+)?(?:\/[A-Za-z0-9_\-\/\.\?\=\&\#\:\%]*)?/g;

// ---------------- Helpers ----------------

function parseArgs() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node find_api_and_swagger_v2.js <target-url> [--out=results.json] [--paths=file] [--puppeteer] [--fuzz]');
    process.exit(2);
  }
  const args = { url: null, out: 'results.json', pathsFile: null, puppeteer: false, fuzz: false };
  for (const a of argv) {
    if (!args.url && !a.startsWith('--')) args.url = a;
    else if (a.startsWith('--out=')) args.out = a.split('=')[1];
    else if (a.startsWith('--paths=')) args.pathsFile = a.split('=')[1];
    else if (a === '--puppeteer') args.puppeteer = true;
    else if (a === '--fuzz') args.fuzz = true;
    else console.warn('Unknown arg', a);
  }
  return args;
}

function resolveUrl(base, p) {
  try { return new URL(p, base).href; } catch { return null; }
}

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), opts.timeout ?? DEFAULT_TIMEOUT);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal, headers: { 'User-Agent': USER_AGENT, ...(opts.headers||{}) } });
    return resp;
  } finally { clearTimeout(id); }
}

// small polite queue worker
async function probeUrls(baseUrl, paths, checkFn, concurrency = CONCURRENCY) {
  const results = [];
  const queue = Array.from(paths);
  const workers = new Array(concurrency).fill(0).map(async () => {
    while (true) {
      const p = queue.shift();
      if (!p) break;
      const url = resolveUrl(baseUrl, p);
      if (!url) continue;
      try {
        // try HEAD first (lighter), fallback to GET
        let resp;
        try {
          resp = await fetchWithTimeout(url, { method: 'HEAD' });
          if (!resp.ok && resp.status >= 400) {
            resp = await fetchWithTimeout(url, { method: 'GET' });
          }
        } catch (e) {
          resp = await fetchWithTimeout(url, { method: 'GET' });
        }
        const check = await checkFn(resp, url);
        if (check) results.push({ path: p, url, check });
      } catch (err) {
        // ignore but don't hammer target
      }
      await wait(POLITE_DELAY_MS);
    }
  });
  await Promise.all(workers);
  return results;
}

// check body / headers for swagger markers
async function isSwaggerLikeResponse(resp) {
  if (!resp) return false;
  try {
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    // clone if possible
    const cloneResp = resp.clone ? resp.clone() : resp;
    const text = await cloneResp.text().catch(()=>'');

    if (ct.includes('json') || ct.includes('yaml') || ct.includes('application/octet-stream')) {
      if (text.includes('"swagger"') || text.includes('"openapi"') || /swagger:\s*2\.0/i.test(text) || /openapi:\s*3\./i.test(text)) {
        return { likely: true, reason: 'marker in body', ct, snippet: text.slice(0, 600) };
      }
    }
    if (ct.includes('html')) {
      if (text.includes('SwaggerUIBundle') || text.includes('swagger-ui') || text.includes('Redoc') || text.includes('swagger-editor')) {
        return { likely: true, reason: 'swagger-ui html', ct, snippet: text.slice(0, 600) };
      }
    }
    // look for obvious JSON even without marker
    if (resp.ok && ct.includes('json') && text.trim().startsWith('{')) {
      return { likely: false, reason: '200 json (no markers)', ct, snippet: text.slice(0, 600) };
    }
  } catch (e) {}
  return false;
}

// search text for backend keys and URLs
function extractBackendFromText(text) {
  const findings = new Set();
  for (const m of text.matchAll(URL_IN_TEXT_REGEX)) findings.add(m[0]);
  // look for API keys/vars lines: KEY=..., "API_URL": "..."
  const lines = text.split(/\r?\n/).slice(0, 2000);
  for (const line of lines) {
    if (BACKEND_KEY_REGEX.test(line)) {
      // try to pull a URL from the same line
      const urlMatch = line.match(URL_IN_TEXT_REGEX);
      if (urlMatch) for (const u of urlMatch) findings.add(u);
      else {
        // try to extract quoted path
        const q = line.match(/['"]([^'"]*\/api[^'"]*)['"]/i) || line.match(/['"]([^'"]*https?:\/\/[^'"]*api[^'"]*)['"]/i);
        if (q) findings.add(q[1]);
      }
    }
    // also detect axios.create({ baseURL: '...' })
    const ax = line.match(/baseURL\s*[:=]\s*['"]([^'"]+)['"]/i);
    if (ax) findings.add(ax[1]);
  }
  return Array.from(findings);
}

// ---------------- Main ----------------
async function main() {
  const { url: target, out, pathsFile, puppeteer, fuzz } = parseArgs();
  const base = target.endsWith('/') ? target : target + '/';
  console.log(c(`Target: ${base}`, colors.bright));

  const results = {
    target: base,
    timestamp: new Date().toISOString(),
    discovered: {
      htmlApiCandidates: [],
      scriptUrls: [],
      scriptApiCandidates: [],
      swaggerProbes: [],
      swaggerFound: [],
      configFiles: [],
      suggestedApiBases: [],
      dynamicRequests: []
    }
  };

  // load optional custom paths
  let extraPaths = [];
  if (pathsFile) {
    try { extraPaths = fs.readFileSync(pathsFile, 'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean); console.log(c(`Loaded ${extraPaths.length} extra paths from ${pathsFile}`, colors.dim)); }
    catch(e){ console.warn('Could not read paths file:', e.message); }
  }

  // 1) fetch main HTML
  console.log(c('Fetching base HTML...', colors.cyan));
  let html = '';
  try {
    const resp = await fetchWithTimeout(base, { method: 'GET' });
    html = await resp.text();
  } catch (e) {
    console.error(c('Failed to fetch target HTML: ' + e.message, colors.red));
  }

  // 2) scan HTML for API-like strings and script srcs and swagger filenames
  const htmlApiSet = new Set();
  const swaggerFilenameSet = new Set();
  const scriptSrcs = new Set();

  for (const m of html.matchAll(API_REGEX)) if (m[1]) htmlApiSet.add(m[1]);
  for (const m of html.matchAll(SWAGGER_FILENAME_REGEX)) if (m[1]) swaggerFilenameSet.add(m[1]);

  const scriptTagRegex = /<script[^>]+src=(?:'|")([^'"]+)(?:'|")[^>]*>/gi;
  let sm;
  while ((sm = scriptTagRegex.exec(html)) !== null) {
    const resolved = resolveUrl(base, sm[1]);
    if (resolved) scriptSrcs.add(resolved);
  }

  // also search HTML for config-like references (manifest, config.json)
  const linkRegex = /<(?:link|script|meta)[^>]+(href|content|src)=(?:'|")([^'"]+)(?:'|")/gi;
  while ((sm = linkRegex.exec(html)) !== null) {
    const v = sm[2];
    if (/manifest|config|appsettings|package/i.test(v)) {
      const resolved = resolveUrl(base, v);
      if (resolved) swaggerFilenameSet.add(resolved);
    }
  }

  results.discovered.htmlApiCandidates = Array.from(htmlApiSet);
  results.discovered.scriptUrls = Array.from(scriptSrcs);
  results.discovered.foundSwaggerFilenames = Array.from(swaggerFilenameSet);

  console.log(c(`Found ${htmlApiSet.size} API-like strings in HTML, ${scriptSrcs.size} external scripts, ${swaggerFilenameSet.size} swagger-like filenames.`, colors.green));

  // 3) fetch external scripts and scan them
  console.log(c('Fetching external scripts (best-effort)...', colors.cyan));
  async function scanScript(url) {
    try {
      const resp = await fetchWithTimeout(url, { method: 'GET' });
      if (!resp) return;
      const txt = await resp.text();
      for (const m of txt.matchAll(API_REGEX)) if (m[1]) htmlApiSet.add(m[1]);
      for (const m of txt.matchAll(SWAGGER_FILENAME_REGEX)) if (m[1]) swaggerFilenameSet.add(m[1]);
      // extract backend hints
      const cfgs = extractBackendFromText(txt);
      if (cfgs.length) results.discovered.configFiles.push({ source: url, hints: cfgs });
    } catch (e) {
      // ignore
    }
  }

  const scriptList = Array.from(scriptSrcs);
  for (let i=0;i<scriptList.length;i+=CONCURRENCY) {
    const chunk = scriptList.slice(i, i+CONCURRENCY);
    await Promise.all(chunk.map(u => scanScript(u)));
    await wait(POLITE_DELAY_MS);
  }

  results.discovered.scriptApiCandidates = Array.from(htmlApiSet).slice(0, 1000);

  // 4) fetch common config files & scan them
  console.log(c('Probing common config files (e.g. package.json, appsettings.json, .env)...', colors.cyan));
  const configChecks = await probeUrls(base, COMMON_CONFIG_PATHS.concat(Array.from(swaggerFilenameSet)), async (resp, url) => {
    if (!resp) return null;
    try {
      const ct = (resp.headers.get('content-type')||'').toLowerCase();
      const text = await resp.text();
      // scan for backend indicators
      const hints = extractBackendFromText(text);
      if (hints.length) return { status: resp.status, ct, hints, snippet: text.slice(0,800) };
      // if file looks like package.json, try to parse proxy
      if (url.endsWith('/package.json')) {
        try {
          const j = JSON.parse(text);
          if (j.proxy) return { status: resp.status, ct, hints: [j.proxy], snippet: text.slice(0,400) };
        } catch {}
      }
    } catch {}
    return null;
  }, CONCURRENCY);
  for (const c of configChecks) results.discovered.configFiles.push(c);

  // 5) Probe common swagger/openapi paths (and extraPaths)
  console.log(c('Probing common swagger/openapi paths...', colors.cyan));
  const swaggerProbes = Array.from(new Set([...COMMON_SWAGGER_PATHS, ...extraPaths]));
  // if fuzz requested, generate extra permutations (be careful)
  if (fuzz) {
    console.log(c('Aggressive fuzz mode enabled: generating additional swagger-like paths (this may be loud)...', colors.yellow));
    // create permutations with /api/, /docs/, /swagger/ + variants
    const extraGen = [];
    const baseNames = ['swagger','openapi','api-docs','api-docs.json','v3/api-docs','docs/openapi'];
    const prefixes = ['/','/api/','/api/v1/','/api/v2/','/v1/','/v2/','/v3/','/services/','/public/','/static/','/backend/'];
    for (const p of prefixes) for (const b of baseNames) extraGen.push(p + b);
    // add compressed, yaml, yml
    extraGen.push(...extraGen.map(x => x + '.json'));
    extraGen.push(...extraGen.map(x => x + '.yaml'));
    extraGen.push(...extraGen.map(x => x + '.yml'));
    // append some plugin UI paths
    extraGen.push('/swagger-ui/index.html?url=/openapi.json');
    swaggerProbes.push(...extraGen);
  }

  // dedupe
  const swaggerChecks = await probeUrls(base, swaggerProbes, async (resp, url) => {
    if (!resp) return null;
    const check = await isSwaggerLikeResponse(resp);
    if (check) return check;
    // also accept 200 JSON without explicit markers as "maybe"
    if (resp.ok && (resp.headers.get('content-type')||'').includes('json')) return { likely: false, reason: '200 json (no markers)', ct: resp.headers.get('content-type') };
    return null;
  }, CONCURRENCY);

  results.discovered.swaggerProbes = swaggerChecks;
  if (swaggerChecks.length) {
    console.log(c(`Found ${swaggerChecks.length} swagger/openapi-like responses:`, colors.green));
    for (const s of swaggerChecks) {
      const reason = s.check.reason || (s.check.likely ? 'likely' : 'maybe');
      console.log(c(`  - ${s.url}  [${reason}]`, colors.magenta));
      if (s.check.snippet) console.log(c(`    snippet: ${s.check.snippet.replace(/\n/g,' ').slice(0,200)}`, colors.dim));
    }
  } else {
    console.log(c('No swagger/openapi discovered in common paths.', colors.yellow));
  }

  // 6) Probe the html/script-discovered API-like candidates to see which respond
  console.log(c('Probing discovered API-like candidates...', colors.cyan));
  const apiCandidates = Array.from(htmlApiSet).slice(0, 1000); // safety cap
  const apiChecks = await probeUrls(base, apiCandidates, async (resp, url) => {
    if (!resp) return null;
    try {
      const ct = (resp.headers.get('content-type')||'').toLowerCase();
      const snippet = (await resp.text()).slice(0,400);
      // interesting: JSON or 2xx
      if (resp.ok && (ct.includes('json') || ct.includes('text') || resp.status < 400)) {
        return { status: resp.status, ct, snippet };
      }
    } catch {}
    return null;
  }, CONCURRENCY);

  results.discovered.apiProbes = apiChecks;

  // 7) From config hints and discovered URLs, suggest base API endpoints
  const suggestedBases = new Set();
  // from config file hints
  for (const c of results.discovered.configFiles) {
    if (c.hints) for (const h of c.hints) {
      try {
        // if it is full URL, use origin
        const u = new URL(h, base);
        suggestedBases.add(u.origin + (u.pathname.endsWith('/') ? '' : '/'));
      } catch {
        // if only path like /api/, resolve against base
        if (h.startsWith('/')) suggestedBases.add(resolveUrl(base, h));
      }
    }
  }
  // from API probe results: take origins of full URLs, or base of path
  for (const a of results.discovered.apiProbes || []) {
    try {
      const u = new URL(a.url);
      suggestedBases.add(u.origin + '/');
    } catch {
      // skip
    }
  }
  // from swagger findings
  for (const s of swaggerChecks) {
    try {
      const u = new URL(s.url);
      // if spec at /v3/api-docs, suggestion might be origin + pathDir
      const pathDir = u.pathname.split('/').slice(0, -1).join('/') + '/';
      suggestedBases.add(u.origin + pathDir);
    } catch {}
  }

  results.discovered.suggestedApiBases = Array.from(suggestedBases).slice(0, 40);

  // 8) Optionally Puppeteer: capture runtime requests (if requested)
  if (puppeteer) {
    try {
      console.log(c('Puppeteer mode enabled: launching headless browser (requires puppeteer installed)...', colors.cyan));
      const pupp = await import('puppeteer').catch(()=>null);
      if (!pupp) console.warn(c('puppeteer not installed. Install with: npm i puppeteer', colors.yellow));
      else {
        const browser = await pupp.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        const dynamic = new Set();
        page.on('request', req => {
          try {
            const u = req.url();
            if (u.includes('/api/') || /\/v\d+\//.test(u) || /swagger|openapi/i.test(u)) dynamic.add(u);
          } catch {}
        });
        await page.goto(base, { waitUntil: 'networkidle2', timeout: 20000 }).catch(e=>console.warn('puppeteer goto error:', e.message));
        const runtimeHTML = await page.content();
        for (const m of runtimeHTML.matchAll(API_REGEX)) if (m[1]) htmlApiSet.add(m[1]);
        results.discovered.dynamicRequests = Array.from(dynamic);
        await browser.close();
      }
    } catch (e) {
      console.warn(c('Puppeteer scan failed: ' + e.message, colors.yellow));
    }
  }

  // 9) Save JSON results
  try {
    // Save JSON results
    fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
    console.log(c(`Results saved to ${out}`, colors.green));
    
    // Generate HTML report
    try {
        const htmlOut = out.replace('.json', '.html');
        const template = fs.readFileSync(path.join(__dirname, 'templates', 'report.html'), 'utf8');
        
        let htmlContent = '';
        
        // Add target information
        htmlContent += `<div class="section">
          <h2>Target</h2>
          <div class="item">
            <span style="${COLORS.normal}">${results.target || 'N/A'}</span>
          </div>
        </div>`;
        
        // Add timestamps if available
        if (results.timestamp) {
          htmlContent += `<div class="section">
            <h2>Scan Time</h2>
            <div class="item">
              <span style="${COLORS.normal}">${new Date(results.timestamp).toLocaleString()}</span>
            </div>
          </div>`;
        }
        
        // Add discovered candidates section
        if (results.discovered) {
          const discovered = results.discovered;
          
          // HTML API Candidates
          if (discovered.htmlApiCandidates && discovered.htmlApiCandidates.length > 0) {
            htmlContent += `<div class="section">
              <h2>API Candidates from HTML</h2>`;
            discovered.htmlApiCandidates.forEach(url => {
              htmlContent += `<div class="item">
                <div class="url">
                  <span style="${COLORS.api}">${url}</span>
                </div>
              </div>`;
            });
            htmlContent += '</div>';
          }
          
          // Script URLs
          if (discovered.scriptUrls && discovered.scriptUrls.length > 0) {
            htmlContent += `<div class="section">
              <h2>External Scripts</h2>`;
            discovered.scriptUrls.forEach(url => {
              htmlContent += `<div class="item">
                <div class="url">
                  <span style="${COLORS.normal}">${url}</span>
                </div>
              </div>`;
            });
            htmlContent += '</div>';
          }
          
          // Script API Candidates
          if (discovered.scriptApiCandidates && discovered.scriptApiCandidates.length > 0) {
            htmlContent += `<div class="section">
              <h2>API Candidates from Scripts</h2>`;
            discovered.scriptApiCandidates.forEach(url => {
              htmlContent += `<div class="item">
                <div class="url">
                  <span style="${COLORS.api}">${url}</span>
                </div>
              </div>`;
            });
            htmlContent += '</div>';
          }
          
          // Swagger/OpenAPI findings
          if (discovered.swaggerChecks && discovered.swaggerChecks.length > 0) {
            htmlContent += `<div class="section">
              <h2>Discovered Swagger/OpenAPI Documentation</h2>`;
            discovered.swaggerChecks.forEach(s => {
              htmlContent += `<div class="item">
                <div class="url">
                  <span style="${COLORS.swagger}">${s.url || 'N/A'}</span>
                </div>
                ${s.check && s.check.snippet ? 
                  `<pre style="${COLORS.normal}">${s.check.snippet.slice(0,200)}</pre>` : ''}
              </div>`;
            });
            htmlContent += '</div>';
          }
          
          // Configuration files
          if (discovered.configFiles && discovered.configFiles.length > 0) {
            htmlContent += `<div class="section">
              <h2>Configuration Files</h2>`;
            discovered.configFiles.forEach(config => {
              htmlContent += `<div class="item">
                <div class="url">
                  <span style="${COLORS.config}">${config.url || 'N/A'}</span>
                </div>
                ${config.check ? `
                  <div style="${COLORS.normal}">Status: ${config.check.status || 'N/A'}</div>
                  ${config.check.ct ? 
                    `<div style="${COLORS.normal}">Content-Type: ${config.check.ct}</div>` : ''}
                ` : ''}
              </div>`;
            });
            htmlContent += '</div>';
          }
        }
        
        const finalHtml = template.replace('<!-- Content will be injected here -->', htmlContent);
        fs.writeFileSync(htmlOut, finalHtml);
        console.log(c(`HTML report saved to ${htmlOut}`, colors.green));
    } catch (e) {
        console.error(c(`Failed to write HTML report: ${e.message}`, colors.red));
    }
  } catch (e) {
    console.error(c('Failed to write results file: ' + e.message, colors.red));
  }

  // 10) Human summary (colored)
  console.log('\n' + c('=== Summary ===', colors.bright));
  console.log(c('Discovered HTML API-like candidates:', colors.blue), results.discovered.htmlApiCandidates.length);
  console.log(c('External scripts fetched:', colors.blue), results.discovered.scriptUrls.length);
  console.log(c('Discovered config-file hints:', colors.blue), results.discovered.configFiles.length);
  console.log(c('Swagger/openapi candidates found:', colors.blue), results.discovered.swaggerProbes.length);
  console.log(c('Responding API probes:', colors.blue), results.discovered.apiProbes.length);
  console.log(c('Suggested API base(s):', colors.green));
  if (results.discovered.suggestedApiBases.length === 0) console.log(c('  (none found)', colors.yellow));
  else for (const s of results.discovered.suggestedApiBases) console.log(c('  - ' + s, colors.magenta));

  console.log('\n' + c('Detailed output written to:', colors.dim), out);
  console.log(c('Done.', colors.bright));
}

main().catch(err => {
  console.error(c('Fatal error: ' + (err && err.stack ? err.stack : err), colors.red));
  process.exit(1);
});
