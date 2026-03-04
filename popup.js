// ============================================================
// Resume Optimizer – Popup Controller
// ============================================================

/* global jspdf */

// ---- State --------------------------------------------------
let extractedJD = '';
let reframedResume = null; // { experience: [...], skills: [...] }
let latexSource = '';
let pdfBlob = null;

// ---- DOM refs -----------------------------------------------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---- Init ---------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initOptimizeTab();
  initResumeTab();
  initSettingsTab();
  await loadResumeFromStorage();
  await loadSettingsFromStorage();
  await updateRateLimitDisplay();
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
  // Extract button
  $('#btn-extract').addEventListener('click', handleExtract);

  // Edit JD
  $('#btn-edit-jd').addEventListener('click', () => {
    const ta = $('#jd-text');
    ta.readOnly = !ta.readOnly;
    $('#btn-edit-jd').textContent = ta.readOnly ? 'Edit' : 'Done';
    if (ta.readOnly) {
      extractedJD = ta.value;
    }
  });

  // Reframe button
  $('#btn-reframe').addEventListener('click', handleReframe);

  // Download button
  $('#btn-download').addEventListener('click', handleDownload);

  // LaTeX preview
  $('#btn-preview-latex').addEventListener('click', () => {
    $('#latex-source').value = latexSource;
    $('#latex-modal').classList.remove('hidden');
  });

  $('#btn-close-modal').addEventListener('click', () => {
    $('#latex-modal').classList.add('hidden');
  });

  $('#btn-copy-latex').addEventListener('click', () => {
    navigator.clipboard.writeText(latexSource);
    $('#btn-copy-latex').textContent = 'Copied!';
    setTimeout(() => ($('#btn-copy-latex').textContent = 'Copy to Clipboard'), 1500);
  });
}

// ---- Extract ------------------------------------------------
async function handleExtract() {
  setButtonLoading('#btn-extract', true);
  showStatus('info', 'Extracting job description from page…');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractJobDescription' });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Could not extract job description');
    }

    extractedJD = response.text;
    $('#jd-text').value = extractedJD;
    $('#jd-preview').classList.remove('hidden');

    // Enable step 2
    enableStep('step-reframe');
    markStepCompleted('step-extract');
    showStatus('success', `Extracted ${extractedJD.length} characters of job description.`);
  } catch (err) {
    showStatus('error', `Extraction failed: ${err.message}`);
  } finally {
    setButtonLoading('#btn-extract', false);
  }
}

