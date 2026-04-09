import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runActivationSearch } from "@/lib/pipeline/activation";
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

  try {
    const result = await runActivationSearch(
      svc,
      user.id,
      config as PipelineConfigRow,
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("[activation/search] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Activation search failed",
      },
      { status: 500 },
    );
  }
}
