const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'rates.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// In-memory state cache
let state = {
  mode: 'auto', // 'auto' | 'manual'
  updated: '2026-10-05 14:30',
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
  },
  settings: {
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
    jwtSecret: process.env.JWT_SECRET || 'gold-matrix-secret-key-2026',
    autoSyncIntervalMinutes: 15,
    upstreamUrl: 'https://www.goldr.org/price.ultra.js',
    gramToBhoriRatio: 11.6638,
    lastSyncAttempt: null,
    lastSyncStatus: 'idle',
    lastSyncMessage: 'Server started'
  },
  history: [],
  devices: []
};

// Helper: Format Dhaka timestamp (YYYY-MM-DD HH:mm)
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

// Load state from disk
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const loaded = JSON.parse(raw);
      state = {
        ...state,
        ...loaded,
        settings: { ...state.settings, ...(loaded.settings || {}) }
      };
      if (process.env.ADMIN_PASSWORD) {
        state.settings.adminPassword = process.env.ADMIN_PASSWORD;
      }
      console.log('✅ State successfully loaded from disk. Current mode:', state.mode);
    } else {
      saveData();
    }
  } catch (err) {
    console.error('⚠️ Failed to load rates.json, using defaults:', err.message);
  }
}

// Save state to disk atomically
function saveData() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.error('⚠️ Failed to save rates.json:', err.message);
  }
}

// Scraper / Decryptor Engine for goldr price.ultra.js
async function fetchUpstreamRates() {
  const url = state.settings.upstreamUrl || 'https://www.goldr.org/price.ultra.js';
  const nowStr = getFormattedTimestamp();
  state.settings.lastSyncAttempt = nowStr;

  try {
    console.log(`🔄 Attempting to fetch live rates from ${url}...`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const scriptText = await response.text();

    // Extract B and K variables from price.ultra.js: var B="...",K="..."
    const bMatch = scriptText.match(/var\s+B\s*=\s*"([^"]+)"/);
    const kMatch = scriptText.match(/K\s*=\s*"([^"]+)"/);

    if (!bMatch || !kMatch) {
      throw new Error('Could not parse encryption payload (B or K) from script');
    }

    const B = bMatch[1];
    const K = kMatch[1];

    // Decrypt Base64 + XOR
    const s = Buffer.from(B, 'base64').toString('binary');
    let o = '';
    for (let i = 0; i < s.length; i++) {
      o += String.fromCharCode(s.charCodeAt(i) ^ K.charCodeAt(i % K.length));
    }

    const rawData = JSON.parse(o);
    // rawData is array of [{ key: "22k", unit_rate: { bhori, gram, ... } }, ...]
    const parsedGram = { ...state.autoRates.gram };
    const parsedBhori = { ...state.autoRates.bhori };

    rawData.forEach(item => {
      const k = item.key;
      const rateObj = item.unit_rate || {};
      const gramPrice = Math.round(parseFloat(rateObj.gram || 0));
      const bhoriPrice = Math.round(parseFloat(rateObj.bhori || 0));

      if (k === '22k') {
        parsedGram['22k'] = gramPrice || parsedGram['22k'];
        parsedBhori['22k'] = bhoriPrice || Math.round(parsedGram['22k'] * 11.6638);
      } else if (k === '21k') {
        parsedGram['21k'] = gramPrice || parsedGram['21k'];
        parsedBhori['21k'] = bhoriPrice || Math.round(parsedGram['21k'] * 11.6638);
      } else if (k === '18k') {
        parsedGram['18k'] = gramPrice || parsedGram['18k'];
        parsedBhori['18k'] = bhoriPrice || Math.round(parsedGram['18k'] * 11.6638);
      } else if (k === 'old' || k === 'trad') {
        parsedGram['trad'] = gramPrice || parsedGram['trad'];
        parsedBhori['trad'] = bhoriPrice || Math.round(parsedGram['trad'] * 11.6638);
      }
    });

    // Silver calculation if not explicitly provided
    if (!parsedGram['silver']) {
      parsedGram['silver'] = 210;
      parsedBhori['silver'] = 2450;
    }

    state.autoRates = {
      gram: parsedGram,
      bhori: parsedBhori
    };

    if (state.mode === 'auto') {
      state.rates = {
        gram: parsedGram,
        bhori: parsedBhori
      };
      state.updated = nowStr;
    }

    state.settings.lastSyncStatus = 'success';
    state.settings.lastSyncMessage = `Live rates successfully synced at ${nowStr}`;
    console.log('✅ Live rates updated successfully:', JSON.stringify(state.autoRates));

    // Append to history (keep max 30)
    state.history.unshift({
      timestamp: nowStr,
      source: 'auto',
      rates: JSON.parse(JSON.stringify(state.autoRates))
    });
    if (state.history.length > 30) state.history.pop();

    saveData();
    return { success: true, rates: state.autoRates };
  } catch (err) {
    console.error('❌ Auto-sync failed, maintaining fallback rates:', err.message);
    state.settings.lastSyncStatus = 'error';
    state.settings.lastSyncMessage = `Sync failed at ${nowStr}: ${err.message}`;
    saveData();
    return { success: false, error: err.message };
  }
}

