// ============================================================
// Resume Optimizer – Background Service Worker
// Handles OpenAI API calls for job match score calculation.
// ============================================================

// ---- Original resume content (used for match score calculation) ----

const MY_WORK_EXPERIENCE = `Role 1 — Software Engineer, Warehouse Automation Client | Fastenal India (10/2024 – Present)
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
• Implemented Spring AOP to unify application-wide logging, monitoring, and exception handling, enhancing maintainability and improving consistency across microservices and backend modules.
• Integrated Jenkins-based CI/CD pipelines for automated build, testing, and artifact management
• Optimized complex SQL queries and improved execution paths, reducing overall database latency
• Standardized application logging and monitoring using the ELK Stack
• Dockerized applications to enable scalable, container-based deployments`;

const MY_SKILLS = `Languages: Java, C/C++, Python, SQL
Frameworks & Tools: Spring Boot, Spring MVC, Spring Data JPA, Hibernate, Spring AOP, REST APIs, Apache Kafka, MySQL, PostgreSQL, Jenkins (CI/CD), ELK Stack, Github, Docker`;

// ---- Message Router -----------------------------------------
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'calculateMatchScore') {
    handleCalculateMatchScore(request.data)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (request.action === 'optimizeResume') {
    handleOptimizeResume(request.data)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ---- Match Score Handler -------------------------------------
async function handleCalculateMatchScore({ jobDescription, model, apiKey }) {
  if (!apiKey) throw new Error('OpenAI API key is not set.');
  if (!jobDescription) throw new Error('No job description provided.');

  const systemPrompt = `You are a resume matching expert. Analyze a job description against a candidate's work experience and skills, then provide a detailed match score justification from 0-100%.

Consider:
1. Technical skills match (languages, frameworks, tools, cloud services)
2. Experience relevance (domain, responsibilities, achievements)
3. Overall fit for the role

Return ONLY valid JSON with:
- "score": number (0-100)
- "summary": string (1-2 sentences overall summary)
- "matches": array of strings (what matches - skills, experience, etc.)
- "gaps": array of strings (what's missing or doesn't match - required skills not present, experience gaps, etc.)
- "justification": string (explain why this specific score is justified based on matches and gaps)`;

  const userPrompt = `JOB DESCRIPTION:
${jobDescription}

CANDIDATE'S WORK EXPERIENCE:
${MY_WORK_EXPERIENCE}

CANDIDATE'S SKILLS:
${MY_SKILLS}

Calculate the job match score (0-100%) and provide a detailed breakdown:
1. List all matching skills, technologies, and relevant experience
2. List all gaps - missing required skills, technologies, or experience areas
3. Explain why the score is justified based on the matches and gaps
4. Candidate have only 5 years of experience so make sure to give the score based on the experience also`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `API returned status ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI API.');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`Failed to parse AI response: ${e.message}`);
  }

  const score = parsed.score;
  if (typeof score !== 'number' || score < 0 || score > 100) {
    throw new Error('Invalid score returned from AI (must be 0-100)');
  }

  return {
    success: true,
    score: Math.round(score),
    summary: parsed.summary || 'Match score calculated based on skills and experience alignment.',
    matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    justification: parsed.justification || ''
  };
}

// ---- Resume Optimization Handler ----------------------------
async function handleOptimizeResume({ jobDescription, model, apiKey }) {
  if (!apiKey) throw new Error('OpenAI API key is not set.');
  if (!jobDescription) throw new Error('No job description provided.');

  const systemPrompt = `You are an expert resume writer. Rewrite the candidate's resume to be a 100% match with the given job description.

RULES:
1. Keep company names, role titles, dates unchanged: "Warehouse Automation Client, Software Engineer | 10/2024 – Present | Fastenal India" and "Code Migration Suite, Software Developer | 01/2021 – 09/2024 | Fastenal India"
2. Keep the warehouse automation context for Role 1 and code migration context for Role 2
3. Role 1 must have EXACTLY 7 bullet points. Role 2 must have EXACTLY 8 bullet points
4. Each bullet must have the EXACT word count specified (treat hyphenated words and acronyms as single words)
5. In bullets ONLY: wrap technical terms, tools, languages, frameworks in **double asterisks**
6. Use plain % for percentages. Start each bullet with a strong action verb
7. Include technologies and skills from the job description naturally in the bullets

WORD COUNTS PER BULLET:
Role 1 (7 bullets): 20, 17, 16, 15, 16, 9, 15
Role 2 (8 bullets): 16, 16, 15, 21, 11, 12, 9, 7

ORIGINAL BULLETS FOR STRUCTURE REFERENCE:
Role 1:
1. (20w) Designed event-driven microservices using Java, Spring Boot, and Apache Kafka, processing 50K+ daily order events and improving scalability by 40%
2. (17w) Built asynchronous workflows for inventory validation, health monitoring, and audit logging, reducing order fulfillment latency by 30%
3. (16w) Integrated backend services with warehouse automation systems (ASRS, conveyors, packing units), reducing retrieval failures by 25%
4. (15w) Implemented retry, dead-letter queues (DLQ), and timeout recovery strategies for Kafka consumers, improving system resilience
5. (16w) Designed REST APIs and internal event processors for real-time exception handling, reducing operational delays by 15%
6. (9w) Containerized microservices using Docker, enabling consistent and environment-independent deployments
7. (15w) Automated CI/CD pipelines using Jenkins, reducing manual deployment effort and improving release reliability on servers

Role 2:
1. (16w) Migrated legacy WMS modules to Java 17 and Spring MVC, improving system response time by 25%
2. (16w) Designed modular RESTful APIs using Spring MVC, Hibernate, and DAO patterns for better separation of concerns
3. (15w) Implemented data persistence using Spring Data JPA and Hibernate, optimizing entity mappings and query performance
4. (21w) Implemented Spring AOP to unify application-wide logging, monitoring, and exception handling, enhancing maintainability and improving consistency across microservices and backend modules.
5. (11w) Integrated Jenkins-based CI/CD pipelines for automated build, testing, and artifact management
6. (12w) Optimized complex SQL queries and improved execution paths, reducing overall database latency
7. (9w) Standardized application logging and monitoring using the ELK Stack
8. (7w) Dockerized applications to enable scalable, container-based deployments

Return ONLY valid JSON:
{
  "summary": "professional summary (~30 words, start with 'Software Engineer with 4+ years of experience', NO bold markers, plain text only)",
  "skills_languages": "comma-separated languages relevant to job (NO bold, plain text)",
  "skills_frameworks": "comma-separated frameworks/tools relevant to job (NO bold, plain text)",
  "role1_bullets": ["exactly 7 strings with **bold** tech terms, matching word counts: 20,17,16,15,16,9,15"],
  "role2_bullets": ["exactly 8 strings with **bold** tech terms, matching word counts: 16,16,15,21,11,12,9,7"]
}`;

  const userPrompt = `JOB DESCRIPTION:\n${jobDescription}\n\nRewrite ALL resume sections to perfectly match this job. Follow ALL constraints exactly.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2500,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `API returned status ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI API.');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`Failed to parse AI response: ${e.message}`);
  }

  if (!Array.isArray(parsed.role1_bullets) || parsed.role1_bullets.length !== 7) {
    throw new Error('AI must return exactly 7 bullets for Role 1.');
  }
  if (!Array.isArray(parsed.role2_bullets) || parsed.role2_bullets.length !== 8) {
    throw new Error('AI must return exactly 8 bullets for Role 2.');
  }

  const latex = buildResumeLatex({
    summary: parsed.summary || 'Software Engineer with 4+ years of experience building scalable backend systems.',
    skillsLanguages: parsed.skills_languages || 'Java, Python, SQL',
    skillsFrameworks: parsed.skills_frameworks || 'Spring Boot, Docker',
    role1Bullets: parsed.role1_bullets.map(formatBulletForLatex),
    role2Bullets: parsed.role2_bullets.map(formatBulletForLatex)
  });

  return { success: true, latex };
}

// ---- LaTeX Helpers ------------------------------------------
function formatBulletForLatex(text) {
  let result = text.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}');
  result = result.replace(/\\%/g, '%');
  result = result.replace(/%/g, '\\%');
  return result;
}

function buildResumeLatex({ summary, skillsLanguages, skillsFrameworks, role1Bullets, role2Bullets }) {
  const r1 = role1Bullets.map((b) => '  \\item ' + b).join('\n');
  const r2 = role2Bullets.map((b) => '  \\item ' + b).join('\n');

  return [
    '\\documentclass[11.9pt,a4paper]{article}',
    '\\usepackage[left=15mm, right=15mm, top=18mm, bottom=10mm]{geometry}',
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
    '\\titleformat{\\section}',
    '  {\\bfseries\\normalsize}',
    '  {}{0em}{}',
    '  [\\vspace{1pt}\\hrule\\vspace{6pt}]',
    '',
    '\\setlist[itemize]{leftmargin=1.5em, noitemsep, topsep=2pt, parsep=0pt, label=\\textbullet}',
    '',
    '\\begin{document}',
    '',
    '% ── Header ──────────────────────────────────────────────────────────────────',
    '\\begin{center}',
    '  {\\Large \\textbf{Ankur Rana}}\\\\[7pt]',
    '  {\\small',
    '    \\Letter\\ ankur39rana@gmail.com \\enspace\\textbar\\enspace',
    '    \\phone\\ +91 7000346850 \\enspace\\textbar\\enspace',
    '    \\href{https://www.linkedin.com/in/ankurnitt21/}{linkedin.com/in/ankurnitt21/} \\enspace\\textbar\\enspace',
    '    \\href{https://github.com/ankurnitt21}{github.com/ankurnitt21}',
    '  }',
    '\\end{center}',
    '',
    '\\vspace{8pt}',
    '',
    summary,
    '',
    '',
    '\\vspace{8pt}',
    '% ── Skills ──────────────────────────────────────────────────────────────────',
    '\\section*{SKILLS}',
    '',
    '\\noindent',
    '\\textbf{Languages} --- ' + skillsLanguages + '\\\\[3pt]',
    '\\textbf{Frameworks \\& Tools} --- ' + skillsFrameworks,
    '',
    '\\vspace{6pt}',
    '',
    '% ── Experience ──────────────────────────────────────────────────────────────',
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
    '% ── Projects ────────────────────────────────────────────────────────────────',
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
    '% ── Education ───────────────────────────────────────────────────────────────',
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
    '\\vspace{6pt}',
    '',
    '',
    '\\end{document}'
  ].join('\n');
}
