import { redirect } from "next/navigation";

export default async function IcpChatPage() {
  redirect("/icp?view=chat");
}
