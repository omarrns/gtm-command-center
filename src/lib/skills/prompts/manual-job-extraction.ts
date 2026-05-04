export function buildManualJobExtractionPrompt(markdown: string): {
  system: string;
  prompt: string;
} {
  return {
    system:
      "Extract the hiring company name and exact job title from the job posting. Return JSON with keys company_name and role_title only.",
    prompt: markdown.slice(0, 8000),
  };
}
