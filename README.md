# Resume Optimizer – Browser Extension

A Chrome/Edge browser extension that extracts job descriptions from web pages and uses GPT-4o Mini to intelligently reframe your resume to match each opportunity. Generates a downloadable single-page PDF in seconds.

---

## Features

- **One-click job description extraction** from LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, and any job posting page
- **AI-powered resume reframing** using GPT-4o Mini (or GPT-4o)
- **Single-page PDF generation** directly in the browser (no server required)
- **LaTeX source export** for users who prefer to compile with `pdflatex`
- **Resume storage** in browser local storage with JSON import/export
- **Rate limiting** (10 API calls/hour) to control costs
- **Secure API key storage** – your key never leaves your browser except to call OpenAI

---

## Installation

### Prerequisites

- **Google Chrome**, **Microsoft Edge**, or **Brave** browser
- An **OpenAI API key** with access to the `gpt-4o-mini` model  
  Get one at: https://platform.openai.com/api-keys

### Load the Extension

1. **Clone or download** this repository to your local machine.

2. Open your browser and navigate to the extensions page:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **"Load unpacked"** and select the `create_web_extension` folder (the folder containing `manifest.json`).

5. The **Resume Optimizer** icon will appear in your browser toolbar. Pin it for easy access.

---

## Setup

1. **Click the extension icon** in the toolbar to open the popup.

2. Go to the **Settings** tab:
   - Paste your OpenAI API key.
   - Choose your preferred model (GPT-4o Mini recommended for speed and cost).
   - Click **Save Settings**.

3. Go to the **My Resume** tab:
   - Fill in your personal information, work experience, education, and skills.
   - Click **Save Resume**.
   - Alternatively, click **Import JSON** to load a previously exported resume.

---

## Usage

1. **Navigate to a job posting** (LinkedIn, Indeed, Glassdoor, or any job board).

2. **Click the Resume Optimizer icon** in the toolbar.

3. In the **Optimize** tab:

   | Step | Action |
   |------|--------|
   | **1. Extract** | Click "Extract from Page" to pull the job description from the current page. You can also select text on the page before clicking—selected text takes priority. |
   | **2. Reframe** | Click "Optimize Resume" to send your resume and the job description to GPT-4o Mini. The AI will reframe your experience bullets and reorder skills to match the job. |
   | **3. Download** | Click "Download PDF" to save your tailored resume. You can also click "View LaTeX Source" to copy the LaTeX code. |

---

## File Structure

```
create_web_extension/
├── manifest.json          # Manifest V3 extension configuration
├── background.js          # Service worker: API calls & LaTeX generation
├── content.js             # Content script: job description extraction
├── popup.html             # Popup UI markup
├── popup.css              # Popup UI styles
├── popup.js               # Popup UI logic & PDF generation
├── resume-template.tex    # LaTeX template with placeholders
├── libs/
│   └── jspdf.umd.min.js  # jsPDF library for client-side PDF generation
├── icons/
│   ├── icon16.png         # 16×16 toolbar icon
│   ├── icon48.png         # 48×48 extension page icon
│   └── icon128.png        # 128×128 Chrome Web Store icon
└── README.md              # This file
```

---

## How It Works

### Job Description Extraction (`content.js`)

The content script uses a multi-strategy approach:

1. **User selection** – If text is selected on the page, that is used first.
2. **Known selectors** – Tries CSS selectors for LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, Workday, ZipRecruiter, Monster, and other major job boards.
3. **Heuristic extraction** – Scores page content blocks by job-related keyword density and picks the most likely job description.

### Resume Reframing (`background.js`)

The background service worker:

1. Receives the resume data and job description from the popup.
2. Constructs a carefully engineered system + user prompt for GPT-4o Mini.
3. Calls the OpenAI Chat Completions API with `response_format: { type: "json_object" }` for reliable structured output.
4. Validates the parsed response and returns reframed experience bullets and skills.
5. Generates a complete LaTeX source document from the reframed data.

**Key AI guardrails:**
- The prompt explicitly instructs the model to **never fabricate experience**.
- Only language, emphasis, and phrasing are reframed—accomplishments stay authentic.
- Content is constrained to fit a single page (3–5 bullets per role, concise language).

### PDF Generation (`popup.js`)

The popup uses **jsPDF** to render the reframed resume as a professional PDF:

- Letter-size (8.5″ × 11″) with 0.5″ margins.
- Clean typography with section headers, bullet points, and contact information.
- Single-page enforcement: content that would overflow is truncated.

---

## Resume JSON Format

You can import/export your resume as JSON. Here is the schema:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1 (555) 123-4567",
  "location": "San Francisco, CA",
  "linkedin": "https://linkedin.com/in/janedoe",
  "summary": "Senior software engineer with 7+ years of experience...",
  "experience": [
    {
      "title": "Senior Software Engineer",
      "company": "Acme Corp",
      "dates": "Jan 2021 – Present",
      "bullets": [
        "Led migration of monolithic architecture to microservices, reducing deploy time by 60%",
        "Mentored team of 5 junior engineers, improving code review turnaround by 40%"
      ]
    }
  ],
  "education": [
    {
      "degree": "B.S. Computer Science",
      "school": "Stanford University",
      "dates": "2013 – 2017"
    }
  ],
  "skills": ["Python", "JavaScript", "React", "AWS", "Docker", "PostgreSQL"]
}
```

---

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| **Model** | `gpt-4o-mini` | OpenAI model to use. GPT-4o Mini is fast and affordable. GPT-4o produces higher-quality output. |
| **Page Limit** | 1 | Maximum pages for the generated PDF. |
| **Rate Limit** | 10/hour | Maximum API calls per hour (hardcoded for cost protection). |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Could not extract job description" | Make sure you're on a job posting page. Try selecting the job description text manually before clicking Extract. |
| "API key is not set" | Go to Settings tab and enter your OpenAI API key. |
| "Rate limit reached" | Wait up to 1 hour. The limit resets on a rolling basis. |
| API errors (401, 429) | Verify your API key is valid and has billing enabled. For 429 errors, you've hit OpenAI's rate limit—wait and retry. |
| PDF looks empty | Ensure your resume has at least a name and one work experience entry. |
| Extension not loading | Check `chrome://extensions/` for error messages. Make sure all files are present. |

---

## Security & Privacy

- Your **OpenAI API key** is stored in browser local storage and only sent to `https://api.openai.com`.
- Your **resume data** is stored locally—it never leaves your browser except when sent to OpenAI for reframing.
- The extension **only reads text content** from the current page (no form data, cookies, or credentials).
- All API communication uses **HTTPS**.
- The extension requests the minimal set of permissions: `activeTab`, `storage`, and `scripting`.

---

## Using the LaTeX Template

If you prefer to compile the resume yourself:

1. Click **"View LaTeX Source"** after reframing.
2. Click **"Copy to Clipboard"**.
3. Paste into [Overleaf](https://www.overleaf.com/) or compile locally with `pdflatex`.

The template uses standard LaTeX packages (`geometry`, `enumitem`, `titlesec`, `hyperref`) and should compile out of the box.

---

## License

MIT License. Use freely for personal and commercial purposes.
