/**
 * GitHub Actions Sync Script
 * Fetches live gold rates from upstream, decrypts them, and updates static api/rates and data/rates.json
 * Respects Manual Mode override if set by Admin!
 */

const fs = require('fs');
const path = require('path');

function getFormattedTimestamp(dateObj = new Date()) {
  try {
    const options = {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(dateObj);
    const d = {};
    parts.forEach(p => { d[p.type] = p.value; });
    return `${d.year}-${d.month}-${d.day} ${d.hour}:${d.minute}`;
  } catch (e) {
    const pad = n => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  }
}

async function runSync() {
  const upstreamUrl = 'https://www.goldr.org/price.ultra.js';
  const nowStr = getFormattedTimestamp();
  console.log(`[GH-Sync] Fetching live rates from ${upstreamUrl}...`);

  // Load existing data/rates.json if present
  const dataDir = path.join(__dirname, '..', 'data');
  const apiDir = path.join(__dirname, '..', 'api');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });

  let existing = {
    mode: "auto",
    updated: nowStr,
    rates: {
      gram: { "22k": 14500, "21k": 13800, "18k": 11800, "silver": 210, "trad": 9000 },
      bhori: { "22k": 169000, "21k": 161000, "18k": 137000, "silver": 2450, "trad": 105000 }
    },
    manualRates: {
      gram: { "22k": 14500, "21k": 13800, "18k": 11800, "silver": 210, "trad": 9000 },
      bhori: { "22k": 169000, "21k": 161000, "18k": 137000, "silver": 2450, "trad": 105000 }
    },
    autoRates: {
      gram: { "22k": 14500, "21k": 13800, "18k": 11800, "silver": 210, "trad": 9000 },
      bhori: { "22k": 169000, "21k": 161000, "18k": 137000, "silver": 2450, "trad": 105000 }
    }
  };

  try {
    const raw = fs.readFileSync(path.join(dataDir, 'rates.json'), 'utf8');
    existing = { ...existing, ...JSON.parse(raw) };
  } catch (e) {}

  let autoRatesFetched = {
    gram: { ...existing.autoRates.gram },
    bhori: { ...existing.autoRates.bhori }
  };

  try {
    const res = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (res.ok) {
      const scriptText = await res.text();
      const bMatch = scriptText.match(/var\s+B\s*=\s*"([^"]+)"/);
      const kMatch = scriptText.match(/K\s*=\s*"([^"]+)"/);

      if (bMatch && kMatch) {
        const B = bMatch[1];
        const K = kMatch[1];
        const s = Buffer.from(B, 'base64').toString('binary');
        let o = '';
        for (let i = 0; i < s.length; i++) {
          o += String.fromCharCode(s.charCodeAt(i) ^ K.charCodeAt(i % K.length));
        }
        const rawData = JSON.parse(o);

        rawData.forEach(item => {
          const k = item.key;
          const rateObj = item.unit_rate || {};
          const gramPrice = Math.round(parseFloat(rateObj.gram || 0));
          const bhoriPrice = Math.round(parseFloat(rateObj.bhori || 0));

          if (k === '22k') {
            autoRatesFetched.gram['22k'] = gramPrice || autoRatesFetched.gram['22k'];
            autoRatesFetched.bhori['22k'] = bhoriPrice || Math.round(autoRatesFetched.gram['22k'] * 11.6638);
          } else if (k === '21k') {
            autoRatesFetched.gram['21k'] = gramPrice || autoRatesFetched.gram['21k'];
            autoRatesFetched.bhori['21k'] = bhoriPrice || Math.round(autoRatesFetched.gram['21k'] * 11.6638);
          } else if (k === '18k') {
            autoRatesFetched.gram['18k'] = gramPrice || autoRatesFetched.gram['18k'];
            autoRatesFetched.bhori['18k'] = bhoriPrice || Math.round(autoRatesFetched.gram['18k'] * 11.6638);
          } else if (k === 'old' || k === 'trad') {
            autoRatesFetched.gram['trad'] = gramPrice || autoRatesFetched.gram['trad'];
            autoRatesFetched.bhori['trad'] = bhoriPrice || Math.round(autoRatesFetched.gram['trad'] * 11.6638);
          }
        });

        console.log('[GH-Sync] Successfully fetched & parsed rates:', JSON.stringify(autoRatesFetched));
      }
    }
  } catch (err) {
    console.warn('[GH-Sync] Upstream fetch warning:', err.message, 'Using cached rates.');
  }

  // Update in-memory existing state
  existing.autoRates = autoRatesFetched;
  
  let finalPayload;
  if (existing.mode === 'manual') {
    console.log('[GH-Sync] Mode is MANUAL - Preserving custom manual rates.');
    existing.rates = existing.manualRates;
    finalPayload = {
      source: "manual",
      updated: existing.updated || nowStr,
      rates: existing.manualRates
    };
  } else {
    console.log('[GH-Sync] Mode is AUTO - Applying latest auto fetched rates.');
    existing.rates = autoRatesFetched;
    existing.updated = nowStr;
    finalPayload = {
      source: "auto",
      updated: nowStr,
      rates: autoRatesFetched
    };
  }

  // 1. Write to api/rates.json and api/rates
  fs.writeFileSync(path.join(apiDir, 'rates.json'), JSON.stringify(finalPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(apiDir, 'rates'), JSON.stringify(finalPayload, null, 2), 'utf8');

  // 2. Write to data/rates.json
  fs.writeFileSync(path.join(dataDir, 'rates.json'), JSON.stringify(existing, null, 2), 'utf8');

  console.log('[GH-Sync] Completed updating static API files.');
}

runSync();
