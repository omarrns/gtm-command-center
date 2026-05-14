"use client";

import { useTransition } from "react";
import { ArrowCounterClockwise, Spinner } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rollbackIcpRevisionAction } from "../actions";

export function RollbackButton({ commitId }: { commitId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await rollbackIcpRevisionAction(commitId);
          if (result.ok) {
            toast.success("ICP revision rolled back");
          } else {
            toast.error(result.error ?? "Rollback failed");
          }
        });
      }}
    >
      {isPending ? (
        <Spinner size={14} className="animate-spin" />
      ) : (
        <ArrowCounterClockwise size={14} />
      )}
      Roll back
    </Button>
  );
}
