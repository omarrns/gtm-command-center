"use client";

import { useTransition } from "react";
import {
  Envelope,
  LinkBreak,
  ArrowSquareOut,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <Card className="gap-4 p-5">
      <div className="flex items-center gap-2">
        <Envelope size={16} />
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
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleDisconnect}
            disabled={isPending}
            className="text-[var(--color-danger)]"
          >
            <LinkBreak size={13} />
            {isPending ? "Disconnecting..." : "Disconnect Gmail"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Connect your Gmail account to send approved outreach emails directly
            from the pipeline.
          </p>
          <a href="/api/auth/gmail" className={buttonVariants()}>
            <ArrowSquareOut size={13} />
            Connect Gmail
          </a>
        </div>
      )}
    </Card>
  );
}
