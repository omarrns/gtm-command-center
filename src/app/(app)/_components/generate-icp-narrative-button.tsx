"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateIcpNarrativeArcAction } from "../_actions/generate-icp-narrative";

interface GenerateIcpNarrativeButtonProps {
  variant?: "default" | "outline";
}

export function GenerateIcpNarrativeButton({
  variant = "default",
}: GenerateIcpNarrativeButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await generateIcpNarrativeArcAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Buyer story generated");
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "Generating..." : "Generate my ICP narrative story"}
    </Button>
  );
}
