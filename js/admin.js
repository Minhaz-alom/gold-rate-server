/**
 * Admin Panel JavaScript Logic
 * Handles Rate Overrides, Auto/Manual Mode Toggling, LED Matrix Simulator, and ESP32 Device Monitor
 */

const RATIO = 11.6638; // 1 Bhori = 11.6638 Grams

let adminState = {
  mode: 'auto',
  rates: {},
  manualRates: {},
  autoRates: {},
  settings: {},
  devices: []
};

// LED Simulator State
let simActive = true;
let simIndex = 0;
let simTimer = null;
let simSpeedMs = 2800;

// Show Toast
function showAdminToast(msg) {
  const toast = document.getElementById('admin-toast');
  const msgEl = document.getElementById('admin-toast-msg');
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Fetch Admin Dashboard Status
async function loadAdminStatus() {
  try {
    const res = await fetch('/api/admin/status');
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    adminState = data;

    updateUIWithState(data);
  } catch (err) {
    console.error('Failed to fetch admin status:', err);
  }
}

// Update UI Components
function updateUIWithState(data) {
  // Update Mode UI
  updateModeDisplay(data.mode);

  // Update Form inputs with manual rates
  const manual = data.manualRates || data.rates || {};
  if (manual.gram && manual.bhori) {
    ['22k', '21k', '18k', 'trad', 'silver'].forEach(k => {
      const gInput = document.getElementById(`input-gram-${k}`);
      const bInput = document.getElementById(`input-bhori-${k}`);
      if (gInput && manual.gram[k]) gInput.value = manual.gram[k];
      if (bInput && manual.bhori[k]) bInput.value = manual.bhori[k];
    });
  }

  // Update Sync Status
  const syncBadge = document.getElementById('sync-status-badge');
  const syncMsg = document.getElementById('sync-status-message');
  const lastSyncSidebar = document.getElementById('sidebar-last-sync');

  if (syncBadge && data.settings) {
    const status = data.settings.lastSyncStatus || 'idle';
    syncBadge.className = `badge-status-${status}`;
    syncBadge.textContent = status.toUpperCase();
    if (syncMsg) syncMsg.textContent = data.settings.lastSyncMessage || 'অপেক্ষমান';
    if (lastSyncSidebar) lastSyncSidebar.textContent = data.settings.lastSyncAttempt || 'অপেক্ষমান';
  }

  // Update Sidebar Server Time
  const timeEl = document.getElementById('sidebar-server-time');
  if (timeEl && data.updated) {
    timeEl.textContent = data.updated.split(' ')[1] || data.updated;
  }

  // Update Settings Form
  if (data.settings) {
    const intInput = document.getElementById('set-sync-interval');
    const urlInput = document.getElementById('set-upstream-url');
    if (intInput && data.settings.autoSyncIntervalMinutes) intInput.value = data.settings.autoSyncIntervalMinutes;
    if (urlInput && data.settings.upstreamUrl) urlInput.value = data.settings.upstreamUrl;
  }

  // Update JSON viewer & API endpoint
  const endpointInput = document.getElementById('admin-api-endpoint');
  if (endpointInput) {
    endpointInput.value = `${window.location.origin}/api/rates`;
  }

  const jsonViewer = document.getElementById('admin-json-viewer');
  if (jsonViewer) {
    const payload = {
      source: data.mode,
      updated: data.updated,
      rates: data.rates
    };
    jsonViewer.textContent = JSON.stringify(payload, null, 2);
  }

  // Update Device Monitor Table
  renderDevicesTable(data.devices || []);
}

// Render Mode Selector Buttons & Badge
function updateModeDisplay(mode) {
  const isAuto = mode === 'auto';
  const autoBtn = document.getElementById('btn-set-mode-auto');
  const manualBtn = document.getElementById('btn-set-mode-manual');
  const titleEl = document.getElementById('mode-title-display');
  const descEl = document.getElementById('mode-desc-display');
  const headerText = document.getElementById('header-mode-text');
  const iconBox = document.getElementById('mode-icon-display');

  if (autoBtn && manualBtn) {
    if (isAuto) {
      autoBtn.classList.add('active');
      manualBtn.classList.remove('active');
      if (titleEl) titleEl.innerHTML = 'বর্তমান রেট সোর্স মোড: <span class="highlight-text">অটো সিঙ্ক (Auto Sync)</span>';
      if (descEl) descEl.textContent = 'সার্ভার স্বয়ংক্রিয়ভাবে অনলাইন সোর্স থেকে লাইভ রেট সংগ্রহ করছে এবং ESP32 ডিভাইসে সরবরাহ করছে।';
      if (headerText) headerText.textContent = 'মোড: অটো সিঙ্ক';
      if (iconBox) iconBox.innerHTML = '<i class="fa-solid fa-bolt text-gold"></i>';
    } else {
      manualBtn.classList.add('active');
      autoBtn.classList.remove('active');
      if (titleEl) titleEl.innerHTML = 'বর্তমান রেট সোর্স মোড: <span class="highlight-text" style="color: #38bdf8;">ম্যানুয়াল ওভাররাইড (Manual Override)</span>';
      if (descEl) descEl.textContent = 'আপনার দেওয়া কাস্টম রেট সরাসরি ESP32 এবং পাবলিক পেজে প্রদর্শিত হচ্ছে। অটো ফেচিং স্থগিত রয়েছে।';
      if (headerText) headerText.textContent = 'মোড: ম্যানুয়াল';
      if (iconBox) iconBox.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color: #38bdf8;"></i>';
    }
  }
}

// Render Connected ESP32 Devices Table
function renderDevicesTable(devices) {
  const tbody = document.getElementById('devices-table-body');
  const countBadge = document.getElementById('sidebar-device-count');

  if (countBadge) countBadge.textContent = devices.length;
  if (!tbody) return;

  if (devices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">কোনো ESP32 বোর্ড এখনও যুক্ত হয়নি। <br><small>বোর্ডে URL সেট করার পর প্রথম রিকোয়েস্টে এখানে দৃশ্যমান হবে।</small></td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map(d => {
    const isRecent = (Date.now() - new Date(d.lastSeen).getTime()) < 120000; // active in last 2 mins
    return `
      <tr>
        <td><strong><i class="fa-solid fa-microchip text-gold"></i> ${d.deviceId || 'ESP32-Matrix'}</strong></td>
        <td><code>${d.ip}</code></td>
        <td><small>${d.userAgent || 'Arduino/ESP32'}</small></td>
        <td><span class="badge-count">${d.requestsCount || 1}</span></td>
        <td>${new Date(d.lastSeen).toLocaleTimeString()}</td>
        <td>
          <span class="${isRecent ? 'badge-status-success' : 'badge-status-idle'}">
            ${isRecent ? 'অনলাইন' : 'অফলাইন'}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

// Setup Mode Switch Handlers
async function setMode(newMode) {
  try {
    const res = await fetch('/api/admin/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode })
    });
    const data = await res.json();
    if (data.success) {
      showAdminToast(`মোড পরিবর্তিত হয়েছে: ${newMode === 'auto' ? 'Auto Sync' : 'Manual Override'}`);
      loadAdminStatus();
    }
  } catch (err) {
    showAdminToast('মোড পরিবর্তন করতে সমস্যা হয়েছে');
  }
}

// Rate Form Submission
async function saveManualRates(e) {
  e.preventDefault();
  const karats = ['22k', '21k', '18k', 'trad', 'silver'];
  const gramRates = {};
  const bhoriRates = {};

  karats.forEach(k => {
    const gVal = parseFloat(document.getElementById(`input-gram-${k}`)?.value) || 0;
    const bVal = parseFloat(document.getElementById(`input-bhori-${k}`)?.value) || 0;
    gramRates[k] = Math.round(gVal);
    bhoriRates[k] = Math.round(bVal);
  });

  const payload = {
    rates: {
      gram: gramRates,
      bhori: bhoriRates
    },
    autoSwitchToManual: true
  };

  try {
    const btn = document.getElementById('btn-save-rates');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> সংরক্ষণ হচ্ছে...';

    const res = await fetch('/api/admin/rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ম্যানুয়াল রেট সংরক্ষণ করুন';

    if (data.success) {
      showAdminToast('ম্যানুয়াল রেট সফলভাবে সংরক্ষিত হয়েছে!');
      loadAdminStatus();
    } else {
      showAdminToast(data.error || 'সংরক্ষণ ব্যর্থ হয়েছে');
    }
  } catch (err) {
    showAdminToast('সার্ভার এরর');
  }
}

// Force Auto-Sync
async function forceSync() {
  const btn = document.getElementById('btn-force-sync');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> সিঙ্ক হচ্ছে...';

  try {
    const res = await fetch('/api/admin/sync', { method: 'POST' });
    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> এখনি ফোর্স সিঙ্ক করুন (Force Sync)';

    if (data.success) {
      showAdminToast('অনলাইন থেকে রেট সফলভাবে সিঙ্ক হয়েছে!');
      loadAdminStatus();
    } else {
      showAdminToast('সিঙ্ক ব্যর্থ: ' + (data.message || 'অজ্ঞাত সমস্যা'));
    }
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> এখনি ফোর্স সিঙ্ক করুন (Force Sync)';
    showAdminToast('সার্ভার এরর');
  }
}

// Auto Calculate Bhori from Gram or Gram from Bhori
function setupAutoConversionLink() {
  const chkAutoCalc = document.getElementById('chk-auto-calc');

  ['22k', '21k', '18k', 'trad', 'silver'].forEach(k => {
    const gInput = document.getElementById(`input-gram-${k}`);
    const bInput = document.getElementById(`input-bhori-${k}`);

    if (gInput && bInput) {
      gInput.addEventListener('input', () => {
        if (!chkAutoCalc.checked) return;
        const g = parseFloat(gInput.value) || 0;
        bInput.value = Math.round(g * RATIO);
      });

      bInput.addEventListener('input', () => {
        if (!chkAutoCalc.checked) return;
        const b = parseFloat(bInput.value) || 0;
        gInput.value = Math.round(b / RATIO);
      });
    }
  });

  // Quick adjustment buttons (+500, -500, etc.)
  document.querySelectorAll('.btn-adj').forEach(btn => {
    btn.addEventListener('click', () => {
      const karat = btn.getAttribute('data-karat');
      const adj = parseInt(btn.getAttribute('data-adj'), 10) || 0;
      const bInput = document.getElementById(`input-bhori-${karat}`);
      const gInput = document.getElementById(`input-gram-${karat}`);
      const chk = document.getElementById('chk-auto-calc');

      if (bInput) {
        const currentB = parseInt(bInput.value, 10) || 0;
        const newB = Math.max(0, currentB + adj);
        bInput.value = newB;
        if (chk && chk.checked && gInput) {
          gInput.value = Math.round(newB / RATIO);
        }
      }
    });
  });
}

// ==========================================
// HUB75 LED MATRIX VIRTUAL SIMULATOR
// ==========================================
function startMatrixSimulator() {
  const slides = [
    { karat: '22K GOLD', key: '22k', color: '#ffcc00' },
    { karat: '21K GOLD', key: '21k', color: '#38bdf8' },
    { karat: '18K GOLD', key: '18k', color: '#f472b6' },
    { karat: 'TRAD GOLD', key: 'trad', color: '#fb923c' },
    { karat: 'SILVER 22K', key: 'silver', color: '#e2e8f0' }
  ];

  function tick() {
    if (!simActive) return;
    const currentRates = adminState.rates?.bhori || { "22k": 169000, "21k": 161000, "18k": 137000, "trad": 105000, "silver": 2450 };
    const slide = slides[simIndex % slides.length];

    const karatTitle = document.getElementById('sim-karat-title');
    const priceVal = document.getElementById('sim-price-val');
    const simTime = document.getElementById('sim-time');

    if (karatTitle && priceVal) {
      karatTitle.textContent = slide.karat;
      karatTitle.style.color = slide.color;
      karatTitle.style.textShadow = `0 0 8px ${slide.color}`;

      const price = currentRates[slide.key] || 0;
      priceVal.textContent = `৳ ${price.toLocaleString('en-US')}`;
    }

    if (simTime) {
      const d = new Date();
      simTime.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    simIndex++;
  }

  simTimer = setInterval(tick, simSpeedMs);
  tick();

  const toggleBtn = document.getElementById('btn-sim-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      simActive = !simActive;
      toggleBtn.innerHTML = simActive ? '<i class="fa-solid fa-pause"></i> পজ' : '<i class="fa-solid fa-play"></i> প্লে';
    });
  }

  const speedBtn = document.getElementById('btn-sim-speed');
  if (speedBtn) {
    speedBtn.addEventListener('click', () => {
      if (simSpeedMs === 2800) simSpeedMs = 1500;
      else if (simSpeedMs === 1500) simSpeedMs = 4000;
      else simSpeedMs = 2800;

      clearInterval(simTimer);
      simTimer = setInterval(tick, simSpeedMs);
      showAdminToast(`সিমুলেটর স্পিড: ${simSpeedMs / 1000} সেকেন্ড`);
    });
  }
}

// Navigation Tabs
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active');
    });
  });
}

// Settings Form
function setupSettingsForm() {
  const form = document.getElementById('form-admin-settings');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const interval = document.getElementById('set-sync-interval')?.value;
    const upstreamUrl = document.getElementById('set-upstream-url')?.value;
    const newPassword = document.getElementById('set-new-pwd')?.value;

    const btn = document.getElementById('btn-save-settings');
    btn.disabled = true;

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoSyncIntervalMinutes: interval,
          upstreamUrl,
          newPassword: newPassword || undefined
        })
      });
      const data = await res.json();
      btn.disabled = false;

      if (data.success) {
        showAdminToast('সেটিংস সফলভাবে সংরক্ষিত হয়েছে!');
        document.getElementById('set-new-pwd').value = '';
        loadAdminStatus();
      }
    } catch (err) {
      btn.disabled = false;
      showAdminToast('সেটিংস সংরক্ষণ ব্যর্থ হয়েছে');
    }
  });
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupAutoConversionLink();
  setupSettingsForm();
  startMatrixSimulator();

  // Mode Buttons
  document.getElementById('btn-set-mode-auto')?.addEventListener('click', () => setMode('auto'));
  document.getElementById('btn-set-mode-manual')?.addEventListener('click', () => setMode('manual'));

  // Force Sync Button
  document.getElementById('btn-force-sync')?.addEventListener('click', forceSync);

  // Rate Form
  document.getElementById('form-rates-override')?.addEventListener('submit', saveManualRates);

  // Reset Form
  document.getElementById('btn-reset-form')?.addEventListener('click', loadAdminStatus);

  // Refresh Devices
  document.getElementById('btn-refresh-devices')?.addEventListener('click', () => {
    loadAdminStatus();
    showAdminToast('ডিভাইস তালিকা রিফ্রেশ করা হয়েছে');
  });

  // Copy API URL
  document.getElementById('btn-admin-copy-url')?.addEventListener('click', () => {
    const url = `${window.location.origin}/api/rates`;
    navigator.clipboard.writeText(url).then(() => showAdminToast('API URL কপি হয়েছে!'));
  });

  // Copy JSON
  document.getElementById('btn-copy-json')?.addEventListener('click', () => {
    const json = document.getElementById('admin-json-viewer')?.textContent;
    navigator.clipboard.writeText(json).then(() => showAdminToast('JSON পে-লোড কপি হয়েছে!'));
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  // Initial Load
  loadAdminStatus();

  // Polling every 10s for live devices & status
  setInterval(loadAdminStatus, 10000);
});
