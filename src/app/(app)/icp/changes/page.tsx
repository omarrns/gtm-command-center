import { redirect } from "next/navigation";

export default async function IcpChangesPage() {
  redirect("/icp?view=changes");
}