// Periodic sync timer
let syncTimer = null;
function scheduleAutoSync() {
  if (syncTimer) clearInterval(syncTimer);
  const intervalMs = (state.settings.autoSyncIntervalMinutes || 15) * 60 * 1000;
  syncTimer = setInterval(() => {
    if (state.mode === 'auto') {
      fetchUpstreamRates();
    }
  }, intervalMs);
  console.log(`⏱️ Auto-sync scheduled every ${state.settings.autoSyncIntervalMinutes} minutes.`);
}

// Device Tracking Middleware for ESP32 Matrix Boards
function trackDevice(req, res, next) {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown IP';
    const userAgent = req.headers['user-agent'] || 'Unknown Device';
    const deviceId = req.query.device_id || req.query.mac || req.query.id || (userAgent.includes('ESP32') ? `ESP32-${ip.slice(-4)}` : 'Client');
    const now = new Date().toISOString();

    const existingIndex = state.devices.findIndex(d => d.ip === ip || (deviceId !== 'Client' && d.deviceId === deviceId));
    if (existingIndex >= 0) {
      state.devices[existingIndex].lastSeen = now;
      state.devices[existingIndex].requestsCount = (state.devices[existingIndex].requestsCount || 0) + 1;
      state.devices[existingIndex].userAgent = userAgent;
    } else {
      state.devices.unshift({
        deviceId,
        ip,
        userAgent,
        firstSeen: now,
        lastSeen: now,
        requestsCount: 1
      });
      if (state.devices.length > 50) state.devices.pop();
    }
  } catch (e) {
    // Ignore tracking errors
  }
  next();
}

