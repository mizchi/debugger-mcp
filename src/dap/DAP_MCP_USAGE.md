# DAP MCP Server Usage Guide

The DAP MCP server provides debugging capabilities through the Model Context Protocol, allowing AI assistants to debug programs interactively.

## Installation

```bash
# Install globally
npm install -g @mizchi/lsmcp

# Or use with npx
npx @mizchi/lsmcp-dap
```

## MCP Configuration

Add to your Claude configuration:

```json
{
  "mcpServers": {
    "dap": {
      "command": "npx",
      "args": ["@mizchi/lsmcp-dap"]
    }
  }
}
```

## Available Tools

### Session Management

#### `debugger_launch`
Launch a new debug session for a program.

```typescript
// Example: Debug a Node.js program
debugger_launch({
  sessionId: "node-app-1",
  adapter: "node",  // Built-in Node.js adapter is automatically resolved
  program: "/path/to/app.js",
  args: ["--verbose"],
  env: { NODE_ENV: "development" },
  stopOnEntry: true
})
```

**Supported Adapters:**
- `node` / `nodejs` - Built-in Node.js debugger (no additional setup required)
- `python` / `python3` - Python debugger (requires `debugpy`)
- `go` - Go debugger (requires `dlv`)
- `rust` - Rust debugger (requires `rust-analyzer`)
- Custom adapters can be specified by path

#### `debugger_attach`
Attach to a running process.

```typescript
// Example: Attach to Node.js process
debugger_attach({
  sessionId: "node-attach-1",
  adapter: "node",
  port: 9229,
  host: "localhost"
})
```

#### `debugger_list_sessions`
List all active debug sessions.

```typescript
debugger_list_sessions({})
// Returns: List of active session IDs
```

#### `debugger_disconnect`
End a debug session.

```typescript
debugger_disconnect({
  sessionId: "node-app-1",
  terminateDebuggee: true
})
```

### Breakpoint Management

#### `debugger_set_breakpoints`
Set breakpoints in source files.

```typescript
// Example: Set breakpoints with conditions
debugger_set_breakpoints({
  sessionId: "node-app-1",
  source: "/path/to/app.js",
  lines: [10, 20, 30],
  conditions: ["x > 10", undefined, "name === 'test'"]
})
```

### Execution Control

#### `debugger_continue`
Continue program execution.

```typescript
debugger_continue({
  sessionId: "node-app-1"
})
```

#### `debugger_step_over`
Execute the next line without entering functions.

```typescript
debugger_step_over({
  sessionId: "node-app-1"
})
```

#### `debugger_step_into`
Step into function calls.

```typescript
debugger_step_into({
  sessionId: "node-app-1"
})
```

#### `debugger_step_out`
Step out of the current function.

```typescript
debugger_step_out({
  sessionId: "node-app-1"
})
```

#### `debugger_pause`
Pause execution.

```typescript
debugger_pause({
  sessionId: "node-app-1"
})
```

### Inspection Tools

#### `debugger_get_stack_trace`
Get the current call stack.

```typescript
debugger_get_stack_trace({
  sessionId: "node-app-1"
})
// Returns: Stack frames with source locations
```

#### `debugger_get_variables`
Inspect variables in the current scope.

```typescript
// Get all scopes
debugger_get_variables({
  sessionId: "node-app-1"
})

// Get specific scope
debugger_get_variables({
  sessionId: "node-app-1",
  scopeName: "Locals"
})
```

#### `debugger_evaluate`
Evaluate expressions in the debug context.

```typescript
debugger_evaluate({
  sessionId: "node-app-1",
  expression: "myArray.length + 1",
  context: "repl"
})
```

## Debugging Workflow Example

Here's a typical debugging workflow:

```typescript
// 1. Launch debug session
debugger_launch({
  sessionId: "debug-1",
  adapter: "node",
  program: "./buggy-app.js",
  stopOnEntry: false
})

// 2. Set breakpoints
debugger_set_breakpoints({
  sessionId: "debug-1",
  source: "./buggy-app.js",
  lines: [15, 25]
})

// 3. When stopped at breakpoint, inspect state
debugger_get_stack_trace({
  sessionId: "debug-1"
})

debugger_get_variables({
  sessionId: "debug-1",
  scopeName: "Locals"
})

// 4. Evaluate suspicious expressions
debugger_evaluate({
  sessionId: "debug-1",
  expression: "userData.permissions",
  context: "repl"
})

// 5. Step through code
debugger_step_over({
  sessionId: "debug-1"
})

// 6. Continue or end session
debugger_continue({
  sessionId: "debug-1"
})

// 7. Disconnect when done
debugger_disconnect({
  sessionId: "debug-1"
})
```

## Supported Debug Adapters

The DAP MCP server can work with any DAP-compliant debug adapter:

- **Node.js**: Built-in Node.js inspector
- **Python**: `debugpy`
- **Go**: `dlv`
- **C/C++**: `gdb`, `lldb`
- **Rust**: `lldb`, `rust-gdb`
- **Java**: `java-debug`

## Error Handling

All tools will return error messages if something goes wrong:

- Session not found errors
- Connection failures
- Invalid expressions
- Adapter-specific errors

## Best Practices

1. **Always use unique session IDs** to avoid conflicts
2. **Set breakpoints before continuing** execution
3. **Check variable scopes** before accessing specific variables
4. **Disconnect sessions** when done to free resources
5. **Handle errors gracefully** in your debugging workflow