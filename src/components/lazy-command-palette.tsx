"use client";

import dynamic from "next/dynamic";
import type { UserType } from "@/lib/supabase/types";

const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((m) => m.CommandPalette),
  { ssr: false },
);

interface LazyCommandPaletteProps {
  userType: UserType | null;
}

export function LazyCommandPalette({ userType }: LazyCommandPaletteProps) {
  return <CommandPalette userType={userType} />;
}
