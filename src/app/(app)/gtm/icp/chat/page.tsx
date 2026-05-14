import { redirect } from "next/navigation";

export default async function IcpChatPage() {
  redirect("/gtm/icp?view=chat");
}
