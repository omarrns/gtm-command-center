import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb
    .from("ai_calls")
    .select("created_at, model, latency_ms, input_tokens, output_tokens, total_tokens")
    .eq("call_purpose", "orchestrator.analyze")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) { console.error(error); process.exit(1); }
  for (const r of data ?? []) {
    console.log(`${r.created_at}  model=${r.model}  latency=${r.latency_ms}ms  in=${r.input_tokens}  out=${r.output_tokens}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
