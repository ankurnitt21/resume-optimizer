// ============================================================
// Resume Optimizer — Background Service Worker
// ============================================================

const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// ── Candidate Profile ────────────────────────────────────────
const CANDIDATE = {
  name: 'Ankur Rana',
  experience: `Role 1 — Software Engineer, Warehouse Automation Client | Fastenal India (10/2024 – Present)
• Designed event-driven microservices using Java, Spring Boot, and Apache Kafka, processing 50K+ daily order events and improving scalability by 40%
• Built asynchronous workflows for inventory validation, health monitoring, and audit logging, reducing order fulfillment latency by 30%
• Integrated backend services with warehouse automation systems (ASRS, conveyors, packing units), reducing retrieval failures by 25%
• Implemented retry, dead-letter queues (DLQ), and timeout recovery strategies for Kafka consumers, improving system resilience
• Designed REST APIs and internal event processors for real-time exception handling, reducing operational delays by 15%
• Containerized microservices using Docker, enabling consistent and environment-independent deployments
• Automated CI/CD pipelines using Jenkins, reducing manual deployment effort and improving release reliability on servers

Role 2 — Software Developer, Code Migration Suite | Fastenal India (01/2021 – 09/2024)
• Migrated legacy WMS modules to Java 17 and Spring MVC, improving system response time by 25%
• Designed modular RESTful APIs using Spring MVC, Hibernate, and DAO patterns for better separation of concerns
• Implemented data persistence using Spring Data JPA and Hibernate, optimizing entity mappings and query performance
• Implemented Spring AOP to unify application-wide logging, monitoring, and exception handling, enhancing maintainability and improving consistency across microservices and backend modules
• Integrated Jenkins-based CI/CD pipelines for automated build, testing, and artifact management
• Optimized complex SQL queries and improved execution paths, reducing overall database latency
• Standardized application logging and monitoring using the ELK Stack
• Dockerized applications to enable scalable, container-based deployments`,

  skills: {
    languages: 'Java, C/C++, Python, SQL',
    frameworks: 'Spring Boot, Spring MVC, Spring Data JPA, Hibernate, Spring AOP, REST APIs, Apache Kafka, MySQL, PostgreSQL, Jenkins, ELK Stack, GitHub, Docker',
  },

  yearsOfExperience: 5,
};

// ── Original bullets (word counts are fixed — never change) ──
const BULLETS = {
  role1: [
    { id: 'R1B1', words: 20, text: 'Designed event-driven microservices using Java, Spring Boot, and Apache Kafka, processing 50K+ daily order events and improving scalability by 40%' },
    { id: 'R1B2', words: 17, text: 'Built asynchronous workflows for inventory validation, health monitoring, and audit logging, reducing order fulfillment latency by 30%' },
    { id: 'R1B3', words: 16, text: 'Integrated backend services with warehouse automation systems (ASRS, conveyors, packing units), reducing retrieval failures by 25%' },
    { id: 'R1B4', words: 15, text: 'Implemented retry, dead-letter queues (DLQ), and timeout recovery strategies for Kafka consumers, improving system resilience' },
    { id: 'R1B5', words: 16, text: 'Designed REST APIs and internal event processors for real-time exception handling, reducing operational delays by 15%' },
    { id: 'R1B6', words: 9,  text: 'Containerized microservices using Docker, enabling consistent and environment-independent deployments' },
    { id: 'R1B7', words: 15, text: 'Automated CI/CD pipelines using Jenkins, reducing manual deployment effort and improving release reliability on servers' },
  ],
  role2: [
    { id: 'R2B1', words: 16, text: 'Migrated legacy WMS modules to Java 17 and Spring MVC, improving system response time by 25%' },
    { id: 'R2B2', words: 16, text: 'Designed modular RESTful APIs using Spring MVC, Hibernate, and DAO patterns for better separation of concerns' },
    { id: 'R2B3', words: 15, text: 'Implemented data persistence using Spring Data JPA and Hibernate, optimizing entity mappings and query performance' },
    { id: 'R2B4', words: 21, text: 'Implemented Spring AOP to unify application-wide logging, monitoring, and exception handling, enhancing maintainability and improving consistency across microservices and backend modules' },
    { id: 'R2B5', words: 11, text: 'Integrated Jenkins-based CI/CD pipelines for automated build, testing, and artifact management' },
    { id: 'R2B6', words: 12, text: 'Optimized complex SQL queries and improved execution paths, reducing overall database latency' },
    { id: 'R2B7', words: 9,  text: 'Standardized application logging and monitoring using the ELK Stack' },
    { id: 'R2B8', words: 7,  text: 'Dockerized applications to enable scalable, container-based deployments' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────

// Pick the first keyword if alternatives are listed (e.g. "ReactJS / Angular" → "ReactJS")
function pickKeyword(raw) {
  return raw.split(/\s*[\/|,]\s*/)[0].trim();
}

// Count words the same way the AI should (hyphenated = 1 word)
function countWords(text) {
  return text.trim().split(/\s+/).length;
}

// ── Message Router ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const handlers = {
    calculateMatchScore: () => handleMatchScore(request.data),
    optimizeAndOutreach: () => handleOptimize(request.data),
  };
  const handler = handlers[request.action];
  if (!handler) return false;
  handler()
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ success: false, error: e.message }));
  return true;
});

