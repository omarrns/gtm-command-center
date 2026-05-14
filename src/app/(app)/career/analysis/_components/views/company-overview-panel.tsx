import { Card } from "@/components/ui/card";
import type { Obj } from "../result-guards";

export function CompanyOverviewPanel({ result }: { result: Obj }) {
  const whatTheyDo = result.what_they_do as string | undefined;
  const stageAndFunding = result.stage_and_funding as string | undefined;
  const gtmMotion = result.gtm_motion as string | undefined;
  const marketPosition = result.market_position as string | undefined;

  if (!whatTheyDo && !stageAndFunding && !gtmMotion) return null;

  return (
    <Card className="gap-3 p-5">
      <h3 className="text-sm font-semibold">Company Overview</h3>
      <div className="space-y-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        {whatTheyDo && (
          <p>
            <strong>What they do:</strong> {whatTheyDo}
          </p>
        )}
        {stageAndFunding && (
          <p>
            <strong>Stage & Funding:</strong> {stageAndFunding}
          </p>
        )}
        {gtmMotion && (
          <p>
            <strong>GTM Motion:</strong> {gtmMotion}
          </p>
        )}
        {marketPosition && (
          <p>
            <strong>Market Position:</strong> {marketPosition}
          </p>
        )}
      </div>
    </Card>
  );
}
