import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runActivationSearch } from "@/lib/pipeline/activation";
import {
  ACTIVATION_IN_PROGRESS_STATUS,
  claimActivationRun,
  clearActivationRun,
} from "@/lib/pipeline/activation-lock";
import type { PipelineConfigRow } from "@/lib/supabase/types";

export const maxDuration = 300;

export async function POST() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: config, error } = await svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error || !config) {
    return NextResponse.json(
      { error: "Pipeline not configured" },
      { status: 400 },
    );
  }

  let claimed = false;
  try {
    claimed = await claimActivationRun(svc, user.id);
    if (!claimed) {
      return NextResponse.json(
        {
          status: ACTIVATION_IN_PROGRESS_STATUS,
          error: "Activation is already running",
        },
        { status: 409 },
      );
    }

    const result = await runActivationSearch(
      svc,
      user.id,
      config as PipelineConfigRow,
    );

    return NextResponse.json(result);
  } catch (err) {
    if (claimed) {
      await clearActivationRun(svc, user.id).catch((clearErr) => {
        console.error("[activation/search] Failed to clear lock:", clearErr);
      });
    }
    console.error("[activation/search] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Activation search failed",
      },
      { status: 500 },
    );
  }
}
