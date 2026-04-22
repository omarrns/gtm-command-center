"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "../../section-header";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";

// Section 1 of the ICP review. The product + buyer dimensions are
// grounded in declarative artifacts (company_context, buyer_persona)
// and explicit user statements — the orchestrator can't infer them
// from positive_example pattern-matching. Always shown, even at
// zero positive exemplars.

interface DeclaredIcpProps {
  isExpanded: boolean;
  onToggle: () => void;
  product: IcpEdits["product"];
  onProductChange: (next: IcpEdits["product"]) => void;
  buyer: IcpEdits["icp"]["buyer"];
  onBuyerChange: (next: IcpEdits["icp"]["buyer"]) => void;
}

export function DeclaredIcp({
  isExpanded,
  onToggle,
  product,
  onProductChange,
  buyer,
  onBuyerChange,
}: DeclaredIcpProps) {
  return (
    <div className="surface p-5 mb-4">
      <SectionHeader
        title="Declared ICP"
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="space-y-5 mt-2">
          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
              Product
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <Input
                type="text"
                value={product.category}
                onChange={(e) =>
                  onProductChange({ ...product, category: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Core JTBD</label>
              <Textarea
                rows={2}
                value={product.core_jtbd}
                onChange={(e) =>
                  onProductChange({ ...product, core_jtbd: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Wedge</label>
              <Textarea
                rows={2}
                value={product.wedge}
                onChange={(e) =>
                  onProductChange({ ...product, wedge: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
              Buyer roles
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Economic buyer</label>
              <Input
                type="text"
                value={buyer.economic_buyer}
                onChange={(e) =>
                  onBuyerChange({ ...buyer, economic_buyer: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Champion</label>
              <Input
                type="text"
                value={buyer.champion}
                onChange={(e) =>
                  onBuyerChange({ ...buyer, champion: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">End user</label>
              <Input
                type="text"
                value={buyer.end_user}
                onChange={(e) =>
                  onBuyerChange({ ...buyer, end_user: e.target.value })
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