// ── OpenAI Helper ─────────────────────────────────────────────
async function callOpenAI({ apiKey, model, system, user, maxTokens = 1500 }) {
  if (!apiKey) throw new Error('OpenAI API key is not set.');
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `OpenAI API error ${res.status}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI.');
  try { return JSON.parse(raw); }
  catch (e) { throw new Error(`JSON parse failed: ${e.message}`); }
}

// ════════════════════════════════════════════════════════════
// STEP 1 — MATCH SCORE
// ════════════════════════════════════════════════════════════
async function handleMatchScore({ jobDescription, model, apiKey }) {
  if (!jobDescription) throw new Error('No job description provided.');

  const parsed = await callOpenAI({
    apiKey, model,
    maxTokens: 1200,
    system: `You are a resume keyword analyzer.

1. Extract every technical keyword from the job description.
   Include: languages, frameworks, libraries, tools, platforms, methodologies.
   Exclude: soft skills, years of experience, generic phrases.
   Group alternatives as one entry with " / " between them: e.g. "ReactJS / Angular", "AWS / Azure / GCP".

2. Compare each keyword against the candidate profile:
   matched = candidate clearly has it
   missing = candidate does not have it

3. Score 0–100. Weight required skills more than preferred.

Candidate:
${CANDIDATE.experience}
${CANDIDATE.skills.languages}
${CANDIDATE.skills.frameworks}
(${CANDIDATE.yearsOfExperience} years experience)

Return ONLY valid JSON:
{
  "score": number,
  "summary": "1-2 sentences",
  "matched": ["keyword"],
  "missing": ["keyword"],
  "justification": "why this score"
}`,
    user: `JOB DESCRIPTION:\n${jobDescription}`,
  });

  if (typeof parsed.score !== 'number') throw new Error('Invalid score from AI.');
  return {
    success: true,
    score: Math.round(parsed.score),
    summary: parsed.summary || '',
    matches: Array.isArray(parsed.matched) ? parsed.matched : [],
    gaps: Array.isArray(parsed.missing) ? parsed.missing : [],
    justification: parsed.justification || '',
  };
}

// ════════════════════════════════════════════════════════════
// STEP 2 — OPTIMIZE
//
// Strategy:
//   - Parse gaps → deduplicate → pick first alternative each
//   - Build a keyword map: { keyword: { done: false } }
//   - Send ONE prompt that processes keywords ONE BY ONE:
//       For keyword N:
//         1. Add to skills (languages or frameworks)
//         2. Pick the best bullet, swap words to keep same count, bold keyword
//         3. Mark done
//   - AI returns updated bullet array + updated skills + map
//   - JS validates word counts and map completeness
// ════════════════════════════════════════════════════════════
async function handleOptimize({ jobDescription, jobUrl, model, apiKey, gaps }) {
  if (!jobDescription) throw new Error('No job description provided.');

  // Build clean keyword list — pick first alternative, deduplicate
  const keywords = [...new Set(
    (gaps || [])
      .map(pickKeyword)
      .filter(Boolean)
  )];

  if (keywords.length === 0) {
    // No gaps — just bold existing tech terms and return
    return buildResult({
      summary: `Software Engineer with ${CANDIDATE.yearsOfExperience} years of experience in Java backend development.`,
      skillsLanguages: CANDIDATE.skills.languages,
      skillsFrameworks: CANDIDATE.skills.frameworks,
      role1Bullets: BULLETS.role1.map((b) => b.text),
      role2Bullets: BULLETS.role2.map((b) => b.text),
      coldEmail: '', recruiterMsg: '', hiringManagerMsg: '',
      keywordMap: {},
    });
  }

  // Initial keyword tracking map
  const initialMap = {};
  keywords.forEach((kw) => { initialMap[kw] = { done: false, bullet: null }; });

  // Format bullets for prompt with IDs and word counts
  const formatBullets = (bullets) =>
    bullets.map((b) => `  ${b.id} (${b.words}w): ${b.text}`).join('\n');

  const parsed = await callOpenAI({
    apiKey, model,
    maxTokens: 4500,
    system: `You are a resume keyword injector. Process keywords ONE BY ONE into a resume.

════════════════════════════════════════
KEYWORD MAP (process in this exact order)
════════════════════════════════════════
${keywords.map((kw, i) => `${i + 1}. "${kw}" — done: false`).join('\n')}

════════════════════════════════════════
CURRENT RESUME BULLETS
════════════════════════════════════════

Role 1 — Warehouse Automation Client (warehouse/automation context)
${formatBullets(BULLETS.role1)}

Role 2 — Code Migration Suite (code migration/backend context)
${formatBullets(BULLETS.role2)}

════════════════════════════════════════
CURRENT SKILLS
════════════════════════════════════════
Languages: ${CANDIDATE.skills.languages}
Frameworks & Tools: ${CANDIDATE.skills.frameworks}

════════════════════════════════════════
PROCESS — do this FOR EACH keyword in order
════════════════════════════════════════

For keyword N:

  STEP A — Add to skills:
    If it is a programming/scripting language → add to Languages
    Otherwise → add to Frameworks & Tools
    No duplicates.

  STEP B — Inject into one bullet:
    Pick the bullet where the keyword fits most naturally given the story context.
    Each bullet can only receive ONE keyword. Do not reuse a bullet already used.
    SWAP rule: replace a word or phrase in the bullet with the keyword.
      The bullet word count MUST stay exactly the same after the swap.
      Count words before and after — they must match exactly.
      Hyphenated-words and acronyms count as 1 word each.
      ✓ CORRECT: replace a word of same length — "internal" (1w) → "ReactJS-backed" (1w)
      ✓ CORRECT: replace a 2-word phrase — "Apache Kafka" (2w) → "AWS Kafka" (2w)
      ✓ CORRECT: replace a 3-word phrase — "order fulfillment latency" (3w) → "OAuth2-secured API latency" (3w)
      ✗ HARD BAN: adding any word to the end of a bullet ("...by 30% using OAuth2") — FORBIDDEN, always breaks count
      ✗ HARD BAN: adding any word to the middle without removing equal-length words — FORBIDDEN
      ✗ HARD BAN: the word count label in the output (e.g. "R1B1 (20w):") must NOT appear in bullet text
      If a keyword does not fit cleanly via swap, pick a different bullet where it does fit.
    After injecting, wrap the keyword in **double asterisks**: **ReactJS**, **AWS**.
    Also wrap ALL other existing tech terms in that bullet in **double asterisks**.

  STEP C — Mark done:
    Set done: true, bullet: "<bullet id>" in the keyword map.

════════════════════════════════════════
AFTER ALL KEYWORDS ARE PROCESSED
════════════════════════════════════════
- For bullets NOT modified: still wrap all tech terms in **double asterisks**.
- Double-check every bullet word count matches the original exactly.
- Double-check keyword_map shows done: true for every keyword.

════════════════════════════════════════
OUTREACH — after resume is done
════════════════════════════════════════
Candidate: Ankur Rana. Job URL: ${jobUrl || '[job URL]'}
Use the updated bullets (not originals) as the basis.
Tone: real, direct, no buzzwords, no "I am passionate about".

cold_email (120–150 words): Subject line first. Role, 2–3 bullet references, job URL, ask to chat.
recruiter_msg (80–100 words): Role, 1–2 strengths from bullets, job URL, ask to connect.
hiring_manager_msg (80–100 words): Technical tone, reference JD + bullet experience, job URL.

════════════════════════════════════════
RETURN ONLY THIS JSON — no markdown
════════════════════════════════════════
{
  "keyword_map": {
    "ReactJS": { "done": true, "bullet": "R1B5", "skill_added_to": "frameworks" },
    "AWS":     { "done": true, "bullet": "R1B1", "skill_added_to": "frameworks" }
  },
  "skills_languages": "Java, ...",
  "skills_frameworks": "Spring Boot, ...",
  "role1_bullets": ["7 strings — **bold** all tech terms, exact word counts preserved"],
  "role2_bullets": ["8 strings — **bold** all tech terms, exact word counts preserved"],
  "summary": "Software Engineer with 4.8 years of experience... (~30 words, plain text)",
  "cold_email": "",
  "recruiter_msg": "",
  "hiring_manager_msg": ""
}`,
    user: `JOB DESCRIPTION:\n${jobDescription}\n\nKEYWORDS TO INJECT (in order):\n${keywords.map((k, i) => `${i + 1}. ${k}`).join('\n')}`,
  });

  // ── JS-side validation ──────────────────────────────────────

  if (!Array.isArray(parsed.role1_bullets) || parsed.role1_bullets.length !== 7)
    throw new Error(`Role 1 must have exactly 7 bullets — got ${parsed.role1_bullets?.length ?? 0}.`);
  if (!Array.isArray(parsed.role2_bullets) || parsed.role2_bullets.length !== 8)
    throw new Error(`Role 2 must have exactly 8 bullets — got ${parsed.role2_bullets?.length ?? 0}.`);

  // Check word counts — log warnings for mismatches
  const allOriginal = [...BULLETS.role1, ...BULLETS.role2];
  const allReturned = [...parsed.role1_bullets, ...parsed.role2_bullets];
  allOriginal.forEach((orig, i) => {
    const returned = allReturned[i] || '';
    // Strip **...** for word count (bold markers aren't words)
    const clean = returned.replace(/\*\*/g, '');
    const actual = countWords(clean);
    if (actual !== orig.words) {
      console.warn(`[ResumeOptimizer] Word count mismatch on ${orig.id}: expected ${orig.words}, got ${actual} — "${clean}"`);
    }
  });

  // Check all keywords marked done
  const map = parsed.keyword_map || {};
  keywords.forEach((kw) => {
    if (!map[kw]?.done) {
      console.warn(`[ResumeOptimizer] Keyword not marked done in map: "${kw}"`);
    }
    // Also verify keyword actually appears in the bullets
    const allBullets = allReturned.join(' ').toLowerCase();
    if (!allBullets.includes(kw.toLowerCase())) {
      console.warn(`[ResumeOptimizer] Keyword not found in any bullet: "${kw}"`);
    }
  });

  return buildResult({
    summary: parsed.summary || `Software Engineer with ${CANDIDATE.yearsOfExperience} years of experience in Java backend development.`,
    skillsLanguages: parsed.skills_languages || CANDIDATE.skills.languages,
    skillsFrameworks: parsed.skills_frameworks || CANDIDATE.skills.frameworks,
    role1Bullets: parsed.role1_bullets,
    role2Bullets: parsed.role2_bullets,
    coldEmail: parsed.cold_email || '',
    recruiterMsg: parsed.recruiter_msg || '',
    hiringManagerMsg: parsed.hiring_manager_msg || '',
    keywordMap: map,
  });
}

// ── Build final result object ─────────────────────────────────
function buildResult({ summary, skillsLanguages, skillsFrameworks, role1Bullets, role2Bullets, coldEmail, recruiterMsg, hiringManagerMsg, keywordMap }) {
  return {
    success: true,
    keywordMap,   // expose to UI so it can show done/pending per keyword
    latex: buildLatex({
      summary,
      skillsLanguages,
      skillsFrameworks,
      role1Bullets: role1Bullets.map((b) => toLatex(stripMd(b))),
      role2Bullets: role2Bullets.map((b) => toLatex(stripMd(b))),
    }),
    coldEmail,
    recruiterMsg,
    hiringManagerMsg,
  };
}

// ── LaTeX Helpers ─────────────────────────────────────────────

function toLatex(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
    .replace(/(?<!\\)%/g, '\\%');
}

// Strip markdown bold (**word**) and bullet IDs (e.g. "R1B1 (20w): ") from plain text fields
function stripMd(text) {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // **bold** → plain
    .replace(/\bR[12]B\d+\s*\(\d+w\):\s*/g, ''); // R1B1 (20w): → removed
}

function esc(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '\\&')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/_/g, '\\_');
}

function buildLatex({ summary, skillsLanguages, skillsFrameworks, role1Bullets, role2Bullets }) {
  const r1 = role1Bullets.map((b) => `  \\item ${b}`).join('\n');
  const r2 = role2Bullets.map((b) => `  \\item ${b}`).join('\n');

  return [
    '\\documentclass[11.9pt,a4paper]{article}',
    '\\usepackage[left=15mm, right=15mm, top=14mm, bottom=10mm]{geometry}',
    '\\usepackage{enumitem}',
    '\\usepackage{titlesec}',
    '\\usepackage[hidelinks]{hyperref}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage{sourceserifpro}',
    '\\usepackage{marvosym}',
    '\\usepackage{wasysym}',
    '',
    '\\pagenumbering{gobble}',
    '\\setlength{\\parindent}{0pt}',
    '\\setlength{\\parskip}{0pt}',
    '',
    '\\titlespacing{\\section}{0pt}{10pt}{5pt}',
    '\\titleformat{\\section}{\\bfseries\\normalsize}{}{0em}{}[\\vspace{1pt}\\hrule\\vspace{6pt}]',
    '\\setlist[itemize]{leftmargin=1.5em, noitemsep, topsep=2pt, parsep=0pt, label=\\textbullet}',
    '',
    '\\begin{document}',
    '',
    '% ── Header ──────────────────────────────────────────────',
    '\\begin{center}',
    `  {\\Large \\textbf{${CANDIDATE.name}}}\\\\[7pt]`,
    '  {\\small',
    '    \\Letter\\ ankur39rana@gmail.com \\enspace\\textbar\\enspace',
    '    \\phone\\ +91 7000346850 \\enspace\\textbar\\enspace',
    '    \\href{https://www.linkedin.com/in/ankurnitt21/}{linkedin.com/in/ankurnitt21/} \\enspace\\textbar\\enspace',
    '    \\href{https://github.com/ankurnitt21}{github.com/ankurnitt21}',
    '  }',
    '\\end{center}',
    '',
    '\\vspace{8pt}',
    esc(summary),
    '\\vspace{8pt}',
    '',
    '% ── Skills ──────────────────────────────────────────────',
    '\\section*{SKILLS}',
    '\\noindent',
    `\\textbf{Languages} --- ${esc(stripMd(skillsLanguages))}\\\\[3pt]`,
    `\\textbf{Frameworks \\& Tools} --- ${esc(stripMd(skillsFrameworks))}`,
    '',
    '\\vspace{6pt}',
    '',
    '% ── Experience ──────────────────────────────────────────',
    '\\section*{EXPERIENCE}',
    '',
    '\\noindent',
    '\\textbf{Warehouse Automation Client}, Software Engineer \\hfill 10/2024 -- Present | Fastenal India',
    '\\begin{itemize}',
    r1,
    '\\end{itemize}',
    '',
    '\\vspace{15pt}',
    '',
    '\\noindent',
    '\\textbf{Code Migration Suite}, Software Developer \\hfill 01/2021 -- 09/2024 | Fastenal India',
    '\\begin{itemize}',
    r2,
    '\\end{itemize}',
    '',
    '\\vspace{6pt}',
    '',
    '% ── Projects ────────────────────────────────────────────',
    '\\section*{PROJECTS}',
    '',
    '\\noindent',
    '\\textbf{Smart Tube}, Python, Flask, HTML, CSS \\hfill 02/2020 -- 04/2020',
    '\\begin{itemize}',
    '  \\item Built a Flask-based application that reduced video search time to \\textbf{under 30 seconds} using optimized caption indexing',
    '  \\item Improved content retrieval speed by integrating a custom caption recognition pipeline',
    '  \\item Increased user engagement by \\textbf{15\\%} through deep-linking to relevant video segments',
    '\\end{itemize}',
    '',
    '\\vspace{5pt}',
    '',
    '\\noindent',
    '\\textbf{The Lost}, C++, Unreal Engine 3D \\hfill 10/2019 -- 11/2019',
    '\\begin{itemize}',
    '  \\item Developed a first-person survival game using \\textbf{Unreal Engine and C++} featuring AI-controlled zombie enemies',
    '  \\item Implemented NavMesh-based pathfinding enabling enemies to automatically track the player',
    '  \\item Designed gameplay mechanics including player movement, enemy spawning, and survival objectives',
    '\\end{itemize}',
    '',
    '% ── Education ───────────────────────────────────────────',
    '\\section*{EDUCATION}',
    '',
    '\\noindent',
    '\\textbf{NIT Trichy}, Master of Computer Applications \\hfill 07/2018 -- 06/2021 | Trichy, India',
    '',
    '\\vspace{5pt}',
    '',
    '\\noindent',
    '\\textbf{Jiwaji University}, Bachelor of Computer Applications \\hfill 07/2015 -- 06/2018 | Gwalior, India',
    '',
    '\\end{document}',
  ].join('\n');
}