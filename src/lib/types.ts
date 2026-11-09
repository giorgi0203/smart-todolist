export type Priority = "low" | "medium" | "high";
export type User = { id: string; name: string; email: string };
export type Subtask = { id: string; title: string; completed: boolean };
export type Todo = {
  id: string; projectId: string; title: string; description: string;
  completed: boolean; estimatedMinutes: number | null; priority: Priority;
  dueDate: string | null; subtasks: Subtask[]; position: number;
  version: number; createdAt: string; updatedAt: string;
};
export type Project = {
  id: string; name: string; description: string; color: string;
  isInbox: boolean; taskCount: number; completedCount: number;
  createdAt: string;
};
export type AiAction = "describe" | "estimate" | "split" | "enrich";
export type PlanTask = {
  title: string; description: string; priority: Priority;
  estimatedMinutes: number | null; subtasks: { title: string }[];
};
export type AiPlan = { reply: string; tasks: PlanTask[] };