// ---- Reframe ------------------------------------------------
async function handleReframe() {
  // Validate resume exists
  const resume = await getResumeFromStorage();
  if (!resume || !resume.name) {
    showStatus('error', 'Please fill in your resume first (My Resume tab).');
    return;
  }

  // Validate API key
  const settings = await getSettingsFromStorage();
  if (!settings || !settings.apiKey) {
    showStatus('error', 'Please set your OpenAI API key (Settings tab).');
    return;
  }

  // Rate limit check
  const allowed = await checkRateLimit();
  if (!allowed) {
    showStatus('error', 'Rate limit reached (10/hour). Please wait and try again.');
    return;
  }

  setButtonLoading('#btn-reframe', true);
  showStatus('info', 'Reframing your resume with AI… This may take ~10 seconds.');

  try {
    // Get the JD text (user may have edited it)
    extractedJD = $('#jd-text').value || extractedJD;

    const response = await chrome.runtime.sendMessage({
      action: 'reframeResume',
      data: {
        resume,
        jobDescription: extractedJD,
        model: settings.model || 'gpt-4o-mini',
        apiKey: settings.apiKey,
        pageLimit: settings.pageLimit || 1
      }
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Reframing failed');
    }

    reframedResume = response.reframed;
    latexSource = response.latex;

    // Record the API call for rate limiting
    await recordApiCall();

    // Generate PDF
    pdfBlob = generatePDF(resume, reframedResume, settings.pageLimit || 1);

    enableStep('step-download');
    markStepCompleted('step-reframe');
    showStatus('success', 'Resume reframed successfully! Click Download PDF.');
  } catch (err) {
    showStatus('error', `Reframing failed: ${err.message}`);
  } finally {
    setButtonLoading('#btn-reframe', false);
  }
}

// ---- Download -----------------------------------------------
function handleDownload() {
  if (!pdfBlob) {
    showStatus('error', 'No PDF available. Please reframe first.');
    return;
  }

  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resume_optimized.pdf';
  a.click();
  URL.revokeObjectURL(url);
  showStatus('success', 'PDF downloaded!');
}

// =============================================================
//  PDF GENERATION (jsPDF)
// =============================================================
function generatePDF(baseResume, reframed, pageLimit) {
  const { jsPDF } = jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 50;
  const contentW = pageW - margin * 2;
  let y = margin;

  // ---- Helpers ----
  function addText(text, size, style, color, align) {
    doc.setFontSize(size);
    doc.setFont('helvetica', style || 'normal');
    doc.setTextColor(...(color || [30, 41, 59]));
    const lines = doc.splitTextToSize(text, contentW);
    const lineH = size * 1.3;

    // Check if we'd overflow (single-page enforcement)
    if (pageLimit === 1 && y + lines.length * lineH > pageH - margin) {
      return false; // signal overflow
    }

    for (const line of lines) {
      if (y > pageH - margin) {
        if (pageLimit === 1) return false;
        doc.addPage();
        y = margin;
      }
      if (align === 'center') {
        doc.text(line, pageW / 2, y, { align: 'center' });
      } else {
        doc.text(line, margin, y);
      }
      y += lineH;
    }
    return true;
  }

  function addLine() {
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
  }

  function sectionTitle(title) {
    y += 4;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text(title.toUpperCase(), margin, y);
    y += 3;
    addLine();
  }

  // ---- Name & Contact ----
  addText(baseResume.name, 18, 'bold', [30, 41, 59], 'center');
  y += 2;

  const contactParts = [baseResume.email, baseResume.phone, baseResume.location].filter(Boolean);
  if (baseResume.linkedin) contactParts.push(baseResume.linkedin);
  if (contactParts.length) {
    addText(contactParts.join('  |  '), 9, 'normal', [100, 116, 139], 'center');
  }
  y += 6;
  addLine();

  // ---- Summary ----
  if (baseResume.summary) {
    sectionTitle('Professional Summary');
    addText(baseResume.summary, 10, 'normal', [51, 65, 85]);
  }

  // ---- Experience ----
  if (reframed.experience && reframed.experience.length > 0) {
    sectionTitle('Professional Experience');

    for (const exp of reframed.experience) {
      // Title line
      const titleLine = `${exp.title}  —  ${exp.company}`;
      addText(titleLine, 10, 'bold', [30, 41, 59]);

      if (exp.dates) {
        addText(exp.dates, 9, 'italic', [100, 116, 139]);
      }
      y += 2;

      // Bullets
      if (exp.bullets && exp.bullets.length > 0) {
        for (const bullet of exp.bullets) {
          const bulletText = `•  ${bullet}`;
          const ok = addText(bulletText, 9.5, 'normal', [51, 65, 85]);
          if (!ok) break;
          y += 1;
        }
      }
      y += 4;
    }
  }

  // ---- Skills ----
  if (reframed.skills && reframed.skills.length > 0) {
    sectionTitle('Skills');
    const skillsText = reframed.skills.join('  •  ');
    addText(skillsText, 10, 'normal', [51, 65, 85]);
  }

  // ---- Education ----
  if (baseResume.education && baseResume.education.length > 0) {
    sectionTitle('Education');
    for (const edu of baseResume.education) {
      addText(`${edu.degree}  —  ${edu.school}`, 10, 'bold', [30, 41, 59]);
      if (edu.dates) {
        addText(edu.dates, 9, 'italic', [100, 116, 139]);
      }
      y += 4;
    }
  }

  return doc.output('blob');
}

// =============================================================
//  RESUME TAB
// =============================================================
function initResumeTab() {
  $('#btn-add-exp').addEventListener('click', () => addExperienceEntry());
  $('#btn-add-edu').addEventListener('click', () => addEducationEntry());
  $('#btn-save-resume').addEventListener('click', saveResume);
  $('#btn-import-resume').addEventListener('change', importResume);
  $('#btn-export-resume').addEventListener('click', exportResume);
}

function addExperienceEntry(data) {
  const container = $('#experience-list');
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.innerHTML = `
    <div class="entry-header">
      <strong style="font-size:12px">Experience</strong>
      <button class="btn-remove" title="Remove">×</button>
    </div>
    <input type="text" class="exp-title" placeholder="Job Title" value="${esc(data?.title || '')}">
    <input type="text" class="exp-company" placeholder="Company" value="${esc(data?.company || '')}">
    <input type="text" class="exp-dates" placeholder="Dates (e.g. Jan 2020 – Present)" value="${esc(data?.dates || '')}">
    <textarea class="exp-bullets" rows="4" placeholder="Bullet points (one per line)">${esc(data?.bullets?.join('\n') || '')}</textarea>
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => card.remove());
  container.appendChild(card);
}

function addEducationEntry(data) {
  const container = $('#education-list');
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.innerHTML = `
    <div class="entry-header">
      <strong style="font-size:12px">Education</strong>
      <button class="btn-remove" title="Remove">×</button>
    </div>
    <input type="text" class="edu-degree" placeholder="Degree" value="${esc(data?.degree || '')}">
    <input type="text" class="edu-school" placeholder="School" value="${esc(data?.school || '')}">
    <input type="text" class="edu-dates" placeholder="Dates" value="${esc(data?.dates || '')}">
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => card.remove());
  container.appendChild(card);
}

