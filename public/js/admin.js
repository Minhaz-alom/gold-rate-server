/**
 * Admin Panel JavaScript Logic
 * Handles Rate Overrides, Auto/Manual Mode Toggling, LED Matrix Simulator, and Direct GitHub Cloud Sync
 */

const RATIO = 11.6638; // 1 Bhori = 11.6638 Grams

let adminState = {
  mode: 'auto',
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
    autoSyncIntervalMinutes: 15,
    upstreamUrl: 'https://www.goldr.org/price.ultra.js',
    lastSyncAttempt: 'Auto',
    lastSyncStatus: 'success',
    lastSyncMessage: 'Ready'
  },
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
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Check Authentication on Page Load
function checkAuth() {
  const isAuth = sessionStorage.getItem('admin_auth');
  const isStaticOrGH = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

  if (isStaticOrGH && !isAuth) {
    window.location.href = './login.html';
    return false;
  }
  return true;
}

// Push File to GitHub directly via REST API
async function pushFileToGitHub(path, contentObj, commitMessage) {
  const token = localStorage.getItem('gh_token');
  const repo = localStorage.getItem('gh_repo') || 'Minhaz-alom/gold-rate-server';

  if (!token) {
    console.warn('GitHub token not set. Skipping direct repo commit.');
    return { success: false, error: 'NO_TOKEN' };
  }

  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const contentBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(contentObj, null, 2))));

  try {
    let sha = null;
    const getRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    }

    const putBody = {
      message: commitMessage || `feat: update ${path} via Admin Panel`,
      content: contentBase64
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody)
    });

    if (putRes.ok) {
      return { success: true };
    } else {
      const errData = await putRes.json();
      return { success: false, error: errData.message };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Fetch Admin Dashboard Status
async function loadAdminStatus() {
  const isStaticOrGH = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

  const ghToken = localStorage.getItem('gh_token');
  const ghBanner = document.getElementById('gh-token-alert');
  const ghSidebarStatus = document.getElementById('sidebar-gh-status');

  if (isStaticOrGH) {
    if (!ghToken) {
      if (ghBanner) ghBanner.style.display = 'flex';
      if (ghSidebarStatus) {
        ghSidebarStatus.textContent = 'টোকেন প্রয়োজন';
        ghSidebarStatus.style.color = '#f59e0b';
      }
    } else {
      if (ghBanner) ghBanner.style.display = 'none';
      if (ghSidebarStatus) {
        ghSidebarStatus.textContent = 'সংযুক্ত (Connected)';
        ghSidebarStatus.style.color = '#10b981';
      }
    }

    try {
      const res = await fetch('./api/rates.json?t=' + Date.now());
      if (res.ok) {
        const live = await res.json();
        adminState.mode = live.source || 'auto';
        adminState.rates = live.rates || adminState.rates;
        adminState.updated = live.updated || new Date().toISOString().slice(0, 16).replace('T', ' ');

        if (live.source === 'manual') {
          adminState.manualRates = live.rates;
        } else {
          adminState.autoRates = live.rates;
        }
      }
    } catch (e) {
      console.warn('Could not load api/rates.json, using state.');
    }

    updateUIWithState(adminState);
    return;
  }

  // Dynamic Server Mode
  try {
    const res = await fetch('/api/admin/status');
    if (res.status === 401) {
      window.location.href = './login.html';
      return;
    }
    const data = await res.json();
    adminState = data;
    updateUIWithState(data);
  } catch (err) {
    console.warn('Failed to fetch /api/admin/status, using local state.');
    updateUIWithState(adminState);
  }
}

// Update UI Components
function updateUIWithState(data) {
  updateModeDisplay(data.mode);

  const manual = data.manualRates || data.rates || {};
  if (manual.gram && manual.bhori) {
    ['22k', '21k', '18k', 'trad', 'silver'].forEach(k => {
      const gInput = document.getElementById(`input-gram-${k}`);
      const bInput = document.getElementById(`input-bhori-${k}`);
      if (gInput && manual.gram[k]) gInput.value = manual.gram[k];
      if (bInput && manual.bhori[k]) bInput.value = manual.bhori[k];
    });
  }

  const syncBadge = document.getElementById('sync-status-badge');
  const syncMsg = document.getElementById('sync-status-message');

  if (syncBadge) {
    syncBadge.className = 'badge-status-success';
    syncBadge.textContent = 'SUCCESS';
    if (syncMsg) syncMsg.textContent = `সর্বশেষ রেট: ${data.updated || 'সক্রিয়'}`;
  }

  const timeEl = document.getElementById('sidebar-server-time');
  if (timeEl && data.updated) {
    timeEl.textContent = data.updated.split(' ')[1] || data.updated;
  }

  const endpointInput = document.getElementById('admin-api-endpoint');
  if (endpointInput) {
    const isGH = window.location.hostname.includes('github.io');
    endpointInput.value = isGH
      ? `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}/api/rates.json`
      : `${window.location.origin}/api/rates`;
  }

  const jsonViewer = document.getElementById('admin-json-viewer');
  if (jsonViewer) {
    const payload = {
      source: data.mode,
      updated: data.updated || new Date().toISOString().slice(0, 16).replace('T', ' '),
      rates: data.rates
    };
    jsonViewer.textContent = JSON.stringify(payload, null, 2);
  }

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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">কোনো ESP32 বোর্ড এখনও যুক্ত হয়নি। <br><small>ESP32 বোর্ডে RATE_SERVER_URL সেট করার পর প্রথম রিকোয়েস্টে এখানে যুক্ত হবে।</small></td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map(d => {
    const isRecent = (Date.now() - new Date(d.lastSeen).getTime()) < 120000;
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
  const isStaticOrGH = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

  adminState.mode = newMode;
  adminState.rates = newMode === 'manual' ? adminState.manualRates : adminState.autoRates;
  adminState.updated = new Date().toISOString().slice(0, 16).replace('T', ' ');

  if (isStaticOrGH) {
    const ghToken = localStorage.getItem('gh_token');
    if (ghToken) {
      showAdminToast('GitHub এ মোড আপডেট করা হচ্ছে...');
      const payload = {
        source: newMode,
        updated: adminState.updated,
        rates: adminState.rates
      };

      const dataPayload = {
        mode: newMode,
        updated: adminState.updated,
        rates: adminState.rates,
        manualRates: adminState.manualRates,
        autoRates: adminState.autoRates
      };

      await pushFileToGitHub('api/rates.json', payload, `feat: switch mode to ${newMode}`);
      await pushFileToGitHub('api/rates', payload, `feat: switch mode to ${newMode}`);
      await pushFileToGitHub('data/rates.json', dataPayload, `feat: switch mode to ${newMode}`);

      showAdminToast(`সফল! GitHub এ মোড পরিবর্তিত হয়েছে: ${newMode === 'auto' ? 'Auto Sync' : 'Manual Override'}`);
    } else {
      showAdminToast(`মোড লোকাল প্রিভিউতে সেট হয়েছে: ${newMode}. লাইভ পাবলিশ করতে GitHub টোকেন দিন।`);
    }

    updateUIWithState(adminState);
    return;
  }

  // Node.js Server Mode
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
    showAdminToast(`মোড পরিবর্তিত হয়েছে: ${newMode}`);
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

  const cleanRates = {
    gram: gramRates,
    bhori: bhoriRates
  };

  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

  adminState.manualRates = cleanRates;
  adminState.rates = cleanRates;
  adminState.mode = 'manual';
  adminState.updated = nowStr;

  const btn = document.getElementById('btn-save-rates');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> GitHub এ পাবলিশ হচ্ছে...';

  const isStaticOrGH = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

  if (isStaticOrGH) {
    const ghToken = localStorage.getItem('gh_token');

    if (ghToken) {
      const payload = {
        source: "manual",
        updated: nowStr,
        rates: cleanRates
      };

      const dataPayload = {
        mode: "manual",
        updated: nowStr,
        rates: cleanRates,
        manualRates: cleanRates,
        autoRates: adminState.autoRates
      };

      const res1 = await pushFileToGitHub('api/rates.json', payload, 'feat: update manual rates via Admin Panel');
      const res2 = await pushFileToGitHub('api/rates', payload, 'feat: update manual rates via Admin Panel');
      const res3 = await pushFileToGitHub('data/rates.json', dataPayload, 'feat: update manual rates via Admin Panel');

      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> ম্যানুয়াল রেট সংরক্ষণ ও প্রকাশ করুন';

      if (res1.success) {
        showAdminToast('🎉 দারুণ! ম্যানুয়াল রেট সরাসরি GitHub এ পাবলিশ হয়েছে এবং API আপডেট হয়েছে!');
      } else {
        showAdminToast('⚠️ টোকেন এরর: ' + (res1.error || 'টোকেনের পারমিশন চেক করুন'));
      }
    } else {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> ম্যানুয়াল রেট সংরক্ষণ ও প্রকাশ করুন';
      showAdminToast('লোকাল প্রিভিউ সেভ হয়েছে! GitHub এ সরাসরি পাবলিশ করতে Settings ট্যাবে GitHub Token দিন।');
    }

    updateUIWithState(adminState);
    return;
  }

  // Node.js Server Mode
  try {
    const res = await fetch('/api/admin/rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates: cleanRates, autoSwitchToManual: true })
    });
    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> ম্যানুয়াল রেট সংরক্ষণ ও প্রকাশ করুন';

    if (data.success) {
      showAdminToast('ম্যানুয়াল রেট সফলভাবে সংরক্ষিত হয়েছে!');
      loadAdminStatus();
    } else {
      showAdminToast(data.error || 'সংরক্ষণ ব্যর্থ হয়েছে');
    }
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> ম্যানুয়াল রেট সংরক্ষণ ও প্রকাশ করুন';
    showAdminToast('ম্যানুয়াল রেট আপডেট হয়েছে!');
  }
}

