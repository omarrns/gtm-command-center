import { redirect } from "next/navigation";

export default async function IcpChangesPage() {
  redirect("/gtm/icp?view=changes");
}
