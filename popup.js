// ============================================================
// Resume Optimizer – Popup Controller
// ============================================================

// ---- State --------------------------------------------------
let extractedJD = '';
let matchScore = null;

// ---- DOM refs -----------------------------------------------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---- Init ---------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initOptimizeTab();
  initSettingsTab();
  await loadSettingsFromStorage();
});

// =============================================================
//  TABS
// =============================================================
function initTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      $$('.tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      $(`#tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// =============================================================
//  OPTIMIZE TAB
// =============================================================
function initOptimizeTab() {
  $('#btn-start').addEventListener('click', handleStart);

  $('#btn-restart').addEventListener('click', () => {
    extractedJD = '';
    matchScore = null;
    $('#score-section').classList.add('hidden');
    $('#start-section').classList.remove('hidden');
    $('#status-bar').classList.add('hidden');
  });
}

// ---- Start (extract JD + calculate match score) ---
async function handleStart() {
  const settings = await getSettingsFromStorage();
  if (!settings?.apiKey) {
    showStatus('error', 'Please set your OpenAI API key in Settings.');
    return;
  }

  setButtonLoading('#btn-start', true);

  try {
    // Step 1 — Extract JD from the active tab
    showStatus('info', 'Extracting job description from page…');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch { /* already injected or restricted page — continue */ }

    const extRes = await chrome.tabs.sendMessage(tab.id, { action: 'extractJobDescription' });
    if (!extRes?.success) throw new Error(extRes?.error || 'Could not extract job description');
    extractedJD = extRes.text;

    // Step 2 — Calculate match score with AI
    showStatus('info', 'Calculating job match score… (~10s)');
    const scoreRes = await chrome.runtime.sendMessage({
      action: 'calculateMatchScore',
      data: {
        jobDescription: extractedJD,
        model: settings.model || 'gpt-4o-mini',
        apiKey: settings.apiKey
      }
    });
    if (!scoreRes?.success) throw new Error(scoreRes?.error || 'Score calculation failed');

    matchScore = scoreRes.score;
    const summary = scoreRes.summary || '';
    const matches = scoreRes.matches || [];
    const gaps = scoreRes.gaps || [];
    const justification = scoreRes.justification || '';

    // Display the score
    $('#score-value').textContent = `${matchScore}%`;
    $('#score-label').textContent = 'Job Match Score';
    
    // Build detailed breakdown HTML
    let detailsHTML = '';
    if (summary) {
      detailsHTML += `<div style="margin-bottom: 12px; font-weight: 500; color: #334155;">${summary}</div>`;
    }
    
    if (matches.length > 0) {
      detailsHTML += `<div style="margin-bottom: 12px;"><strong style="color: #059669;">✓ Matches:</strong><ul style="margin: 6px 0 0 0; padding-left: 20px; color: #64748b;">`;
      matches.forEach(match => {
        detailsHTML += `<li style="margin-bottom: 4px;">${match}</li>`;
      });
      detailsHTML += `</ul></div>`;
    }
    
    if (gaps.length > 0) {
      detailsHTML += `<div style="margin-bottom: 12px;"><strong style="color: #dc2626;">✗ Gaps:</strong><ul style="margin: 6px 0 0 0; padding-left: 20px; color: #64748b;">`;
      gaps.forEach(gap => {
        detailsHTML += `<li style="margin-bottom: 4px;">${gap}</li>`;
      });
      detailsHTML += `</ul></div>`;
    }
    
    if (justification) {
      detailsHTML += `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;"><strong style="color: #4F46E5;">Why ${matchScore}%?</strong><div style="margin-top: 6px; color: #64748b;">${justification}</div></div>`;
    }
    
    $('#score-details').innerHTML = detailsHTML || 'Match score calculated based on your skills and experience alignment.';

    $('#start-section').classList.add('hidden');
    $('#score-section').classList.remove('hidden');
    showStatus('success', 'Match score calculated!');
  } catch (err) {
    showStatus('error', err.message);
  } finally {
    setButtonLoading('#btn-start', false);
  }
}

// =============================================================
//  SETTINGS TAB
// =============================================================
function initSettingsTab() {
  $('#btn-save-settings').addEventListener('click', saveSettings);

  $('#btn-toggle-key').addEventListener('click', () => {
    const input = $('#api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
}

async function saveSettings() {
  const settings = {
    apiKey: $('#api-key').value.trim(),
    model: $('#model-select').value
  };
  await chrome.storage.local.set({ settings });
  showSettingsStatus('success', 'Settings saved!');
}

async function loadSettingsFromStorage() {
  const result = await chrome.storage.local.get('settings');
  if (result.settings) {
    $('#api-key').value = result.settings.apiKey || '';
    $('#model-select').value = result.settings.model || 'gpt-4o-mini';
  }
}

async function getSettingsFromStorage() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || null;
}

// =============================================================
//  UI HELPERS
// =============================================================
function showStatus(type, msg) {
  const bar = $('#status-bar');
  bar.className = `status-bar ${type}`;
  bar.querySelector('.status-text').textContent = msg;
  bar.classList.remove('hidden');
}

function showSettingsStatus(type, msg) {
  const bar = $('#settings-status');
  bar.className = `status-bar ${type}`;
  bar.textContent = msg;
  bar.classList.remove('hidden');
  setTimeout(() => bar.classList.add('hidden'), 3000);
}

function setButtonLoading(selector, loading) {
  const btn = $(selector);
  btn.disabled = loading;
  btn.querySelector('.spinner')?.classList.toggle('hidden', !loading);
  btn.querySelector('.btn-text')?.classList.toggle('hidden', loading);
}
