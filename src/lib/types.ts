export type Subtask = {
  id: string;
  title: string;
  completed: boolean;
};

export type Todo = {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  estimatedMinutes?: number;
  subtasks: Subtask[];
  createdAt: string;
};

// State of the agent, make sure this aligns with your agent's state.
export type AgentState = {
  todos: Todo[];
};