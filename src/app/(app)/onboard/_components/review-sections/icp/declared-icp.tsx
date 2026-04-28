"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReviewFormSection } from "@/components/ui/review-form-section";
import { ICP_ENUMS } from "@/lib/onboarding/icp-dimensions";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";
import { DimensionMeta } from "./dimension-meta";
import { EnumSelect } from "./enum-select";

// Section 1 of the ICP review. The product + buyer dimensions are
// grounded in declarative artifacts (company_context, buyer_persona)
// and explicit user statements — the orchestrator can't infer them
// from positive_example pattern-matching. Always shown, even at
// zero positive exemplars.

interface DeclaredIcpProps {
  product: IcpEdits["product"];
  onProductChange: (next: IcpEdits["product"]) => void;
  buyer: IcpEdits["icp"]["buyer"];
  onBuyerChange: (next: IcpEdits["icp"]["buyer"]) => void;
  evidence?: IcpEdits["evidence"];
}

export function DeclaredIcp({
  product,
  onProductChange,
  buyer,
  onBuyerChange,
  evidence,
}: DeclaredIcpProps) {
  return (
    <>
      <ReviewFormSection
        title="Product"
        meta={
          <DimensionMeta
            dimensionKey="product"
            value={product}
            evidence={evidence}
          />
        }
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              Category
            </label>
            <Input
              type="text"
              value={product.category}
              onChange={(e) =>
                onProductChange({ ...product, category: e.target.value })
              }
              className="border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              Core JTBD
            </label>
            <Textarea
              rows={3}
              value={product.core_jtbd}
              onChange={(e) =>
                onProductChange({ ...product, core_jtbd: e.target.value })
              }
              className="border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              Wedge
            </label>
            <Textarea
              rows={3}
              value={product.wedge}
              onChange={(e) =>
                onProductChange({ ...product, wedge: e.target.value })
              }
              className="border-transparent"
            />
          </div>
          <EnumSelect
            label="Delivery model"
            value={product.delivery_model}
            onChange={(delivery_model) =>
              onProductChange({ ...product, delivery_model })
            }
            options={ICP_ENUMS.deliveryModelValues}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection
        title="Buyer Roles"
        meta={
          <DimensionMeta
            dimensionKey="buyer"
            value={buyer}
            evidence={evidence}
          />
        }
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              Economic buyer
            </label>
            <Input
              type="text"
              value={buyer.economic_buyer}
              onChange={(e) =>
                onBuyerChange({ ...buyer, economic_buyer: e.target.value })
              }
              className="border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              Champion
            </label>
            <Input
              type="text"
              value={buyer.champion}
              onChange={(e) =>
                onBuyerChange({ ...buyer, champion: e.target.value })
              }
              className="border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              End user
            </label>
            <Input
              type="text"
              value={buyer.end_user}
              onChange={(e) =>
                onBuyerChange({ ...buyer, end_user: e.target.value })
              }
              className="border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-[var(--color-text-muted)]">
              Deal blocker
            </label>
            <Input
              type="text"
              value={buyer.deal_blocker}
              onChange={(e) =>
                onBuyerChange({ ...buyer, deal_blocker: e.target.value })
              }
              className="border-transparent"
            />
          </div>
        </div>
      </ReviewFormSection>
    </>
  );
}
