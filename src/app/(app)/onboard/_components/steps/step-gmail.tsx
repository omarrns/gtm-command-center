import { Mail, ExternalLink } from "lucide-react";

interface StepGmailProps {
  gmailConnected: boolean;
  isRefresh: boolean;
}

export function StepGmail({ gmailConnected, isRefresh }: StepGmailProps) {
  const returnTo = `/onboard?step=4${isRefresh ? "&mode=refresh" : ""}`;
  const authHref = `/api/auth/gmail?return_to=${encodeURIComponent(returnTo)}`;

  return (
    <div className="space-y-5">
      <div className="surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail size={16} />
          <h3 className="text-sm font-semibold">Gmail Integration</h3>
        </div>

        {gmailConnected ? (
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-success)]" />
            <span className="text-sm">Gmail connected</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              Connect your Gmail account to send approved outreach emails
              directly from the pipeline. You can also do this later from
              Settings.
            </p>
            <a
              href={authHref}
              className="btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2"
            >
              <ExternalLink size={13} />
              Connect Gmail
            </a>
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--color-text-subtle)]">
        Gmail is optional. The pipeline can discover, score, and draft emails
        without it. You can connect later from Settings.
      </p>
    </div>
  );
}
