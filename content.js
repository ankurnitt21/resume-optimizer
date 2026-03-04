// ============================================================
// Resume Optimizer – Content Script
// Extracts job description text from the current page.
// ============================================================

(() => {
  // Listen for messages from the popup / background
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'extractJobDescription') {
      try {
        const text = extractJobDescription();
        if (text && text.length > 50) {
          sendResponse({ success: true, text });
        } else {
          sendResponse({
            success: false,
            error:
              'Could not find a substantial job description on this page. Try selecting text manually or ensure you are on a job posting page.'
          });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true; // keep port open for async
    }
  });

  /**
   * Multi-strategy job description extraction.
   * Tries structured selectors for popular job boards, then falls back
   * to heuristic extraction from the page body.
   */
  function extractJobDescription() {
    // 1. Check for user-selected text first
    const selection = window.getSelection().toString().trim();
    if (selection && selection.length > 100) {
      return cleanText(selection);
    }

    // 2. Try popular job board selectors
    const text = tryKnownSelectors();
    if (text && text.length > 100) {
      return cleanText(text);
    }

    // 3. Heuristic: find the largest content block with job-related keywords
    return heuristicExtract();
  }

  /**
   * Attempt extraction using known selectors for major job boards.
   */
  function tryKnownSelectors() {
    const selectors = [
      // LinkedIn
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.description__text',
      '#job-details',

      // Indeed
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',

      // Glassdoor
      '.jobDescriptionContent',
      '#JobDescriptionContainer',

      // Greenhouse / Lever
      '#content .section-wrapper',
      '.posting-page .content',
      '.section.page-centered',

      // Workday
      '[data-automation-id="jobPostingDescription"]',

      // ZipRecruiter
      '.job_description',

      // Monster
      '#JobDescription',

      // AngelList / Wellfound
      '.job-description',

      // Generic common selectors
      '[class*="job-description"]',
      '[class*="jobDescription"]',
      '[class*="job_description"]',
      '[id*="job-description"]',
      '[id*="jobDescription"]',
      '[data-testid*="description"]',
      '[data-testid*="jobDescription"]',
      'article [class*="description"]',

      // ADP, iCIMS, etc.
      '.iCIMS_JobContent',
      '.job-details-content',
      '.job-posting-content'
    ];

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.innerText || el.textContent;
          if (text && text.trim().length > 100) {
            return text.trim();
          }
        }
      } catch {
        // Invalid selector, skip
      }
    }

    return null;
  }

  /**
   * Heuristic fallback: score content blocks by job-related keyword density
   * and pick the most likely job description.
   */
  function heuristicExtract() {
    const keywords = [
      'responsibilities',
      'requirements',
      'qualifications',
      'experience',
      'skills',
      'job description',
      "what you'll do",
      'about the role',
      'we are looking for',
      'you will',
      'you should',
      'must have',
      'nice to have',
      'preferred',
      'minimum',
      'bachelor',
      'degree',
      'team',
      'years of experience',
      'proficiency',
      'ability to',
      'compensation',
      'benefits',
      'salary',
      'full-time',
      'remote',
      'hybrid',
      'on-site',
      'equal opportunity'
    ];

    const candidates = [];

    // Gather text blocks from semantic containers
    const containers = document.querySelectorAll(
      'main, article, section, [role="main"], .content, .container, .job, .posting'
    );

    const elements = containers.length > 0 ? containers : document.querySelectorAll('div, section, article');

    elements.forEach((el) => {
      const text = (el.innerText || el.textContent || '').trim();
      // Must be substantial but not the entire page
      if (text.length < 200 || text.length > 50000) return;

      const lower = text.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) score++;
      }

      // Bonus for elements with job-related class/id
      const attrs = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
      if (/job|description|posting|details|role|position|vacancy/.test(attrs)) {
        score += 5;
      }

      if (score >= 3) {
        candidates.push({ el, text, score, length: text.length });
      }
    });

    if (candidates.length === 0) {
      // Last-resort: grab body text
      const bodyText = document.body.innerText || document.body.textContent || '';
      if (bodyText.length > 200) {
        return cleanText(bodyText.substring(0, 8000));
      }
      return null;
    }

    // Sort: highest score first, then prefer shorter (more specific) blocks
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.length - b.length;
    });

    return cleanText(candidates[0].text);
  }

  /**
   * Clean up extracted text: collapse whitespace, limit length.
   */
  function cleanText(text) {
    return text
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\r/g, '')
      .trim()
      .substring(0, 8000); // Limit to ~8k chars for API token efficiency
  }
})();
