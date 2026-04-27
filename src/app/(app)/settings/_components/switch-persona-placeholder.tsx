// SPEC-3 Phase 6.d: persona switch placeholder. The full
// download-my-data + destructive reset infra is deferred to a
// follow-up SPEC (see docs/DEFERRED.md). For v1 this card surfaces
// the current persona and tells the user how to reset.

import { Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { UserType } from "@/lib/supabase/types";

const PERSONA_LABEL: Record<"job_seeker" | "gtm", string> = {
  job_seeker: "Job search",
  gtm: "Company ICP",
};

interface SwitchPersonaPlaceholderProps {
  userType: UserType | null;
}

export function SwitchPersonaPlaceholder({
  userType,
}: SwitchPersonaPlaceholderProps) {
  const personaLabel = userType ? PERSONA_LABEL[userType] : "Not set";
  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center gap-2">
        <Users size={16} />
        <h2 className="text-sm font-semibold">Persona</h2>
        <Badge variant="accent">{personaLabel}</Badge>
      </div>
      <Alert>
        <AlertTitle>Switching personas is coming soon</AlertTitle>
        <AlertDescription>
          Contact support if you need to reset now. Full download-my-data +
          destructive reset ships in a follow-up release.
        </AlertDescription>
      </Alert>
    </Card>
  );
}
