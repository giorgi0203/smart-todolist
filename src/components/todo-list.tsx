"use client";

import { useState } from "react";
import { AgentState, Todo } from "@/lib/types";
import { TodoItem } from "./todo-item";
import { useCopilotChat } from "@copilotkit/react-core";
import { TextMessage, MessageRole } from "@copilotkit/runtime-client-gql";

interface TodoListProps {
  state: AgentState;
  setState: (state: AgentState) => void;
}

export function TodoList({ state, setState }: TodoListProps) {
  const [newTitle, setNewTitle] = useState("");
  const { appendMessage } = useCopilotChat();

  const todos = state.todos ?? [];

  const addTodo = () => {
    const title = newTitle.trim();
    if (!title) return;

    const todo: Todo = {
      id: crypto.randomUUID().slice(0, 8),
      title,
      completed: false,
      subtasks: [],
      createdAt: new Date().toISOString(),
    };

    setState({ ...state, todos: [...todos, todo] });
    setNewTitle("");

    // Ask the agent to enrich the new task
    appendMessage(
      new TextMessage({
        role: MessageRole.User,
        content: `I just added a new task: "${title}". Please generate a description, estimate the time, and split it into subtasks.`,
      }),
    );
  };

  const toggleTodo = (id: string) => {
    setState({
      ...state,
      todos: todos.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ),
    });
  };

  const deleteTodo = (id: string) => {
    setState({
      ...state,
      todos: todos.filter((t) => t.id !== id),
    });
  };

  const toggleSubtask = (todoId: string, subtaskId: string) => {
    setState({
      ...state,
      todos: todos.map((t) =>
        t.id === todoId
          ? {
              ...t,
              subtasks: t.subtasks.map((s) =>
                s.id === subtaskId ? { ...s, completed: !s.completed } : s
              ),
            }
          : t
      ),
    });
  };

  const handleAction = (action: string, todo: Todo) => {
    const messages: Record<string, string> = {
      describe: `Generate a short, practical description for the task "${todo.title}" (id: ${todo.id}) and update it.`,
      estimate: `Estimate how long the task "${todo.title}" (id: ${todo.id}) will take in minutes and update it.`,
      split: `Split the task "${todo.title}" (id: ${todo.id}) into 2-5 actionable subtasks and update it.`,
    };

    appendMessage(
      new TextMessage({
        role: MessageRole.User,
        content: messages[action],
      }),
    );
  };

  const handleSort = () => {
    appendMessage(
      new TextMessage({
        role: MessageRole.User,
        content:
          "Sort my tasks intelligently by priority and content. Put the most important/urgent ones first. Explain your reasoning briefly.",
      }),
    );
  };

  const completedCount = todos.filter((t) => t.completed).length;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Todo List</h1>
        <p className="text-gray-500 mt-1">
          {todos.length === 0
            ? "Add a task to get started"
            : `${completedCount}/${todos.length} completed`}
        </p>
      </div>

      {/* Add input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTodo();
        }}
        className="flex gap-2 mb-6"
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent text-gray-900 placeholder-gray-400 bg-white"
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="px-5 py-2.5 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Add
        </button>
      </form>

      {/* Sort button */}
      {todos.length > 1 && (
        <button
          onClick={handleSort}
          className="mb-4 text-sm px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
        >
          ✨ Sort by AI
        </button>
      )}

      {/* Todo items */}
      <div className="space-y-3">
        {todos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
            onToggleSubtask={toggleSubtask}
            onAction={handleAction}
          />
        ))}
      </div>

      {/* Empty state */}
      {todos.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p>No tasks yet. Add one above or ask the assistant!</p>
        </div>
      )}
    </div>
  );
}
