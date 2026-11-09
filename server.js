#!/usr/bin/env node
'use strict';

/**
 * GitSkin self-hosted
 * Minimal, dependency-free SVG profile cards for GitHub READMEs.
 *
 * Endpoints:
 *   /api/hero?username=a11q1&theme=blueprint&mode=dark
 *   /api/stats?username=a11q1&theme=blueprint&mode=dark
 *   /api/stack?username=a11q1&theme=blueprint&mode=dark
 *   /api/profile?username=a11q1
 *   /healthz
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8792);
const HOST = process.env.HOST || '127.0.0.1';
const CACHE_TTL = 10 * 60 * 1000;
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'profile.json'), 'utf8'));
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

const THEMES = {
  blueprint: {
    bg: '#050b12', bg2: '#08131d', panel: '#0a1622', panel2: '#0d1c29',
    line: '#173247', line2: '#0f2536', text: '#dceaf1', muted: '#7e9cab', dim: '#4b6979',
    accent: '#40e0cf', accent2: '#f0b64a', accent3: '#ff5c8a', accent4: '#a78bfa', accent5: '#6ee7b7',
    grid: '#0d2130', glow1: '#0b3a44', glow2: '#2a1f12'
  },
  cyber: {
    bg: '#030805', bg2: '#04110a', panel: '#061a10', panel2: '#082114',
    line: '#144d31', line2: '#0c3320', text: '#d8ffe9', muted: '#74b98e', dim: '#3d7d55',
    accent: '#39ff88', accent2: '#c8ff3d', accent3: '#ff4d6d', accent4: '#4dd8ff', accent5: '#f7ff6b',
    grid: '#082418', glow1: '#064d2a', glow2: '#1a3306'
  },
  aurora: {
    bg: '#041f1e', bg2: '#062b29', panel: '#072e2c', panel2: '#0a3a37',
    line: '#155e58', line2: '#0d4742', text: '#e6fffb', muted: '#8bd8cf', dim: '#4f9f97',
    accent: '#2dd4bf', accent2: '#a78bfa', accent3: '#f472b6', accent4: '#5eead4', accent5: '#4f8cff',
    grid: '#0b3d39', glow1: '#0b5e56', glow2: '#2b1b4d'
  },
  light: {
    bg: '#f4f1e8', bg2: '#ece7da', panel: '#fbf8f0', panel2: '#f0ebdf',
    line: '#c9c2b2', line2: '#ddd7c8', text: '#14202a', muted: '#5d6b73', dim: '#8b969c',
    accent: '#0f766e', accent2: '#b45309', accent3: '#be123c', accent4: '#6d28d9', accent5: '#047857',
    grid: '#e2dccd', glow1: '#d7efe8', glow2: '#f6e7c8'
  }
};

const cache = new Map();
const rate = new Map();

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function themeFor(name, mode) {
  if (name === 'light' || mode === 'light') return THEMES.light;
  return THEMES[name] || THEMES.blueprint;
}

function palette(theme) {
  return [theme.accent, theme.accent2, theme.accent3, theme.accent4, theme.accent5];
}

function fmt(n) {
  return new Intl.NumberFormat('en-US').format(Number(n) || 0);
}

function upper(value) {
  return String(value || '').toUpperCase();
}

function nameLines(name) {
  const parts = String(name || CONFIG.name).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [parts[0] || CONFIG.username];
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}

function tagWidth(label) {
  return Math.max(54, label.length * 6.4 + 22);
}

function tagsMarkup(tags, x, y, theme) {
  let out = '';
  let cx = x;
  for (const tag of tags || []) {
    const w = tagWidth(tag);
    out += `<rect x="${cx}" y="${y}" width="${w}" height="24" rx="2" fill="${theme.panel2}" stroke="${theme.line}"/>`;
    out += `<text class="mono" x="${cx + w / 2}" y="${y + 16}" text-anchor="middle" font-size="9" letter-spacing="1.2" fill="${theme.muted}">${esc(tag)}</text>`;
    cx += w + 8;
  }
  return out;
}

function cornerMarks(theme, w, h, color) {
  const c = color || theme.accent;
  return [
    `<path d="M1 26 V1 H26" fill="none" stroke="${c}" stroke-width="2"/>`,
    `<path d="M${w - 26} 1 H${w - 1} V26" fill="none" stroke="${c}" stroke-width="2"/>`,
    `<path d="M1 ${h - 26} V${h - 1} H26" fill="none" stroke="${c}" stroke-width="2"/>`,
    `<path d="M${w - 26} ${h - 1} H${w - 1} V${h - 26}" fill="none" stroke="${c}" stroke-width="2"/>`
  ].join('');
}

function svgDefs(theme, w, h) {
  return `<defs>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="${theme.grid}" stroke-width="1"/>
    </pattern>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" fill="${theme.text}" opacity="0.5"/>
    </pattern>
    <radialGradient id="glowA" cx="18%" cy="0%" r="80%">
      <stop offset="0%" stop-color="${theme.glow1}" stop-opacity="0.95"/>
      <stop offset="58%" stop-color="${theme.glow1}" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="${theme.glow1}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="92%" cy="100%" r="72%">
      <stop offset="0%" stop-color="${theme.glow2}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${theme.glow2}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lineFade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
    <style>
      .mono { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
      .sans { font-family: 'Arial Black', 'Helvetica Neue', Arial, sans-serif; }
      .dot { animation: gsPulse 2.4s ease-in-out infinite; }
      .scanline { animation: gsScan 9s linear infinite; }
      @keyframes gsPulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
      @keyframes gsScan { 0% { transform: translateY(-24px) } 100% { transform: translateY(${h + 24}px) } }
    </style>
  </defs>
  <rect width="${w}" height="${h}" fill="${theme.bg}"/>
  <rect width="${w}" height="${h}" fill="url(#grid)" opacity="0.6"/>
  <rect width="${w}" height="${h}" fill="url(#glowA)"/>
  <rect width="${w}" height="${h}" fill="url(#glowB)"/>
  <rect width="${w}" height="${h}" fill="url(#scan)" opacity="0.03"/>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${theme.line}" stroke-width="1"/>
  <rect class="scanline" x="0" y="0" width="${w}" height="2" fill="${theme.accent}" opacity="0.055"/>`;
}

function svgHero(profile, theme) {
  const w = 1200;
  const h = 360;
  const lines = nameLines(profile.name);
  const maxLen = Math.max(...lines.map((line) => line.length));
  const fontSize = Math.max(44, Math.min(78, Math.floor(640 / (maxLen * 0.62))));
  const line1Y = lines.length > 1 ? 148 : 186;
  const line2Y = 224;
  const roleY = 262;
  const tagsY = 302;
  const panel = Array.isArray(profile.panel) && profile.panel.length ? profile.panel : CONFIG.panel;
  const accent = palette(theme);

  let nameMarkup = `<text class="sans" x="48" y="${line1Y}" font-size="${fontSize}" font-weight="900" letter-spacing="1.5" fill="${theme.text}">${esc(upper(lines[0]))}</text>`;
  if (lines.length > 1) {
    nameMarkup += `<text class="sans" x="48" y="${line2Y}" font-size="${fontSize}" font-weight="900" letter-spacing="1.5" fill="${theme.bg}" stroke="${theme.accent}" stroke-width="1.5">${esc(upper(lines[1]))}</text>`;
  } else {
    nameMarkup += `<rect x="48" y="${line1Y + 16}" width="${Math.min(520, maxLen * fontSize * 0.62)}" height="3" fill="${theme.accent}"/>`;
  }

  let panelRows = '';
  panel.forEach((row, index) => {
    const y = 132 + index * 40;
    const color = accent[index % accent.length];
    panelRows += `<rect x="780" y="${y - 10}" width="4" height="18" fill="${color}"/>`;
    panelRows += `<text class="mono" x="796" y="${y + 3}" font-size="10" letter-spacing="1.4" fill="${color}">${esc(row.key)}</text>`;
    panelRows += `<text class="mono" x="842" y="${y + 3}" font-size="10" fill="${theme.text}">${esc(row.value)}</text>`;
    panelRows += `<text class="mono" x="1132" y="${y + 3}" text-anchor="end" font-size="9" letter-spacing="1" fill="${theme.muted}">${esc(row.status)}</text>`;
    panelRows += `<line x1="780" y1="${y + 18}" x2="1132" y2="${y + 18}" stroke="${theme.line2}" stroke-width="1"/>`;
  });

  const barcode = Array.from({ length: 26 }, (_, i) => {
    const bw = i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1;
    return `<rect x="${780 + i * 3.2}" y="296" width="${bw}" height="14" fill="${theme.dim}"/>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(profile.name)} — ${esc(profile.role)}</title>
  <desc id="desc">Carte de profil GitHub générée par un service GitSkin self-hosted.</desc>
  ${svgDefs(theme, w, h)}
  ${cornerMarks(theme, w, h)}
  <line x1="32" y1="48" x2="1168" y2="48" stroke="${theme.line2}" stroke-width="1"/>
  <text class="mono" x="42" y="31" font-size="10" letter-spacing="2.2" fill="${theme.muted}">A11Q1 / PROFILE</text>
  <text class="mono" x="1160" y="31" text-anchor="end" font-size="9" letter-spacing="1.8" fill="${theme.dim}">SELF-HOSTED GITSKIN</text>

  <rect x="40" y="${lines.length > 1 ? 90 : 128}" width="2" height="${lines.length > 1 ? 138 : 80}" fill="${theme.accent}"/>
  ${nameMarkup}
  <text class="mono" x="48" y="${roleY}" font-size="12" letter-spacing="2.4" fill="${theme.muted}">${esc(upper(profile.role))}</text>
  ${tagsMarkup(profile.tags, 48, tagsY, theme)}
  <text class="mono" x="48" y="346" font-size="9" letter-spacing="1.6" fill="${theme.dim}">${esc(upper(profile.location))} · 48.87N 2.23E</text>
  <text class="mono" x="720" y="346" text-anchor="end" font-size="9" letter-spacing="1.6" fill="${theme.dim}">${esc(upper(profile.status))}</text>

  <rect x="760" y="64" width="392" height="264" fill="${theme.panel}" stroke="${theme.line}" stroke-width="1"/>
  <rect x="760" y="64" width="392" height="2" fill="${theme.accent2}"/>
  <text class="mono" x="780" y="92" font-size="11" letter-spacing="2.2" fill="${theme.text}">SYSTEM SCAN</text>
  <circle class="dot" cx="1108" cy="87" r="3" fill="${theme.accent}"/>
  <text class="mono" x="1132" y="92" text-anchor="end" font-size="9" letter-spacing="1.6" fill="${theme.accent}">LIVE</text>
  <line x1="780" y1="106" x2="1132" y2="106" stroke="${theme.line2}" stroke-width="1"/>
  ${panelRows}
  ${barcode}
  <text class="mono" x="1132" y="307" text-anchor="end" font-size="8" letter-spacing="1.4" fill="${theme.dim}">1200 × 360 · REV 2026.11</text>
  <rect x="760" y="64" width="392" height="264" fill="none" stroke="${theme.line}" stroke-width="1"/>
</svg>`;
}

function svgStats(profile, theme) {
  const w = 600;
  const h = 240;
  const accent = palette(theme);
  const stats = [
    ['REPOS', profile.user.public_repos],
    ['STARS', profile.stars],
    ['FOLLOWERS', profile.user.followers],
    ['FOLLOWING', profile.user.following]
  ];
  const updated = new Date(profile.updatedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const live = profile.stale ? 'CACHE' : 'LIVE';
  const liveColor = profile.stale ? theme.accent2 : theme.accent;

  let statMarkup = '';
  stats.forEach(([label, value], index) => {
    const x = 28 + index * 142;
    statMarkup += `<text class="mono" x="${x}" y="82" font-size="9" letter-spacing="2" fill="${theme.muted}">${label}</text>`;
    statMarkup += `<text class="sans" x="${x}" y="126" font-size="40" font-weight="900" letter-spacing="0.5" fill="${accent[index % accent.length]}">${fmt(value)}</text>`;
    if (index < 3) statMarkup += `<line x1="${x + 122}" y1="62" x2="${x + 122}" y2="140" stroke="${theme.line2}" stroke-width="1"/>`;
  });

  const pulse = 'M28 190 L74 190 L86 172 L98 190 L142 190 L154 182 L166 190 L210 190 L222 164 L234 190 L286 190 L298 184 L310 190 L354 190 L366 176 L378 190 L430 190 L442 186 L454 190 L510 190 L522 170 L534 190 L572 190';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
  <title id="title">GitHub profile signal — ${esc(profile.user.login)}</title>
  <desc id="desc">Statistiques GitHub publiques : dépôts, étoiles, followers et following.</desc>
  ${svgDefs(theme, w, h)}
  ${cornerMarks(theme, w, h)}
  <text class="mono" x="28" y="34" font-size="11" letter-spacing="2.2" fill="${theme.text}">PROFILE / SIGNAL</text>
  <circle class="dot" cx="520" cy="29" r="3" fill="${liveColor}"/>
  <text class="mono" x="532" y="33" font-size="9" letter-spacing="1.8" fill="${liveColor}">${live}</text>
  <line x1="28" y1="48" x2="572" y2="48" stroke="${theme.line2}" stroke-width="1"/>
  ${statMarkup}
  <path d="${pulse}" fill="none" stroke="url(#lineFade)" stroke-width="2" opacity="0.9"/>
  <circle cx="222" cy="164" r="3" fill="${theme.accent}"/>
  <circle cx="522" cy="170" r="3" fill="${theme.accent2}"/>
  <line x1="28" y1="208" x2="572" y2="208" stroke="${theme.line2}" stroke-width="1"/>
  <text class="mono" x="28" y="226" font-size="8" letter-spacing="1.2" fill="${theme.dim}">@${esc(profile.user.login)} · GITHUB.COM/${esc(upper(profile.user.login))}</text>
  <text class="mono" x="572" y="226" text-anchor="end" font-size="8" letter-spacing="1.2" fill="${theme.dim}">UPDATED ${updated}</text>
</svg>`;
}

function svgStack(profile, theme) {
  const w = 600;
  const h = 240;
  const accent = palette(theme);
  const languages = (profile.languages || []).slice(0, 5);
  const total = languages.reduce((sum, [, count]) => sum + count, 0) || 1;

  let rows = '';
  languages.forEach(([name, count], index) => {
    const y = 78 + index * 26;
    const pct = Math.max(0.02, count / total);
    const color = accent[index % accent.length];
    rows += `<text class="mono" x="28" y="${y + 8}" font-size="10" letter-spacing="1" fill="${theme.text}">${esc(name)}</text>`;
    rows += `<rect x="128" y="${y}" width="360" height="8" rx="1" fill="${theme.line2}"/>`;
    rows += `<rect x="128" y="${y}" width="${Math.round(360 * pct)}" height="8" rx="1" fill="${color}"/>`;
    rows += `<text class="mono" x="572" y="${y + 8}" text-anchor="end" font-size="9" letter-spacing="1" fill="${theme.muted}">${Math.round(pct * 100)}%</text>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
  <title id="title">Language stack — ${esc(profile.user.login)}</title>
  <desc id="desc">Répartition des langages principaux des dépôts publics GitHub.</desc>
  ${svgDefs(theme, w, h)}
  ${cornerMarks(theme, w, h)}
  <text class="mono" x="28" y="34" font-size="11" letter-spacing="2.2" fill="${theme.text}">STACK / LANGUAGES</text>
  <text class="mono" x="572" y="33" text-anchor="end" font-size="8" letter-spacing="1.3" fill="${theme.dim}">FROM PUBLIC REPOS</text>
  <line x1="28" y1="48" x2="572" y2="48" stroke="${theme.line2}" stroke-width="1"/>
  ${rows}
  <line x1="28" y1="208" x2="572" y2="208" stroke="${theme.line2}" stroke-width="1"/>
  <text class="mono" x="28" y="226" font-size="8" letter-spacing="1.2" fill="${theme.dim}">TOP ${languages.length} · ${fmt(profile.user.public_repos)} REPOS</text>
  <text class="mono" x="572" y="226" text-anchor="end" font-size="8" letter-spacing="1.2" fill="${theme.dim}">@${esc(profile.user.login)}</text>
</svg>`;
}

function svgStatus(theme) {
  const w = 1200;
  const h = 64;
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
  <title id="title">GitSkin self-hosted status</title>
  <desc id="desc">Service de cartes SVG auto-hébergé, en ligne.</desc>
  ${svgDefs(theme, w, h)}
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${theme.line}" stroke-width="1"/>
  <circle class="dot" cx="32" cy="32" r="4" fill="${theme.accent}"/>
  <text class="mono" x="48" y="36" font-size="10" letter-spacing="2" fill="${theme.accent}">SYSTEM ONLINE</text>
  <line x1="196" y1="20" x2="196" y2="44" stroke="${theme.line2}" stroke-width="1"/>
  <text class="mono" x="216" y="36" font-size="9" letter-spacing="1.4" fill="${theme.muted}">SELF-HOSTED · CT131 · CLOUDFLARE TUNNEL</text>
  <text class="mono" x="1168" y="36" text-anchor="end" font-size="9" letter-spacing="1.4" fill="${theme.dim}">UPDATED ${now}</text>
</svg>`;
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'gitskin-selfhosted/1.0', Accept: 'application/vnd.github+json', ...headers },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getProfile(username) {
  const key = username.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  try {
    const headers = {};
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const [user, repos] = await Promise.all([
      fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}`, headers),
      fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`, headers)
    ]);
    const stars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
    const candidates = repos.filter((repo) => !repo.fork && repo.language).slice(0, 12);
    const languageSets = await Promise.all(candidates.map(async (repo) => {
      try {
        return await fetchJson(repo.languages_url, headers);
      } catch {
        return { [repo.language]: 1 };
      }
    }));
    const bytes = new Map();
    for (const set of languageSets) {
      for (const [language, count] of Object.entries(set)) {
        bytes.set(language, (bytes.get(language) || 0) + Number(count || 0));
      }
    }
    const languages = [...bytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const data = { user, stars, languages, updatedAt: new Date().toISOString(), stale: false };
    cache.set(key, { ts: Date.now(), data });
    return data;
  } catch (error) {
    if (hit) return { ...hit.data, stale: true };
    const fallback = CONFIG.fallback || {};
    return {
      user: {
        login: username,
        public_repos: fallback.public_repos || 0,
        followers: fallback.followers || 0,
        following: fallback.following || 0
      },
      stars: fallback.stars || 0,
      languages: fallback.languages || [],
      updatedAt: new Date().toISOString(),
      stale: true
    };
  }
}

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra
  });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

function limited(ip) {
  const now = Date.now();
  const bucket = rate.get(ip) || { count: 0, reset: now + 60_000 };
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + 60_000;
  }
  bucket.count += 1;
  rate.set(ip, bucket);
  if (rate.size > 5000) {
    for (const [key, value] of rate) if (now > value.reset) rate.delete(key);
  }
  return bucket.count <= 180;
}

const server = http.createServer(async (req, res) => {
  const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown';
  if (!limited(ip)) return send(res, 429, 'application/json; charset=utf-8', JSON.stringify({ error: 'rate_limited' }));

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const username = (url.searchParams.get('username') || CONFIG.username).trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(username)) {
    return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ error: 'invalid_username' }));
  }
  const theme = themeFor(url.searchParams.get('theme') || 'blueprint', url.searchParams.get('mode'));

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'application/json; charset=utf-8', JSON.stringify({ error: 'method_not_allowed' }));
  }

  if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', INDEX_HTML);
  if (url.pathname === '/healthz') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({
      ok: true,
      service: 'gitskin-selfhosted',
      uptime: Math.round(process.uptime()),
      cache: cache.size
    }));
  }
  if (url.pathname === '/robots.txt') return send(res, 200, 'text/plain; charset=utf-8', 'User-agent: *\nAllow: /\n');
  if (url.pathname === '/favicon.svg') {
    return send(res, 200, 'image/svg+xml; charset=utf-8',
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#050b12"/><path d="M12 20h24v6H18v12h12v-4h-6v-6h12v16H12z" fill="#40e0cf"/><path d="M42 20h10v24H42z" fill="#f0b64a"/></svg>`);
  }

  if (url.pathname === '/api/profile') {
    const profile = await getProfile(username);
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({
      login: profile.user.login,
      name: profile.user.name || CONFIG.name,
      public_repos: profile.user.public_repos,
      followers: profile.user.followers,
      following: profile.user.following,
      stars: profile.stars,
      languages: profile.languages,
      stale: profile.stale,
      updatedAt: profile.updatedAt
    }, null, 2));
  }

  if (url.pathname === '/api/hero') {
    const profile = await getProfile(username);
    const merged = { ...CONFIG, ...profile, username, name: profile.user.name || CONFIG.name };
    return send(res, 200, 'image/svg+xml; charset=utf-8', svgHero(merged, theme));
  }

  if (url.pathname === '/api/stats') {
    return send(res, 200, 'image/svg+xml; charset=utf-8', svgStats(await getProfile(username), theme));
  }

  if (url.pathname === '/api/stack') {
    return send(res, 200, 'image/svg+xml; charset=utf-8', svgStack(await getProfile(username), theme));
  }

  if (url.pathname === '/api/status') {
    return send(res, 200, 'image/svg+xml; charset=utf-8', svgStatus(theme));
  }

  return send(res, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`gitskin self-hosted listening on http://${HOST}:${PORT}`);
});
