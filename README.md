# DAP-MCP

Debug Adapter Protocol (DAP) tools for Model Context Protocol (MCP).

## Overview

DAP-MCP provides debugging capabilities through the Model Context Protocol, allowing AI assistants to:
- Launch and control debug sessions
- Set breakpoints and step through code
- Inspect variables and stack traces
- Track value changes over time
- Export debug logs for analysis

## Installation

```bash
npm install @mizchi/dap-mcp
```

## Usage

### As an MCP Server

```bash
npx dap-mcp
```

### Available Tools

- `debug_launch` - Launch a new debug session
- `debug_attach` - Attach to a running process
- `debug_set_breakpoints` - Set breakpoints in source files
- `debug_continue` - Continue execution
- `debug_step_over` - Step over to the next line
- `debug_step_into` - Step into function calls
- `debug_step_out` - Step out of current function
- `debug_pause` - Pause execution
- `debug_get_stack_trace` - Get current stack trace
- `debug_get_variables` - Get variables in current scope
- `debug_evaluate` - Evaluate expressions
- `debug_disconnect` - End debug session
- `debug_track_value` - Track value changes over time
- `debug_get_value_history` - Get history of tracked values
- `debug_export_log` - Export debug session logs

## Supported Debug Adapters

- Node.js (built-in)
- Custom adapters can be added

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## License

MIT