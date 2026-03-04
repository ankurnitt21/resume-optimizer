// ============================================================
// Resume Optimizer – Background Service Worker
// Handles OpenAI API calls and LaTeX generation.
// ============================================================

// ---- Message Router -----------------------------------------
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'reframeResume') {
    handleReframe(request.data)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }
});

// ---- Reframe Handler ----------------------------------------
async function handleReframe({ resume, jobDescription, model, apiKey, pageLimit }) {
  // Validate inputs
  if (!apiKey) throw new Error('OpenAI API key is not set.');
  if (!jobDescription) throw new Error('No job description provided.');
  if (!resume || !resume.name) throw new Error('No resume data found.');

  // Build the prompt
  const systemPrompt = buildSystemPrompt(pageLimit);
  const userPrompt = buildUserPrompt(resume, jobDescription);

  // Call OpenAI API
  const reframed = await callOpenAI(apiKey, model, systemPrompt, userPrompt);

  // Generate LaTeX source
  const latex = generateLatex(resume, reframed);

  return { success: true, reframed, latex };
}

// ---- System Prompt ------------------------------------------
function buildSystemPrompt(pageLimit) {
  return `You are an expert resume writer and career coach. Your task is to reframe a candidate's resume to align with a specific job description.

CRITICAL RULES:
1. ONLY reframe language, emphasis, and phrasing. NEVER fabricate experience, skills, or accomplishments the candidate does not have.
2. Use the job description's keywords, terminology, and language naturally in the reframed content.
3. Emphasize achievements and experiences most relevant to the target role.
4. Maintain a professional, concise tone throughout.
5. The resume MUST fit on ${pageLimit} page(s). Keep bullet points concise (1-2 lines each). Use 3-5 bullets per position maximum.
6. For skills, prioritize and reorder to highlight the most relevant competencies first. Only include skills the candidate actually listed.

RESPONSE FORMAT:
You MUST respond with valid JSON only. No markdown, no code blocks, no explanation. Just the raw JSON object:

{
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "dates": "Start – End",
      "bullets": [
        "Achievement-oriented bullet point using job description keywords",
        "Another reframed bullet point"
      ]
    }
  ],
  "skills": ["Skill1", "Skill2", "Skill3"]
}`;
}

// ---- User Prompt --------------------------------------------
function buildUserPrompt(resume, jobDescription) {
  const expText = (resume.experience || [])
    .map((exp) => {
      const bullets = (exp.bullets || []).map((b) => `  - ${b}`).join('\n');
      return `**${exp.title}** at ${exp.company} (${exp.dates})\n${bullets}`;
    })
    .join('\n\n');

  const skillsText = (resume.skills || []).join(', ');

  return `=== CANDIDATE'S CURRENT RESUME ===

Name: ${resume.name}
Summary: ${resume.summary || 'N/A'}

Work Experience:
${expText || 'None provided'}

Skills: ${skillsText || 'None provided'}

=== TARGET JOB DESCRIPTION ===

${jobDescription}

=== INSTRUCTIONS ===

Reframe the candidate's work experience bullet points and reorder their skills to best match the target job description. Remember: do not invent any new experience or skills—only reframe what exists. Respond with the JSON object only.`;
}

// ---- OpenAI API Call ----------------------------------------
async function callOpenAI(apiKey, model, systemPrompt, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 3000,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData?.error?.message || `API returned status ${response.status}`;
    throw new Error(errMsg);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Empty response from OpenAI API.');
  }

  try {
    const parsed = JSON.parse(content);
    // Validate structure
    if (!parsed.experience || !Array.isArray(parsed.experience)) {
      throw new Error('Response missing experience array');
    }
    if (!parsed.skills || !Array.isArray(parsed.skills)) {
      throw new Error('Response missing skills array');
    }
    return parsed;
  } catch (parseErr) {
    throw new Error(`Failed to parse AI response: ${parseErr.message}`);
  }
}

// ---- LaTeX Generation ---------------------------------------
function generateLatex(baseResume, reframed) {
  const escLatex = (s) => {
    if (!s) return '';
    return s.replace(/\\/g, '\\textbackslash{}').replace(/[&%$#_{}~^]/g, (m) => '\\' + m);
  };

  const name = escLatex(baseResume.name);
  const email = escLatex(baseResume.email);
  const phone = escLatex(baseResume.phone);
  const location = escLatex(baseResume.location);
  const linkedin = escLatex(baseResume.linkedin);
  const summary = escLatex(baseResume.summary);

  // Experience section
  const expEntries = (reframed.experience || [])
    .map((exp) => {
      const bullets = (exp.bullets || []).map((b) => `    \\item ${escLatex(b)}`).join('\n');
      return `  \\experienceentry
    {${escLatex(exp.title)}}
    {${escLatex(exp.company)}}
    {${escLatex(exp.dates)}}
    {
  \\begin{itemize}[leftmargin=*, nosep, topsep=0pt]
${bullets}
  \\end{itemize}
    }`;
    })
    .join('\n\n');

  // Skills
  const skills = (reframed.skills || []).map(escLatex).join(' \\textbullet{} ');

  // Education
  const eduEntries = (baseResume.education || [])
    .map((edu) => {
      return `  \\educationentry{${escLatex(edu.degree)}}{${escLatex(edu.school)}}{${escLatex(edu.dates)}}`;
    })
    .join('\n');

  return `%% Resume Optimizer – Auto-generated LaTeX Resume
%% Compile with: pdflatex resume.tex

\\documentclass[10pt, letterpaper]{article}

\\usepackage[margin=0.5in]{geometry}
\\usepackage{enumitem}
\\usepackage{titlesec}
\\usepackage{hyperref}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{parskip}

% Remove page numbers
\\pagestyle{empty}

% Section formatting
\\titleformat{\\section}{\\vspace{-6pt}\\scshape\\large\\bfseries\\color{blue!60!black}}{}{0em}{}[\\titlerule\\vspace{-4pt}]

% Custom commands
\\newcommand{\\experienceentry}[4]{
  \\textbf{#1} \\hfill #3 \\\\
  \\textit{#2} \\\\[-4pt]
  #4
  \\vspace{2pt}
}

\\newcommand{\\educationentry}[3]{
  \\textbf{#1} \\hfill #3 \\\\
  \\textit{#2}
  \\vspace{2pt}
}

\\begin{document}

% ---- Header ----
\\begin{center}
  {\\LARGE\\bfseries ${name}} \\\\[4pt]
  ${email}${phone ? ' \\textbar{} ' + phone : ''}${location ? ' \\textbar{} ' + location : ''}${linkedin ? ' \\textbar{} \\href{' + linkedin + '}{LinkedIn}' : ''}
\\end{center}

${
  summary
    ? `% ---- Summary ----
\\section{Professional Summary}
${summary}
`
    : ''
}
% ---- Experience ----
\\section{Professional Experience}
${expEntries}

% ---- Skills ----
\\section{Skills}
${skills}

${
  (baseResume.education || []).length > 0
    ? `% ---- Education ----
\\section{Education}
${eduEntries}`
    : ''
}

\\end{document}
`;
}
