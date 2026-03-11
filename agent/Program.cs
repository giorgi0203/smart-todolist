using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting.AGUI.AspNetCore;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using OpenAI;
using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.TypeInfoResolverChain.Add(TodoAgentSerializerContext.Default));
builder.Services.AddAGUI();

WebApplication app = builder.Build();

// Create the agent factory and map the AG-UI agent endpoint
var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();
var jsonOptions = app.Services.GetRequiredService<IOptions<JsonOptions>>();
var agentFactory = new TodoAgentFactory(builder.Configuration, loggerFactory, jsonOptions.Value.SerializerOptions);
app.MapAGUI("/", agentFactory.CreateTodoAgent());

await app.RunAsync();

// =================
// State Management
// =================
public class TodoState
{
    public List<TodoModel> Todos { get; set; } = [];
}

// =================
// Data Models
// =================
public class SubtaskModel
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("completed")]
    public bool Completed { get; set; }
}

public class TodoModel
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("completed")]
    public bool Completed { get; set; }

    [JsonPropertyName("estimatedMinutes")]
    public int? EstimatedMinutes { get; set; }

    [JsonPropertyName("subtasks")]
    public List<SubtaskModel> Subtasks { get; set; } = [];

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;
}

public class TodoStateSnapshot
{
    [JsonPropertyName("todos")]
    public List<TodoModel> Todos { get; set; } = [];
}

// =================
// File Persistence
// =================
public static class TodoPersistence
{
    private static readonly string FilePath = Path.Combine(AppContext.BaseDirectory, "todos.json");
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public static List<TodoModel> Load()
    {
        if (!File.Exists(FilePath)) return [];
        var json = File.ReadAllText(FilePath);
        return JsonSerializer.Deserialize<List<TodoModel>>(json, JsonOptions) ?? [];
    }

    public static void Save(List<TodoModel> todos)
    {
        var json = JsonSerializer.Serialize(todos, JsonOptions);
        File.WriteAllText(FilePath, json);
    }
}

// =================
// Agent Factory
// =================
public class TodoAgentFactory
{
    private readonly IConfiguration _configuration;
    private readonly TodoState _state;
    private readonly OpenAIClient _openAiClient;
    private readonly ILogger _logger;
    private readonly JsonSerializerOptions _jsonSerializerOptions;

    public TodoAgentFactory(IConfiguration configuration, ILoggerFactory loggerFactory, JsonSerializerOptions jsonSerializerOptions)
    {
        _configuration = configuration;
        _state = new() { Todos = TodoPersistence.Load() };
        _logger = loggerFactory.CreateLogger<TodoAgentFactory>();
        _jsonSerializerOptions = jsonSerializerOptions;

        // Get the GitHub token from configuration
        var githubToken = _configuration["GitHubToken"]
            ?? throw new InvalidOperationException(
                "GitHubToken not found in configuration. " +
                "Please set it using: dotnet user-secrets set GitHubToken \"<your-token>\" " +
                "or get it using: gh auth token");

        _openAiClient = new(
            new System.ClientModel.ApiKeyCredential(githubToken),
            new OpenAIClientOptions
            {
                Endpoint = new Uri("https://models.inference.ai.azure.com")
            });
    }

    public AIAgent CreateTodoAgent()
    {
        var chatClient = _openAiClient.GetChatClient("gpt-4o-mini").AsIChatClient();

        var chatClientAgent = new ChatClientAgent(
            chatClient,
            name: "TodoAgent",
            description: @"You are a smart TODO list assistant. You help users manage their tasks efficiently.

Your capabilities:
- Add, update, delete, and toggle todos
- Generate meaningful descriptions for tasks based on their title
- Estimate how long tasks will take (in minutes)
- Split tasks into actionable subtasks
- Sort tasks intelligently by priority, deadline, or content
- Toggle subtask completion

IMPORTANT BEHAVIORS:
- When a user adds a new task, ALWAYS proactively offer to: generate a description, estimate time, and split into subtasks.
- When sorting, explain your reasoning briefly.
- Keep responses concise and actionable.
- ALWAYS use get_todos first before discussing or modifying tasks.
- When generating descriptions, make them practical and specific (1-2 sentences).
- When estimating time, be realistic and consider subtasks if they exist.
- When splitting into subtasks, create 2-5 concrete, actionable steps.",
            tools: [
                AIFunctionFactory.Create(GetTodos, options: new() { Name = "get_todos", SerializerOptions = _jsonSerializerOptions }),
                AIFunctionFactory.Create(AddTodo, options: new() { Name = "add_todo", SerializerOptions = _jsonSerializerOptions }),
                AIFunctionFactory.Create(UpdateTodo, options: new() { Name = "update_todo", SerializerOptions = _jsonSerializerOptions }),
                AIFunctionFactory.Create(DeleteTodo, options: new() { Name = "delete_todo", SerializerOptions = _jsonSerializerOptions }),
                AIFunctionFactory.Create(ToggleTodo, options: new() { Name = "toggle_todo", SerializerOptions = _jsonSerializerOptions }),
                AIFunctionFactory.Create(ToggleSubtask, options: new() { Name = "toggle_subtask", SerializerOptions = _jsonSerializerOptions }),
                AIFunctionFactory.Create(SetTodos, options: new() { Name = "set_todos", SerializerOptions = _jsonSerializerOptions }),
            ]);

        return new SharedStateAgent(chatClientAgent, _jsonSerializerOptions);
    }

