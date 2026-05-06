import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Searchcraft",
};

export default function PrivacyPage() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Last updated: May 1, 2026
        </p>

        <section className="space-y-3 text-sm leading-relaxed text-[var(--color-text)]">
          <h2 className="text-lg font-semibold">What This App Does</h2>
          <p>
            Searchcraft is a single-user tool that helps manage job-search
            outreach. When you connect your Gmail account, it sends emails on
            your behalf using the Gmail API.
          </p>

          <h2 className="text-lg font-semibold">Data We Access</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Gmail Send (gmail.send)</strong> — Used to send outreach
              emails you have explicitly approved. No emails are sent without
              your manual approval.
            </li>
            <li>
              <strong>Gmail Read-only (gmail.readonly)</strong> — Used to
              check whether recipients have replied to your tracked outreach
              threads and classify reply intent or objection themes. Raw reply
              bodies are not stored.
            </li>
          </ul>

          <h2 className="text-lg font-semibold">Data Storage</h2>
          <p>
            Your Gmail refresh token is encrypted with AES-256-GCM and stored in
            a secured database table with no client-side access. You can
            disconnect Gmail at any time from Settings, which revokes the token
            with Google and deletes it from our database.
          </p>

          <h2 className="text-lg font-semibold">Single-User Tool</h2>
          <p>
            This application is a personal productivity tool, not a multi-tenant
            service. It is not intended for use by the general public.
          </p>

          <h2 className="text-lg font-semibold">Contact</h2>
          {contactEmail ? (
            <p>
              Questions? Email{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="text-[var(--color-blue)] underline"
              >
                {contactEmail}
              </a>
              .
            </p>
          ) : (
            <p>
              Configure <code>NEXT_PUBLIC_CONTACT_EMAIL</code> to show an
              operator contact address here.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
