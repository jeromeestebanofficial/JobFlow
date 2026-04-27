# Resume Tailoring Rules

## 1. Absolute Integrity Constraints (never violate these)

- **Never invent or add anything.** Every word in the output must trace back to something in the original resume. No new companies, roles, projects, tools, or achievements.
- **Never add a skill, technology, programming language, framework, or tool not explicitly listed in the original resume's skills array.** If the job description mentions Python but the resume does not, do not add Python. Period.
- **Never remove a skill from the original skills array.** Only reorder — move JD-relevant skills toward the front.
- **Preserve all factual anchors exactly:** full name, email, phone, location, LinkedIn, GitHub, portfolio, every company name, every job title, every date range, every school, every degree, every GPA.
- **Never fabricate metrics.** Do not invent percentages, dollar amounts, team sizes, or timeframes not present in the original. If a bullet already contains a number, keep it. If it does not, do not add one.
- **Never merge, split, or reorder experience entries.** All jobs must appear in the original order. Do not drop any job.
- **Treat the original resume as the single source of truth.** Tailoring = transformation of language, not addition of content.

## 2. Tailoring Strategy

- Read the job description carefully and identify the top 8–12 keywords, required skills, and outcomes the employer cares about most.
- Rewrite bullet points to surface those keywords naturally — by rephrasing existing achievements using JD vocabulary, not by adding new claims.
- Prioritize bullets in each role by how relevant they are to the JD (most relevant first), but never delete a bullet.
- Rewrite the summary as a direct pitch for the specific role: open with the candidate's title/years of experience, name 2–3 relevant strengths from the resume, and close with what value they bring to this specific role.
- Match the seniority tone of the JD. If it's a senior/lead role, emphasize ownership, impact, and scope. If it's mid-level, emphasize execution and collaboration.

## 3. Bullet Point Quality Standards

Every bullet point must follow this quality ladder (apply the highest level possible given available information):

1. **Action + Outcome** — "Reduced API latency by 40% by refactoring caching layer" (best)
2. **Action + Scale** — "Maintained CI/CD pipeline for 12 microservices" (good)
3. **Action + Context** — "Built RESTful APIs for the company's core booking platform" (acceptable)
4. **Action only** — "Wrote unit tests for the payment module" (minimum)

Rules for bullets:
- Start every bullet with a strong past-tense action verb (Led, Built, Designed, Reduced, Delivered, Automated, Integrated, Migrated, Optimized, Launched…).
- Never start with "Responsible for", "Helped with", "Assisted in", or "Worked on".
- Keep bullets to one tight sentence (under 20 words preferred). No full paragraphs.
- If an original bullet already has a metric, keep it and make the verb stronger.
- If an original bullet is vague but implies an outcome, sharpen the language to make the implied outcome explicit — without inventing a number.

## 4. Skills Section Rules

- Output the skills array using ONLY items from the original resume's skills list. No additions.
- Reorder so that skills mentioned in the job description appear first.
- Group by category only if the original resume already uses categories; do not restructure a flat list into categories.

## 5. Summary Rules

- 2–4 sentences maximum.
- Sentence 1: Who the candidate is (title + years of experience if stated).
- Sentence 2: Core strengths most relevant to this role (drawn from actual resume content).
- Sentence 3 (optional): Specific value or differentiator for this company/role.
- Never use hollow filler phrases: "results-driven", "passionate about", "dynamic", "synergy", "go-getter", "team player", "detail-oriented" (unless quoting the original).
- Do not mention skills or tools not in the resume.

## 6. Output Quality Check (run mentally before outputting)

Before returning the JSON, verify:
- [ ] Every skill in the output skills array exists in the original skills array.
- [ ] No new company, job title, or date was introduced.
- [ ] No metric was invented.
- [ ] Every bullet starts with a strong action verb.
- [ ] The summary does not mention any technology absent from the original resume.
- [ ] All original jobs, projects, and education entries are present and intact.
