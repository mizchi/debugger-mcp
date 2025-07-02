# DAP Client Implementation

## Overview

This directory contains a TypeScript implementation of the Debug Adapter Protocol (DAP) client, enabling communication with any DAP-compliant debugger.

## Architecture

```
src/dap/
├── dapClient.ts           # Core DAP client implementation
└── __tests__/            # Test implementations and examples
    ├── README.md         # Test documentation
    ├── basic-connection.test.ts      # Basic protocol test
    ├── variable-inspection.test.ts   # Variable inspection test
    ├── code-evaluation.test.ts       # Expression evaluation test
    ├── step-execution.test.ts        # Step control test
    ├── full-debugging-features.test.ts # Comprehensive test
    ├── run-all-tests.ts             # Test runner
    ├── mock-dap-server.ts           # Basic mock server
    └── enhanced-mock-dap-server.ts  # Full-featured mock server
```

## Core Features

### 1. Protocol Implementation (`dapClient.ts`)

- **Message Framing**: Content-Length based message framing
- **Request/Response**: Promise-based request handling with timeouts
- **Event Handling**: EventEmitter for asynchronous events
- **Error Handling**: Proper error propagation and cleanup
- **Connection Management**: TCP socket-based communication

### 2. Debugging Capabilities

#### Variable Inspection
- Scope enumeration (locals, globals, etc.)
- Nested object/array exploration
- Type information support
- Variable references for lazy loading

#### Expression Evaluation
- REPL-style expression evaluation
- Context-aware evaluation (watch, hover, repl)
- Support for complex expressions
- Error handling for invalid expressions

#### Execution Control
- **Continue**: Resume execution
- **Step Over** (`next`): Execute next line
- **Step Into** (`stepIn`): Enter function calls
- **Step Out** (`stepOut`): Exit current function
- **Pause**: Break execution

#### Breakpoints
- Source line breakpoints
- Conditional breakpoints (server-dependent)
- Breakpoint verification

#### Stack Navigation
- Stack frame enumeration
- Frame-specific variable scopes
- Source location information

## Usage Example

```typescript
import { DAPClient } from "./dapClient";

const client = new DAPClient();

// Connect to debugger
await client.connect("node", ["--inspect"]);

// Initialize session
await client.initialize({
  clientID: "my-debugger",
  linesStartAt1: true,
  columnsStartAt1: true,
});

// Set breakpoints
await client.sendRequest("setBreakpoints", {
  source: { path: "/path/to/file.js" },
  breakpoints: [{ line: 10 }, { line: 20 }]
});

// Launch program
await client.sendRequest("launch", {
  program: "/path/to/program.js"
});

// Handle events
client.on("stopped", async (event) => {
  console.log("Stopped at:", event);
  
  // Inspect variables
  const stackTrace = await client.sendRequest("stackTrace", {
    threadId: event.threadId
  });
  
  const scopes = await client.sendRequest("scopes", {
    frameId: stackTrace.stackFrames[0].id
  });
  
  // Continue execution
  await client.sendRequest("continue", {
    threadId: event.threadId
  });
});
```

## Testing

### Running Tests

1. Start the mock server:
   ```bash
   npx tsx src/dap/__tests__/enhanced-mock-dap-server.ts
   ```

2. Run individual tests:
   ```bash
   npx tsx src/dap/__tests__/variable-inspection.test.ts
   ```

3. Run all tests:
   ```bash
   npx tsx src/dap/__tests__/run-all-tests.ts
   ```

### Mock Servers

- **Basic Mock Server**: Simple request/response testing
- **Enhanced Mock Server**: Full debugging simulation with:
  - Variable state management
  - Expression evaluation
  - Step execution simulation
  - Multiple stack frames

## Integration with MCP

This DAP client is designed to be wrapped as MCP tools:

```typescript
// Example MCP tool
export const debugSetBreakpointTool: ToolDef = {
  name: "debugger_set_breakpoint",
  description: "Set a breakpoint in the debugger",
  schema: z.object({
    file: z.string(),
    line: z.number(),
    condition: z.string().optional()
  }),
  execute: async (args) => {
    const client = getDebugClient();
    const result = await client.sendRequest("setBreakpoints", {
      source: { path: args.file },
      breakpoints: [{
        line: args.line,
        condition: args.condition
      }]
    });
    return `Breakpoint set at ${args.file}:${args.line}`;
  }
};
```

## Future Enhancements

- [ ] Real debugger integration (Node.js, Python, etc.)
- [ ] Advanced breakpoint types (function, exception)
- [ ] Memory inspection
- [ ] Multi-threaded debugging
- [ ] Remote debugging support
- [ ] Performance profiling integration