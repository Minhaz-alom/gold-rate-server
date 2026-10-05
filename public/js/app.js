/**
 * Gold Rate Bangladesh - Frontend Application Logic
 * Integrates with /api/rates, manages calculator, and provides fail-safe fallback for both Local Express & GitHub Pages
 */

// Bengali Numeral Converter
function toBengaliNumerals(num) {
  if (num === null || num === undefined || isNaN(num)) return '---';
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const formatted = Math.round(Number(num)).toLocaleString('en-US');
  return String(formatted).replace(/\d/g, d => bnDigits[d]);
}

// Global cached rates
let currentRates = {
  gram: { "22k": 14500, "21k": 13800, "18k": 11800, "silver": 210, "trad": 9000 },
  bhori: { "22k": 169000, "21k": 161000, "18k": 137000, "silver": 2450, "trad": 105000 }
};

// Unit conversions based on Bangladesh BAJUS standards:
// 1 Bhori (Vori) = 11.6638 Grams = 16 Ana = 96 Ratti = 960 Points
const UNIT_RATIO_IN_GRAMS = {
  gram: 1.0,
  bhori: 11.6638,
  ana: 11.6638 / 16,     // 0.7289875 g
  rati: 11.6638 / 96,    // 0.1214979 g
  point: 11.6638 / 960,  // 0.0121498 g
  kg: 1000.0,
  ounce: 31.1034768
};

// Toast notification trigger
function showToast(message) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  if (!toast || !msgEl) return;
  msgEl.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Fetch live rates from /api/rates or fallback to ./api/rates.json (GitHub Pages compatible)
async function fetchServerRates() {
  const endpoints = ['./api/rates', './api/rates.json', '/api/rates'];
  let data = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        data = await res.json();
        break;
      }
    } catch (e) {
      // Continue to next endpoint
    }
  }

  if (!data) return;

  if (data.rates) {
    currentRates = data.rates;
  }

  // Update time & mode in ticker
  const timeEl = document.getElementById('header-update-time');
  if (timeEl && data.updated) {
    timeEl.textContent = data.updated;
  }

  const modeBadge = document.getElementById('header-mode-badge');
  if (modeBadge) {
    if (data.source === 'manual') {
      modeBadge.textContent = 'ম্যানুয়াল মোড';
      modeBadge.style.background = 'rgba(245, 158, 11, 0.2)';
      modeBadge.style.color = '#fbbf24';
    } else {
      modeBadge.textContent = 'অটো সিঙ্ক';
      modeBadge.style.background = 'rgba(56, 189, 248, 0.2)';
      modeBadge.style.color = '#38bdf8';
    }
  }

  // Update live JSON preview in modal
  const jsonPreview = document.getElementById('live-json-preview');
  if (jsonPreview) {
    jsonPreview.textContent = JSON.stringify(data, null, 2);
  }

  // Update Silver custom values
  updateSilverDisplays(currentRates);

  // Apply self-healing fallback for any unfilled i[data] attributes
  fallbackPopulateDataTags(currentRates);

  // Recalculate calculator
  calculateGoldPrice();
}

// Update Silver Rate displays
function updateSilverDisplays(rates) {
  const sGram = rates.gram?.silver || 210;
  const sBhori = rates.bhori?.silver || Math.round(sGram * 11.6638);
  const elGram = document.getElementById('silver-gram-val');
  const elBhori = document.getElementById('silver-bhori-val');
  const elHalf = document.getElementById('silver-half-val');
  const el10g = document.getElementById('silver-10g-val');

  if (elGram) elGram.textContent = toBengaliNumerals(sGram);
  if (elBhori) elBhori.textContent = toBengaliNumerals(sBhori);
  if (elHalf) elHalf.textContent = toBengaliNumerals(Math.round(sBhori / 2));
  if (el10g) el10g.textContent = toBengaliNumerals(Math.round(sGram * 10));
}

// Fallback population for i[data] elements if external price.ultra.js is slow/blocked
function fallbackPopulateDataTags(rates) {
  const dataElements = document.querySelectorAll('i[data]');
  dataElements.forEach(el => {
    const currentText = el.textContent.trim();
    if (currentText !== '' && currentText !== '...' && currentText !== 'লোড হচ্ছে...' && currentText !== '---') {
      return;
    }

    const dataAttr = el.getAttribute('data');
    if (!dataAttr) return;

    const parts = dataAttr.split('-');
    if (parts.length < 3) return;

    let karat = parts[0].toLowerCase();
    if (karat === 'old') karat = 'trad';

    const weightUnitMatch = parts[1].match(/^(\d+(?:\.\d+)?)([a-z]+)$/i);
    if (!weightUnitMatch) return;

    const weight = parseFloat(weightUnitMatch[1]);
    const unit = weightUnitMatch[2].toLowerCase();

    const gramRate = rates.gram?.[karat] || (karat === '22k' ? 14500 : karat === '21k' ? 13800 : karat === '18k' ? 11800 : 9000);
    const unitInGrams = UNIT_RATIO_IN_GRAMS[unit] || 1.0;
    const totalWeightInGrams = weight * unitInGrams;
    const calculatedPrice = Math.round(gramRate * totalWeightInGrams);

    el.textContent = toBengaliNumerals(calculatedPrice);
  });
}