    // =================
    // Tools
    // =================

    [Description("Get the current list of todos.")]
    private List<TodoModel> GetTodos()
    {
        _logger.LogInformation("📋 Getting todos: {Count} items", _state.Todos.Count);
        return _state.Todos;
    }

    [Description("Add a new todo task. Returns the created todo.")]
    private TodoModel AddTodo(
        [Description("The title of the todo")] string title,
        [Description("Optional description")] string? description = null,
        [Description("Optional estimated time in minutes")] int? estimatedMinutes = null)
    {
        var todo = new TodoModel
        {
            Id = Guid.NewGuid().ToString("N")[..8],
            Title = title,
            Description = description,
            EstimatedMinutes = estimatedMinutes,
            CreatedAt = DateTime.UtcNow.ToString("o")
        };
        _state.Todos.Add(todo);
        TodoPersistence.Save(_state.Todos);
        _logger.LogInformation("➕ Added todo: {Title} (id: {Id})", title, todo.Id);
        return todo;
    }

    [Description("Update an existing todo. Only provided fields are updated.")]
    private string UpdateTodo(
        [Description("The ID of the todo to update")] string id,
        [Description("New title")] string? title = null,
        [Description("New description")] string? description = null,
        [Description("Estimated time in minutes")] int? estimatedMinutes = null,
        [Description("New list of subtasks")] List<SubtaskModel>? subtasks = null)
    {
        var todo = _state.Todos.Find(t => t.Id == id);
        if (todo == null) return $"Todo with id '{id}' not found.";

        if (title != null) todo.Title = title;
        if (description != null) todo.Description = description;
        if (estimatedMinutes != null) todo.EstimatedMinutes = estimatedMinutes;
        if (subtasks != null) todo.Subtasks = subtasks;

        TodoPersistence.Save(_state.Todos);
        _logger.LogInformation("✏️ Updated todo: {Id}", id);
        return $"Updated todo '{todo.Title}' successfully.";
    }

    [Description("Delete a todo by ID.")]
    private string DeleteTodo([Description("The ID of the todo to delete")] string id)
    {
        var removed = _state.Todos.RemoveAll(t => t.Id == id);
        if (removed == 0) return $"Todo with id '{id}' not found.";
        TodoPersistence.Save(_state.Todos);
        _logger.LogInformation("🗑️ Deleted todo: {Id}", id);
        return "Todo deleted successfully.";
    }

    [Description("Toggle the completed status of a todo.")]
    private string ToggleTodo([Description("The ID of the todo to toggle")] string id)
    {
        var todo = _state.Todos.Find(t => t.Id == id);
        if (todo == null) return $"Todo with id '{id}' not found.";
        todo.Completed = !todo.Completed;
        TodoPersistence.Save(_state.Todos);
        _logger.LogInformation("✅ Toggled todo: {Id} -> {Completed}", id, todo.Completed);
        return $"Todo '{todo.Title}' is now {(todo.Completed ? "completed" : "not completed")}.";
    }

    [Description("Toggle the completed status of a subtask.")]
    private string ToggleSubtask(
        [Description("The ID of the parent todo")] string todoId,
        [Description("The ID of the subtask to toggle")] string subtaskId)
    {
        var todo = _state.Todos.Find(t => t.Id == todoId);
        if (todo == null) return $"Todo with id '{todoId}' not found.";
        var subtask = todo.Subtasks.Find(s => s.Id == subtaskId);
        if (subtask == null) return $"Subtask with id '{subtaskId}' not found.";
        subtask.Completed = !subtask.Completed;
        TodoPersistence.Save(_state.Todos);
        _logger.LogInformation("✅ Toggled subtask: {SubtaskId} in {TodoId}", subtaskId, todoId);
        return $"Subtask '{subtask.Title}' is now {(subtask.Completed ? "completed" : "not completed")}.";
    }

    [Description("Replace the entire list of todos. Use this for sorting or bulk updates.")]
    private void SetTodos([Description("The new list of todos")] List<TodoModel> todos)
    {
        _logger.LogInformation("📝 Setting {Count} todos", todos.Count);
        _state.Todos = [.. todos];
        TodoPersistence.Save(_state.Todos);
    }
}

public partial class Program { }

// =================
// Serializer Context
// =================
[JsonSerializable(typeof(TodoStateSnapshot))]
[JsonSerializable(typeof(TodoModel))]
[JsonSerializable(typeof(SubtaskModel))]
[JsonSerializable(typeof(List<TodoModel>))]
[JsonSerializable(typeof(List<SubtaskModel>))]
internal sealed partial class TodoAgentSerializerContext : JsonSerializerContext;
