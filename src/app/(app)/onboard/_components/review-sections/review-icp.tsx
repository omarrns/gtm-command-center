"use client";

// SPEC-3 Phase 1.e stub. Real ICP review lands in Phase 5 with eight
// synthesis + comparison sections. For now this only needs to exist so
// the ReviewClient dispatch compiles — the icp_definition template isn't
// registered yet, so this branch is unreachable in Phase 1.
export function ReviewIcp() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <p className="text-sm text-[var(--color-text-muted)]">
        ICP review UI lands in Phase 5.
      </p>
    </div>
  );
}
