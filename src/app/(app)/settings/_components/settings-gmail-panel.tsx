"use client";

import { useTransition } from "react";
import { Mail, MailX, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { disconnectGmailAction } from "../actions";

interface SettingsGmailPanelProps {
  gmailConnected: boolean;
  gmailAddress: string | null;
}

export function SettingsGmailPanel({
  gmailConnected,
  gmailAddress,
}: SettingsGmailPanelProps) {
  const [isPending, startTransition] = useTransition();

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectGmailAction();
      if (result.ok) {
        toast.success("Gmail disconnected");
      } else {
        toast.error(result.error ?? "Failed to disconnect");
      }
    });
  }

  return (
    <section className="surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Mail size={16} />
        <h2 className="text-sm font-semibold">Gmail Integration</h2>
      </div>

      {gmailConnected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-success)]" />
            <span className="text-sm">
              Connected as{" "}
              <span className="font-medium">{gmailAddress ?? "unknown"}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isPending}
            className="btn-ghost flex items-center gap-1.5 text-xs text-[var(--color-danger)]"
          >
            <MailX size={13} />
            {isPending ? "Disconnecting..." : "Disconnect Gmail"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Connect your Gmail account to send approved outreach emails directly
            from the pipeline.
          </p>
          <a
            href="/api/auth/gmail"
            className="btn-primary inline-flex items-center gap-1.5 text-sm px-4 py-2"
          >
            <ExternalLink size={13} />
            Connect Gmail
          </a>
        </div>
      )}
    </section>
  );
}
