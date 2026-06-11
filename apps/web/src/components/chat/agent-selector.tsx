
import { Bot, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/chat-store";
import { useAgentStore } from "@/stores/agent-store";

export function AgentSelector() {
  const { agentId, setAgentId } = useChatStore();
  const { agents } = useAgentStore();
  const selectedAgent = agents.find((a) => a.name === agentId) ?? agents[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        <Bot className="mr-1 h-4 w-4" />
        <span>{selectedAgent?.name ?? "Assistant"}</span>
        <ChevronDown className="ml-1 h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {agents.length === 0 ? (
          <DropdownMenuItem disabled>No agents configured</DropdownMenuItem>
        ) : (
          agents.map((agent) => (
            <DropdownMenuItem key={agent.name} onClick={() => setAgentId(agent.name)}>
              {agent.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