function gatherResumeData() {
  const experience = [];
  $$('#experience-list .entry-card').forEach((card) => {
    experience.push({
      title: card.querySelector('.exp-title').value.trim(),
      company: card.querySelector('.exp-company').value.trim(),
      dates: card.querySelector('.exp-dates').value.trim(),
      bullets: card
        .querySelector('.exp-bullets')
        .value.split('\n')
        .map((b) => b.trim())
        .filter(Boolean)
    });
  });

  const education = [];
  $$('#education-list .entry-card').forEach((card) => {
    education.push({
      degree: card.querySelector('.edu-degree').value.trim(),
      school: card.querySelector('.edu-school').value.trim(),
      dates: card.querySelector('.edu-dates').value.trim()
    });
  });

  return {
    name: $('#resume-name').value.trim(),
    email: $('#resume-email').value.trim(),
    phone: $('#resume-phone').value.trim(),
    location: $('#resume-location').value.trim(),
    linkedin: $('#resume-linkedin').value.trim(),
    summary: $('#resume-summary').value.trim(),
    experience,
    education,
    skills: $('#resume-skills')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  };
}

async function saveResume() {
  const data = gatherResumeData();
  await chrome.storage.local.set({ resume: data });
  showResumeStatus('success', 'Resume saved!');
}

async function loadResumeFromStorage() {
  const result = await chrome.storage.local.get('resume');
  if (result.resume) {
    populateResumeForm(result.resume);
  }
}

function populateResumeForm(r) {
  $('#resume-name').value = r.name || '';
  $('#resume-email').value = r.email || '';
  $('#resume-phone').value = r.phone || '';
  $('#resume-location').value = r.location || '';
  $('#resume-linkedin').value = r.linkedin || '';
  $('#resume-summary').value = r.summary || '';
  $('#resume-skills').value = (r.skills || []).join(', ');

  // Clear and re-add experience
  $('#experience-list').innerHTML = '';
  (r.experience || []).forEach((exp) => addExperienceEntry(exp));

  // Clear and re-add education
  $('#education-list').innerHTML = '';
  (r.education || []).forEach((edu) => addEducationEntry(edu));
}

function importResume(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      populateResumeForm(data);
      showResumeStatus('success', 'Resume imported!');
    } catch {
      showResumeStatus('error', 'Invalid JSON file.');
    }
  };
  reader.readAsText(file);
}

function exportResume() {
  const data = gatherResumeData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resume.json';
  a.click();
  URL.revokeObjectURL(url);
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
    model: $('#model-select').value,
    pageLimit: parseInt($('#page-limit').value, 10)
  };
  await chrome.storage.local.set({ settings });
  showSettingsStatus('success', 'Settings saved!');
}

async function loadSettingsFromStorage() {
  const result = await chrome.storage.local.get('settings');
  if (result.settings) {
    $('#api-key').value = result.settings.apiKey || '';
    $('#model-select').value = result.settings.model || 'gpt-4o-mini';
    $('#page-limit').value = result.settings.pageLimit || 1;
  }
}

async function getSettingsFromStorage() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || null;
}

async function getResumeFromStorage() {
  const result = await chrome.storage.local.get('resume');
  return result.resume || null;
}

// =============================================================
//  RATE LIMITING
// =============================================================
async function checkRateLimit() {
  const result = await chrome.storage.local.get('apiCalls');
  const calls = result.apiCalls || [];
  const oneHourAgo = Date.now() - 3600000;
  const recentCalls = calls.filter((t) => t > oneHourAgo);
  return recentCalls.length < 10;
}

async function recordApiCall() {
  const result = await chrome.storage.local.get('apiCalls');
  const calls = result.apiCalls || [];
  const oneHourAgo = Date.now() - 3600000;
  const recentCalls = calls.filter((t) => t > oneHourAgo);
  recentCalls.push(Date.now());
  await chrome.storage.local.set({ apiCalls: recentCalls });
  await updateRateLimitDisplay();
}

async function updateRateLimitDisplay() {
  const result = await chrome.storage.local.get('apiCalls');
  const calls = result.apiCalls || [];
  const oneHourAgo = Date.now() - 3600000;
  const count = calls.filter((t) => t > oneHourAgo).length;
  $('#rate-limit-count').textContent = `Calls this hour: ${count} / 10`;
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

function showResumeStatus(type, msg) {
  const bar = $('#resume-status');
  bar.className = `status-bar ${type}`;
  bar.textContent = msg;
  bar.classList.remove('hidden');
  setTimeout(() => bar.classList.add('hidden'), 3000);
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

function enableStep(stepId) {
  const step = $(`#${stepId}`);
  step.classList.remove('disabled');
  step.querySelectorAll('button').forEach((b) => (b.disabled = false));
}

function markStepCompleted(stepId) {
  $(`#${stepId}`).classList.add('completed');
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
