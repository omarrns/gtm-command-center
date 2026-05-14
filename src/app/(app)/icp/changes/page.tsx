import { redirect } from "next/navigation";

export default function IcpChangesRedirectPage() {
  redirect("/gtm/icp?view=changes");
}
