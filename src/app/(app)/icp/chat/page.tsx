import { redirect } from "next/navigation";

export default function IcpChatRedirectPage() {
  redirect("/gtm/icp?view=chat");
}
