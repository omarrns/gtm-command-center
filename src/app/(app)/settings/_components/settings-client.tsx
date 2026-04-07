"use client";

import { useTransition } from "react";
import { Mail, MailX, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { disconnectGmailAction } from "../actions";

interface SettingsClientProps {
  gmailConnected: boolean;
  gmailAddress: string | null;
  gmailError?: string;
  scoreThreshold: number;
  dailySendCap: number;
}

export function SettingsClient({
  gmailConnected,
  gmailAddress,
  gmailError,
  scoreThreshold,
  dailySendCap,
}: SettingsClientProps) {
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
    <div className="space-y-6">
      {/* Gmail error banner */}
      {gmailError && (
        <div className="rounded-lg border border-[var(--color-danger)] bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-[var(--color-danger)]">
          Gmail connection failed: {gmailError.replace(/_/g, " ")}
        </div>
      )}

      {/* Gmail Integration */}
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
              Connect your Gmail account to send approved outreach emails
              directly from the pipeline.
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

      {/* Pipeline Config (read-only for now) */}
      <section className="surface p-5 space-y-4">
        <h2 className="text-sm font-semibold">Pipeline Configuration</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[var(--color-text-subtle)] text-xs mb-1">
              Score Threshold
            </div>
            <div className="font-medium">{scoreThreshold}/100</div>
          </div>
          <div>
            <div className="text-[var(--color-text-subtle)] text-xs mb-1">
              Daily Send Cap
            </div>
            <div className="font-medium">{dailySendCap} emails/day</div>
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-subtle)]">
          Configuration editing coming in Phase 6.
        </p>
      </section>
    </div>
  );
}
