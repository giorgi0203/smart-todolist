"use client";

import { TodoList } from "@/components/todo-list";
import { useCoAgent } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { AgentState } from "@/lib/types";

export default function CopilotKitPage() {
  return (
    <main>
      <CopilotSidebar
        disableSystemMessage={true}
        clickOutsideToClose={false}
        labels={{
          title: "Todo Assistant",
          initial:
            "👋 Hi! I can help you manage your tasks. Try adding a task and I'll suggest a description, time estimate, and subtasks. You can also ask me to sort your list!",
        }}
        suggestions={[
          {
            title: "Add Task",
            message: "Add a task: Build landing page for the new product",
          },
          {
            title: "Sort Tasks",
            message: "Sort my tasks by priority",
          },
          {
            title: "Enrich All",
            message:
              "Generate descriptions, time estimates, and subtasks for all tasks that don't have them yet.",
          },
        ]}
      >
        <TodoContent />
      </CopilotSidebar>
    </main>
  );
}

function TodoContent() {
  const { state, setState } = useCoAgent<AgentState>({
    name: "my_agent",
    initialState: {
      todos: [],
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <TodoList state={state} setState={setState} />
    </div>
  );
}
