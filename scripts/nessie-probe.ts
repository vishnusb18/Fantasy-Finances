// Read-only Nessie probe: prints response shapes, never the key.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m![1], m![2].replace(/^["']|["']$/g, '')]));
const key = env.NESSIE_API_KEY;
const base = process.env.NESSIE_BASE_URL || env.NESSIE_BASE_URL || 'https://api.nessieisreal.com';
const mask = (s: string) => s.split(key).join('***');
for (const path of process.argv.slice(2)) {
  try {
    const res = await fetch(`${base}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let summary = text.slice(0, 600);
    try { const j = JSON.parse(text); summary = Array.isArray(j) ? `array(${j.length}) first=${JSON.stringify(j[0] ?? null).slice(0, 500)}` : JSON.stringify(j).slice(0, 600); } catch {}
    console.log(`GET ${path} → ${res.status}\n  ${mask(summary)}`);
  } catch (e) { console.log(`GET ${path} → ERROR ${mask(String((e as { cause?: unknown }).cause ?? e))}`); }
}
