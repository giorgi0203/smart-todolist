import { Todo } from "@/lib/types";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleSubtask: (todoId: string, subtaskId: string) => void;
  onAction: (action: string, todo: Todo) => void;
}

export function TodoItem({
  todo,
  onToggle,
  onDelete,
  onToggleSubtask,
  onAction,
}: TodoItemProps) {
  return (
    <div className="group border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all bg-white">
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(todo.id)}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            todo.completed
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-gray-300 hover:border-emerald-400"
          }`}
        >
          {todo.completed && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className={`font-medium ${todo.completed ? "line-through text-gray-400" : "text-gray-900"}`}>
            {todo.title}
          </h3>

          {todo.description && (
            <p className="text-sm text-gray-500 mt-1">{todo.description}</p>
          )}

          {/* Meta row */}
          {(todo.estimatedMinutes || todo.subtasks.length > 0) && (
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              {todo.estimatedMinutes && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                  </svg>
                  ~{todo.estimatedMinutes}min
                </span>
              )}
              {todo.subtasks.length > 0 && (
                <span>
                  {todo.subtasks.filter((s) => s.completed).length}/{todo.subtasks.length} subtasks
                </span>
              )}
            </div>
          )}

          {/* Subtasks */}
          {todo.subtasks.length > 0 && (
            <div className="mt-3 space-y-1.5 pl-1">
              {todo.subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center gap-2">
                  <button
                    onClick={() => onToggleSubtask(todo.id, subtask.id)}
                    className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      subtask.completed
                        ? "bg-emerald-400 border-emerald-400 text-white"
                        : "border-gray-300 hover:border-emerald-300"
                    }`}
                  >
                    {subtask.completed && (
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className={`text-sm ${subtask.completed ? "line-through text-gray-400" : "text-gray-600"}`}>
                    {subtask.title}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
            {!todo.description && (
              <ActionButton label="Describe" onClick={() => onAction("describe", todo)} />
            )}
            {!todo.estimatedMinutes && (
              <ActionButton label="Estimate" onClick={() => onAction("estimate", todo)} />
            )}
            {todo.subtasks.length === 0 && (
              <ActionButton label="Split" onClick={() => onAction("split", todo)} />
            )}
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={() => onDelete(todo.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 p-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
    >
      {label}
    </button>
  );
}
