/**
 * GitHub Actions Sync Script
 * Fetches live gold rates from upstream, decrypts them, and updates static api/rates and data/rates.json
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

  let ratesData = {
    source: "auto",
    updated: nowStr,
    rates: {
      gram: { "22k": 14500, "21k": 13800, "18k": 11800, "silver": 210, "trad": 9000 },
      bhori: { "22k": 169000, "21k": 161000, "18k": 137000, "silver": 2450, "trad": 105000 }
    }
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
            ratesData.rates.gram['22k'] = gramPrice || ratesData.rates.gram['22k'];
            ratesData.rates.bhori['22k'] = bhoriPrice || Math.round(ratesData.rates.gram['22k'] * 11.6638);
          } else if (k === '21k') {
            ratesData.rates.gram['21k'] = gramPrice || ratesData.rates.gram['21k'];
            ratesData.rates.bhori['21k'] = bhoriPrice || Math.round(ratesData.rates.gram['21k'] * 11.6638);
          } else if (k === '18k') {
            ratesData.rates.gram['18k'] = gramPrice || ratesData.rates.gram['18k'];
            ratesData.rates.bhori['18k'] = bhoriPrice || Math.round(ratesData.rates.gram['18k'] * 11.6638);
          } else if (k === 'old' || k === 'trad') {
            ratesData.rates.gram['trad'] = gramPrice || ratesData.rates.gram['trad'];
            ratesData.rates.bhori['trad'] = bhoriPrice || Math.round(ratesData.rates.gram['trad'] * 11.6638);
          }
        });

        console.log('[GH-Sync] Successfully fetched & parsed rates:', JSON.stringify(ratesData));
      }
    }
  } catch (err) {
    console.warn('[GH-Sync] Upstream fetch warning:', err.message, 'Using default/cached rates.');
  }

  // 1. Write to api/rates.json and api/rates
  const apiDir = path.join(__dirname, '..', 'api');
  if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir, { recursive: true });

  fs.writeFileSync(path.join(apiDir, 'rates.json'), JSON.stringify(ratesData, null, 2), 'utf8');
  fs.writeFileSync(path.join(apiDir, 'rates'), JSON.stringify(ratesData, null, 2), 'utf8');

  // 2. Write to data/rates.json
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(path.join(dataDir, 'rates.json'), 'utf8'));
  } catch (e) {}

  existing.autoRates = ratesData.rates;
  if (existing.mode !== 'manual') {
    existing.rates = ratesData.rates;
    existing.updated = ratesData.updated;
  }
  fs.writeFileSync(path.join(dataDir, 'rates.json'), JSON.stringify(existing, null, 2), 'utf8');

  console.log('[GH-Sync] Completed updating static API files.');
}

runSync();
