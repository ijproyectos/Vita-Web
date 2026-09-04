import { requireUser } from "@/lib/dal";
import { ChatView } from "./chat-view";

export default async function ChatPage() {
  await requireUser();
  return <ChatView />;
}