// Download rates.json directly from Admin Panel
function downloadRatesJson() {
  const payload = {
    source: adminState.mode,
    updated: adminState.updated || new Date().toISOString().slice(0, 16).replace('T', ' '),
    rates: adminState.rates
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "rates.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showAdminToast('rates.json ফাইল ডাউনলোড হয়েছে!');
}

// Force Auto-Sync
async function forceSync() {
  const btn = document.getElementById('btn-force-sync');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> সিঙ্ক হচ্ছে...';

  try {
    const res = await fetch('./api/rates.json?t=' + Date.now());
    if (res.ok) {
      const live = await res.json();
      adminState.autoRates = live.rates;
      if (adminState.mode === 'auto') adminState.rates = live.rates;
      adminState.updated = live.updated;
      updateUIWithState(adminState);
      showAdminToast('সর্বশেষ রেট সিঙ্ক হয়েছে!');
    }
  } catch (e) {
    showAdminToast('সিঙ্ক সম্পন্ন');
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> এখনি সিঙ্ক করুন (Sync Now)';
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

  const gotoGh = document.getElementById('btn-goto-gh-settings');
  if (gotoGh) {
    gotoGh.addEventListener('click', () => {
      const settingsTab = document.querySelector('[data-tab="tab-settings"]');
      if (settingsTab) settingsTab.click();
    });
  }
}

// Settings Forms
function setupSettingsForm() {
  // 1. GitHub Token Form
  const formGh = document.getElementById('form-gh-sync');
  if (formGh) {
    const tokenInput = document.getElementById('gh-token-input');
    const repoInput = document.getElementById('gh-repo-input');

    const savedToken = localStorage.getItem('gh_token');
    const savedRepo = localStorage.getItem('gh_repo');
    if (tokenInput && savedToken) tokenInput.value = savedToken;
    if (repoInput && savedRepo) repoInput.value = savedRepo;

    formGh.addEventListener('submit', (e) => {
      e.preventDefault();
      const token = tokenInput.value.trim();
      const repo = repoInput.value.trim();

      if (token) localStorage.setItem('gh_token', token);
      if (repo) localStorage.setItem('gh_repo', repo);

      showAdminToast('GitHub টোকেন সফলভাবে সেভ হয়েছে! এখন রেট এডিট করলে সাথে সাথে পাবলিশ হবে।');
      loadAdminStatus();
    });
  }

  // 2. Admin Password Form
  const formPwd = document.getElementById('form-admin-settings');
  if (formPwd) {
    formPwd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('set-new-pwd')?.value;
      if (newPassword && newPassword.trim().length >= 4) {
        localStorage.setItem('admin_pwd', newPassword.trim());
        showAdminToast('নতুন অ্যাডমিন পাসওয়ার্ড সংরক্ষিত হয়েছে!');
        document.getElementById('set-new-pwd').value = '';
      }
    });
  }
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;

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

  // Download rates.json Button
  document.getElementById('btn-download-rates')?.addEventListener('click', downloadRatesJson);

  // Reset Form
  document.getElementById('btn-reset-form')?.addEventListener('click', loadAdminStatus);

  // Refresh Devices
  document.getElementById('btn-refresh-devices')?.addEventListener('click', () => {
    loadAdminStatus();
    showAdminToast('ডিভাইস তালিকা রিফ্রেশ করা হয়েছে');
  });

  // Copy API URL
  document.getElementById('btn-admin-copy-url')?.addEventListener('click', () => {
    const input = document.getElementById('admin-api-endpoint');
    const url = input ? input.value : `${window.location.origin}/api/rates.json`;
    navigator.clipboard.writeText(url).then(() => showAdminToast('API URL কপি হয়েছে!'));
  });

  // Copy JSON
  document.getElementById('btn-copy-json')?.addEventListener('click', () => {
    const json = document.getElementById('admin-json-viewer')?.textContent;
    navigator.clipboard.writeText(json).then(() => showAdminToast('JSON পে-লোড কপি হয়েছে!'));
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    sessionStorage.removeItem('admin_auth');
    sessionStorage.removeItem('admin_token');
    window.location.href = './login.html';
  });

  // Initial Load
  loadAdminStatus();

  // Polling every 15s
  setInterval(loadAdminStatus, 15000);
});
