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
• Automated CI/CD pipelines using Jenkins, reducing manual deployment effort and improving release reliability

Role 2 — Software Developer, Code Migration Suite | Fastenal India (01/2021 – 09/2024)
• Migrated legacy WMS modules to Java 17 and Spring MVC, improving system response time by 25%
• Designed modular RESTful APIs using Spring MVC, Hibernate, and DAO patterns for better separation of concerns
• Implemented data persistence using Spring Data JPA and Hibernate, optimizing entity mappings and query performance
• Applied Spring AOP for centralized logging, monitoring, and exception handling
• Optimized complex SQL queries, reducing database latency by 18%
• Standardized application logging and monitoring using the ELK Stack
• Integrated Jenkins-based CI/CD pipelines for automated build, testing, and artifact management
• Dockerized applications to enable scalable, container-based deployments`;

const MY_SKILLS = `Languages: Java, C/C++, Python, SQL
Frameworks & Tools: Spring Boot, Spring MVC, Spring Data JPA, Hibernate, Spring AOP, REST APIs, Apache Kafka, MySQL, PostgreSQL, Jenkins (CI/CD), ELK Stack, Github, Docker`;

// ---- Message Router -----------------------------------------
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'calculateMatchScore') {
    handleCalculateMatchScore(request.data)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
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
