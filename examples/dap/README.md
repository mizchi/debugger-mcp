# DAP (Debug Adapter Protocol) Examples

This directory contains examples of implementing Debug Adapter Protocol support for Node.js debugging.

## Files

### node-inspector-bridge.ts

A lightweight bridge implementation that converts between Node.js Inspector Protocol (Chrome DevTools Protocol) and DAP without requiring external dependencies like vscode-js-debug.

Key features:
- Uses Node.js built-in `inspector` module
- Supports both direct session connection and WebSocket connection
- Maps CDP events to DAP events
- Provides basic debugging operations (breakpoints, stepping, evaluation)

### minimal-node-dap.ts

A minimal but functional DAP adapter for Node.js that implements the complete DAP protocol:
- Launches Node.js processes with `--inspect` or `--inspect-brk`
- Connects to Node.js Inspector via WebSocket
- Translates between DAP and Chrome DevTools Protocol
- Supports breakpoints, stepping, variable inspection, and expression evaluation

### test-node-debug.js

Example of using the DAP MCP server with the Node.js adapter to debug a program.

## Node.js Inspector Protocol vs DAP

### Node.js Inspector Protocol (CDP)
- Built into Node.js
- Uses Chrome DevTools Protocol
- WebSocket-based communication
- URL format: `ws://127.0.0.1:9229/{uuid}`
- Started with `node --inspect` or `node --inspect-brk`

### Debug Adapter Protocol (DAP)
- Standardized by Microsoft
- Used by VS Code and other IDEs
- JSON-RPC based communication
- Abstracts debugger implementation details
- Requires a debug adapter to translate to native debugger protocol

## Implementation Approaches

### 1. Direct Inspector API (Lightweight)
Use Node.js built-in `inspector` module to communicate directly with V8:
- ✅ No external dependencies
- ✅ Direct access to V8 debugging features
- ❌ Need to implement DAP protocol translation
- ❌ Limited to Node.js/V8 features

### 2. Chrome Remote Interface
Use `chrome-remote-interface` npm package:
- ✅ Full Chrome DevTools Protocol support
- ✅ Can connect to remote processes
- ❌ Additional dependency
- ❌ Still need DAP translation layer

### 3. vscode-js-debug (Full Featured)
Use Microsoft's official JavaScript debugger:
- ✅ Complete DAP implementation
- ✅ Supports all Node.js debugging features
- ✅ Battle-tested and maintained
- ❌ Large dependency
- ❌ Complex to embed

## Usage Example

### Using the DAP MCP Server with Node.js

The DAP MCP server now includes automatic adapter resolution for Node.js debugging:

```javascript
// Using the DAP MCP server
const result = await client.callTool({
  name: "debugger_launch",
  arguments: {
    sessionId: "my-debug-session",
    adapter: "node",  // Automatically resolves to the built-in Node.js adapter
    program: "./my-script.js",
    stopOnEntry: true,
  }
});
```

### Direct Bridge Usage

```typescript
import { InspectorToDAPBridge } from './node-inspector-bridge';

const bridge = new InspectorToDAPBridge();

// Connect to current process
bridge.connect();
await bridge.initialize();

// Or connect to external process
await bridge.connectWebSocket('ws://127.0.0.1:9229/some-uuid');

// Set breakpoints
await bridge.setBreakpoints('/path/to/file.js', [10, 20]);

// Control execution
await bridge.continue();
await bridge.stepOver();

// Evaluate expressions
const result = await bridge.evaluate('myVariable');
```

## Protocol Mapping

| DAP Command | CDP Method |
|-------------|------------|
| initialize | Debugger.enable, Runtime.enable |
| setBreakpoints | Debugger.setBreakpointByUrl |
| continue | Debugger.resume |
| next | Debugger.stepOver |
| stepIn | Debugger.stepInto |
| stepOut | Debugger.stepOut |
| pause | Debugger.pause |
| evaluate | Debugger.evaluateOnCallFrame |
| stackTrace | (from Debugger.paused event) |
| scopes | Runtime.getProperties |
| variables | Runtime.getProperties |

| DAP Event | CDP Event |
|-----------|-----------|
| stopped | Debugger.paused |
| continued | Debugger.resumed |
| output | Runtime.consoleAPICalled |
| breakpoint | (part of Debugger.paused) |
| terminated | Runtime.executionContextDestroyed |

## Limitations

The lightweight bridge approach has some limitations compared to full debug adapters:
- No source map support
- Limited thread support (Node.js is single-threaded)
- No advanced features like conditional breakpoints
- Manual process management required
- No built-in terminal support for launching

For production use, consider using established debug adapters like vscode-js-debug.