"use client";

import { useState, useTransition } from "react";
import {
  Spinner as Loader2,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { manualInjectOpportunityAction } from "../../actions";

interface ManualAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScored: () => void;
}

export function ManualAddDialog({
  open,
  onOpenChange,
  onScored,
}: ManualAddDialogProps) {
  const [jobUrl, setJobUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const result = await manualInjectOpportunityAction(jobUrl);
      if (result.ok) {
        toast.success(
          `Scored ${result.score}/100 — ${result.stage === "scored" ? "passed threshold" : "filtered out"}`,
          { description: `${result.companyName} · ${result.roleTitle}` },
        );
        setJobUrl("");
        onOpenChange(false);
        onScored();
      } else {
        toast.error(result.error ?? "Failed to score job");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Job to Pipeline</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            className="text-sm"
            type="url"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            placeholder="https://..."
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !jobUrl.trim()}>
            {isPending && <Loader2 size={14} className="animate-spin" />}
            {isPending ? "Scoring…" : "Score & Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
