# debugger-mcp

Debug Adapter Protocol (DAP) tools for Model Context Protocol (MCP).

## Overview

debugger-mcp provides debugging capabilities through the Model Context Protocol, allowing AI assistants to:
- Launch and control debug sessions
- Set breakpoints and step through code
- Inspect variables and stack traces
- Track value changes over time
- Set and evaluate watch expressions
- Handle exception breakpoints
- Support source maps for TypeScript debugging
- Export debug logs for analysis

## Installation

```bash
npm install debugger-mcp
```

## Usage

### As an MCP Server

```bash
npx debugger-mcp
```

### Core Features

#### Session Management
- `debug_launch` - Launch a new debug session
- `debug_attach` - Attach to a running process
- `debug_disconnect` - End debug session
- `debug_terminate` - Forcefully terminate debug session
- `debug_list_sessions` - List all active debug sessions

#### Breakpoints
- `debug_set_breakpoints` - Set breakpoints in source files
- `debug_set_breakpoint` - Set a single breakpoint
- `debug_remove_breakpoint` - Remove a breakpoint
- `debug_list_breakpoints` - List all breakpoints
- `debug_clear_breakpoints` - Clear all breakpoints

#### Execution Control
- `debug_continue` - Continue execution
- `debug_step_over` - Step over to the next line
- `debug_step_into` - Step into function calls
- `debug_step_out` - Step out of current function
- `debug_pause` - Pause execution

#### Debugging Tools
- `debug_get_stack_trace` - Get current stack trace
- `debug_get_variables` - Get variables in current scope
- `debug_evaluate` - Evaluate expressions
- `debug_get_threads` - Get thread information

#### Value Tracking
- `debug_track_value` - Track value changes over time
- `debug_get_value_history` - Get history of tracked values
- `debug_set_time_checkpoint` - Set time checkpoints
- `debug_get_time_since_checkpoint` - Get elapsed time since checkpoint

#### Exception Handling
- `debug_set_exception_breakpoints` - Configure exception breakpoints
- `debug_get_exception_info` - Get current exception information
- `debug_clear_exception_breakpoints` - Clear exception breakpoints

#### Watch Expressions
- `debug_add_watch` - Add a watch expression
- `debug_remove_watch` - Remove a watch expression
- `debug_evaluate_watches` - Evaluate all watch expressions
- `debug_list_watches` - List all watch expressions

#### Source Map Support
- `debug_enable_source_maps` - Enable/disable source map support
- `debug_check_source_map` - Check if a file has source maps
- `debug_map_location` - Map locations between source and generated code
- `debug_set_breakpoint_source_mapped` - Set breakpoint with source map resolution

#### Logging and Export
- `debug_get_log` - Get debug session log
- `debug_export_log` - Export debug session logs
- `debug_get_events` - Get debug events for a session

## Supported Debug Adapters

- **Node.js** (built-in) - Full support for debugging Node.js applications
- Custom adapters can be added by implementing the Debug Adapter Protocol

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

# Lint
pnpm lint
```

## Architecture

The project is organized into several core modules:

- **Session Management** - Handles debug session lifecycle
- **Breakpoint Management** - Manages breakpoints across files
- **Value Tracking** - Tracks variable changes over time
- **Watch Management** - Manages watch expressions
- **Source Map Support** - Provides TypeScript debugging support
- **Exception Handling** - Manages exception breakpoints

## Testing

The project includes comprehensive test coverage:
- Unit tests for all manager classes
- Integration tests for the complete debugging workflow
- Tests for exception handling, watch expressions, and source maps

## License

MIT