// Admin Auth Middleware
function requireAdmin(req, res, next) {
  const token = req.cookies.admin_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    if (req.accepts('html')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Unauthorized: Admin login required' });
  }

  try {
    const decoded = jwt.verify(token, state.settings.jwtSecret);
    req.admin = decoded;
    next();
  } catch (err) {
    if (req.accepts('html')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// -------------------------------------------------------------
// PUBLIC API ENDPOINTS
// -------------------------------------------------------------

/**
 * Requirement 3: Centralized JSON API Endpoint (/api/rates)
 * Exact format:
 * {
 *   "source": "auto" or "manual",
 *   "updated": "2026-10-05 14:30",
 *   "rates": {
 *     "gram": {"22k":14500,"21k":13800,"18k":11800,"silver":210,"trad":9000},
 *     "bhori": {"22k":169000,"21k":161000,"18k":137000,"silver":2450,"trad":105000}
 *   }
 * }
 */
app.get('/api/rates', trackDevice, (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const activeRates = state.mode === 'manual' ? state.manualRates : state.autoRates;

  const payload = {
    source: state.mode,
    updated: state.updated || getFormattedTimestamp(),
    rates: {
      gram: {
        "22k": Number(activeRates.gram["22k"] || 14500),
        "21k": Number(activeRates.gram["21k"] || 13800),
        "18k": Number(activeRates.gram["18k"] || 11800),
        "silver": Number(activeRates.gram["silver"] || 210),
        "trad": Number(activeRates.gram["trad"] || 9000)
      },
      bhori: {
        "22k": Number(activeRates.bhori["22k"] || 169000),
        "21k": Number(activeRates.bhori["21k"] || 161000),
        "18k": Number(activeRates.bhori["18k"] || 137000),
        "silver": Number(activeRates.bhori["silver"] || 2450),
        "trad": Number(activeRates.bhori["trad"] || 105000)
      }
    }
  };

  return res.json(payload);
});

// Device Heartbeat/Ping endpoint for ESP32
app.post('/api/devices/ping', (req, res) => {
  const { device_id, mac, firmware, uptime, signal } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown IP';
  const now = new Date().toISOString();

  const id = device_id || mac || `ESP32-${ip.slice(-4)}`;
  const index = state.devices.findIndex(d => d.deviceId === id || d.ip === ip);

  const deviceInfo = {
    deviceId: id,
    ip,
    userAgent: `ESP32-Firmware/${firmware || '1.0'}`,
    signal: signal || null,
    uptime: uptime || null,
    lastSeen: now,
    requestsCount: 1
  };

  if (index >= 0) {
    state.devices[index] = { ...state.devices[index], ...deviceInfo, requestsCount: (state.devices[index].requestsCount || 0) + 1 };
  } else {
    deviceInfo.firstSeen = now;
    state.devices.unshift(deviceInfo);
  }

  saveData();
  res.json({ status: 'ok', serverTime: getFormattedTimestamp() });
});

// -------------------------------------------------------------
// ADMIN AUTH & MANAGEMENT APIS
// -------------------------------------------------------------

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = 'admin';
  const validPass = state.settings.adminPassword || 'admin123';

  if ((username === validUser || !username) && password === validPass) {
    const token = jwt.sign({ user: 'admin', role: 'superadmin' }, state.settings.jwtSecret, { expiresIn: '7d' });
    res.cookie('admin_token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    return res.json({ success: true, message: 'Logged in successfully', token });
  }

  return res.status(401).json({ success: false, error: 'Invalid password or username' });
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  return res.json({ success: true, message: 'Logged out successfully' });
});

// Admin status & full dashboard info
app.get('/api/admin/status', requireAdmin, (req, res) => {
  res.json({
    mode: state.mode,
    updated: state.updated,
    rates: state.rates,
    manualRates: state.manualRates,
    autoRates: state.autoRates,
    settings: {
      autoSyncIntervalMinutes: state.settings.autoSyncIntervalMinutes,
      upstreamUrl: state.settings.upstreamUrl,
      gramToBhoriRatio: state.settings.gramToBhoriRatio,
      lastSyncAttempt: state.settings.lastSyncAttempt,
      lastSyncStatus: state.settings.lastSyncStatus,
      lastSyncMessage: state.settings.lastSyncMessage
    },
    history: state.history.slice(0, 10),
    devices: state.devices.slice(0, 20)
  });
});

// Switch mode ('auto' | 'manual')
app.post('/api/admin/mode', requireAdmin, (req, res) => {
  const { mode } = req.body;
  if (mode !== 'auto' && mode !== 'manual') {
    return res.status(400).json({ error: 'Mode must be "auto" or "manual"' });
  }

  state.mode = mode;
  state.updated = getFormattedTimestamp();

  if (mode === 'manual') {
    state.rates = JSON.parse(JSON.stringify(state.manualRates));
  } else {
    state.rates = JSON.parse(JSON.stringify(state.autoRates));
  }

  state.history.unshift({
    timestamp: state.updated,
    source: mode,
    rates: JSON.parse(JSON.stringify(state.rates)),
    note: `Mode switched to ${mode}`
  });

  saveData();
  console.log(`🔄 Mode changed to: ${mode}`);
  return res.json({ success: true, mode: state.mode, updated: state.updated, rates: state.rates });
});

// Update manual rates
app.post('/api/admin/rates', requireAdmin, (req, res) => {
  const { rates, autoSwitchToManual } = req.body;
  if (!rates || !rates.gram || !rates.bhori) {
    return res.status(400).json({ error: 'Invalid payload. Must include rates.gram and rates.bhori' });
  }

  const cleanRates = {
    gram: {
      "22k": Math.round(Number(rates.gram["22k"] || 0)),
      "21k": Math.round(Number(rates.gram["21k"] || 0)),
      "18k": Math.round(Number(rates.gram["18k"] || 0)),
      "silver": Math.round(Number(rates.gram["silver"] || 0)),
      "trad": Math.round(Number(rates.gram["trad"] || 0))
    },
    bhori: {
      "22k": Math.round(Number(rates.bhori["22k"] || 0)),
      "21k": Math.round(Number(rates.bhori["21k"] || 0)),
      "18k": Math.round(Number(rates.bhori["18k"] || 0)),
      "silver": Math.round(Number(rates.bhori["silver"] || 0)),
      "trad": Math.round(Number(rates.bhori["trad"] || 0))
    }
  };

  state.manualRates = cleanRates;
  state.updated = getFormattedTimestamp();

  if (autoSwitchToManual !== false) {
    state.mode = 'manual';
    state.rates = JSON.parse(JSON.stringify(cleanRates));
  } else if (state.mode === 'manual') {
    state.rates = JSON.parse(JSON.stringify(cleanRates));
  }

  state.history.unshift({
    timestamp: state.updated,
    source: state.mode,
    rates: JSON.parse(JSON.stringify(state.rates)),
    note: 'Manual rates saved'
  });
  if (state.history.length > 30) state.history.pop();

  saveData();
  console.log('✍️ Manual rates saved successfully:', JSON.stringify(cleanRates));
  return res.json({ success: true, mode: state.mode, updated: state.updated, rates: state.rates });
});

// Force auto-sync trigger
app.post('/api/admin/sync', requireAdmin, async (req, res) => {
  const result = await fetchUpstreamRates();
  return res.json({
    success: result.success,
    status: state.settings.lastSyncStatus,
    message: state.settings.lastSyncMessage,
    rates: state.autoRates
  });
});

// Update settings & password
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { newPassword, autoSyncIntervalMinutes, upstreamUrl } = req.body;

  if (newPassword && newPassword.trim().length >= 4) {
    state.settings.adminPassword = newPassword.trim();
  }

  if (autoSyncIntervalMinutes && Number(autoSyncIntervalMinutes) >= 1) {
    state.settings.autoSyncIntervalMinutes = Number(autoSyncIntervalMinutes);
    scheduleAutoSync();
  }

  if (upstreamUrl && upstreamUrl.startsWith('http')) {
    state.settings.upstreamUrl = upstreamUrl.trim();
  }

  saveData();
  return res.json({ success: true, message: 'Settings saved successfully', settings: state.settings });
});

// -------------------------------------------------------------
// STATIC FILES & HTML ROUTES
// -------------------------------------------------------------

// Serve static assets from public
app.use(express.static(path.join(__dirname, 'public')));

// Admin route
app.get('/admin', (req, res) => {
  const token = req.cookies.admin_token;
  if (!token) {
    return res.redirect('/login.html');
  }
  try {
    jwt.verify(token, state.settings.jwtSecret);
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  } catch (e) {
    return res.redirect('/login.html');
  }
});

// Login route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Start Server
loadData();
scheduleAutoSync();
// Fetch initial rates in auto mode
if (state.mode === 'auto') {
  fetchUpstreamRates().catch(e => console.log('Initial sync deferred'));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`✨ Gold Rate Middleman Server running on port ${PORT}`);
  console.log(`🌐 Public UI:         http://localhost:${PORT}/`);
  console.log(`🔐 Admin Panel:       http://localhost:${PORT}/admin`);
  console.log(`📡 ESP32 JSON API:    http://localhost:${PORT}/api/rates`);
  console.log(`===================================================`);
});
