export type MarkdownSection = {
  title: string;
  body: string;
};

export function ReadableSection({ section }: { section: MarkdownSection }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">
        {section.title}
      </h3>
      <MarkdownBody content={section.body} />
    </section>
  );
}

function MarkdownBody({ content }: { content: string }) {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3 text-sm leading-6 text-[var(--color-text)]">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim());
        const bullets = lines
          .filter((line) => /^[-*]\s+/.test(line))
          .map((line) => line.replace(/^[-*]\s+/, "").trim())
          .filter(Boolean);

        if (bullets.length === lines.length) {
          return (
            <ul
              key={`${block}-${index}`}
              className="list-disc space-y-1 pl-5 text-[var(--color-text)]"
            >
              {bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`${block}-${index}`} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}
