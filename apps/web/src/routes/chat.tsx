import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ChatView } from "@/components/chat/chat-view";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage() {
  return (
    <AppLayout section="chat" leftPane={<ChatSidebar />}>
      <ChatView />
    </AppLayout>
  );
}