// Live Gold Price & Jewelry Calculator
function calculateGoldPrice() {
  const karatSelect = document.getElementById('calc-karat');
  const unitSelect = document.getElementById('calc-unit');
  const weightInput = document.getElementById('calc-weight');
  const makingInput = document.getElementById('calc-making');
  const vatInput = document.getElementById('calc-vat');

  if (!karatSelect || !unitSelect || !weightInput) return;

  const karat = karatSelect.value;
  const unit = unitSelect.value;
  const weight = parseFloat(weightInput.value) || 0;
  const makingPerUnit = parseFloat(makingInput?.value) || 0;
  const vatPercent = parseFloat(vatInput?.value) || 0;

  const gramRate = currentRates.gram?.[karat] || 14500;
  const unitRatio = UNIT_RATIO_IN_GRAMS[unit] || 1.0;
  const totalGrams = weight * unitRatio;
  const totalBhori = totalGrams / 11.6638;

  const basePrice = Math.round(gramRate * totalGrams);
  const totalMaking = Math.round(makingPerUnit * (unit === 'gram' ? totalGrams : totalBhori));
  const taxableAmount = basePrice + totalMaking;
  const vatAmount = Math.round((taxableAmount * vatPercent) / 100);
  const grandTotal = basePrice + totalMaking + vatAmount;

  const resBase = document.getElementById('res-base-price');
  const resMaking = document.getElementById('res-making-price');
  const resVat = document.getElementById('res-vat-price');
  const resTotal = document.getElementById('res-total-price');

  if (resBase) resBase.textContent = `৳ ${toBengaliNumerals(basePrice)}`;
  if (resMaking) resMaking.textContent = `৳ ${toBengaliNumerals(totalMaking)}`;
  if (resVat) resVat.textContent = `৳ ${toBengaliNumerals(vatAmount)}`;
  if (resTotal) resTotal.textContent = `৳ ${toBengaliNumerals(grandTotal)}`;

  const convBhori = document.getElementById('conv-bhori');
  const convGram = document.getElementById('conv-gram');
  const convAna = document.getElementById('conv-ana');
  const convRati = document.getElementById('conv-rati');

  if (convBhori) convBhori.textContent = `${(totalBhori).toFixed(3)} ভরি`;
  if (convGram) convGram.textContent = `${(totalGrams).toFixed(3)} গ্রাম`;
  if (convAna) convAna.textContent = `${(totalBhori * 16).toFixed(2)} আনা`;
  if (convRati) convRati.textContent = `${(totalBhori * 96).toFixed(1)} রতি`;
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('public-api-url');
  if (apiUrlInput) {
    const isGitHubPages = window.location.hostname.includes('github.io');
    apiUrlInput.value = isGitHubPages 
      ? `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}/api/rates.json` 
      : `${window.location.origin}/api/rates`;
  }

  fetchServerRates();

  setTimeout(() => {
    fallbackPopulateDataTags(currentRates);
  }, 1500);

  ['calc-karat', 'calc-unit', 'calc-weight', 'calc-making', 'calc-vat'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', calculateGoldPrice);
      el.addEventListener('change', calculateGoldPrice);
    }
  });

  const apiModal = document.getElementById('api-modal');
  const btnOpenModal = document.getElementById('btn-api-modal');
  const btnViewApiCard = document.getElementById('btn-view-api-card');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnModalDone = document.getElementById('btn-modal-done');

  function openModal() {
    if (apiModal) apiModal.classList.add('active');
  }
  function closeModal() {
    if (apiModal) apiModal.classList.remove('active');
  }

  if (btnOpenModal) btnOpenModal.addEventListener('click', openModal);
  if (btnViewApiCard) btnViewApiCard.addEventListener('click', openModal);
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnModalDone) btnModalDone.addEventListener('click', closeModal);

  if (apiModal) {
    apiModal.addEventListener('click', (e) => {
      if (e.target === apiModal) closeModal();
    });
  }

  const btnCopyApi = document.getElementById('btn-copy-api-url');
  if (btnCopyApi) {
    btnCopyApi.addEventListener('click', () => {
      const url = apiUrlInput ? apiUrlInput.value : window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        showToast('API URL সফলভাবে কপি হয়েছে!');
      });
    });
  }

  const btnRefresh = document.getElementById('btn-refresh-rates');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      fetchServerRates();
      showToast('সোনার দাম হালনাগাদ করা হয়েছে');
    });
  }

  const btnPrint = document.getElementById('btn-print-rates');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  const btnCopyRates = document.getElementById('btn-copy-rates');
  if (btnCopyRates) {
    btnCopyRates.addEventListener('click', () => {
      const summary = `আজকের সোনার দাম (বাংলাদেশ):\n২২ ক্যারেট (১ ভরি): ৳ ${currentRates.bhori['22k']}\n২১ ক্যারেট (১ ভরি): ৳ ${currentRates.bhori['21k']}\n১৮ ক্যারেট (১ ভরি): ৳ ${currentRates.bhori['18k']}\nসনাতন সোনা (১ ভরি): ৳ ${currentRates.bhori['trad']}\nরূপা (১ ভরি): ৳ ${currentRates.bhori['silver']}\n\nউৎস: ${window.location.origin}/api/rates`;
      navigator.clipboard.writeText(summary).then(() => {
        showToast('রেট তালিকা কপি হয়েছে!');
      });
    });
  }

  setInterval(fetchServerRates, 30000);
});
