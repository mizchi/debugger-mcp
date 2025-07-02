# Pre-release Checklist for debugger-mcp

This checklist ensures all core functionality works before releasing debugger-mcp.

## Build and Basic Setup

- [ ] Run `pnpm build` successfully
- [ ] Run `pnpm typecheck` with no errors
- [ ] Run `pnpm lint` with no errors
- [ ] Run `pnpm test` with all tests passing

## MCP Server Startup

- [ ] Start MCP server with `node dist/dap-mcp.js`
- [ ] Verify server responds to initial handshake
- [ ] List available tools and verify all debug tools are present

## Basic Debug Session

- [ ] Launch a simple Node.js debug session
  - Tool: `debugger_launch`
  - Program: `node`
  - Args: `["-e", "console.log('Hello'); debugger; console.log('World')"]`
- [ ] Verify session starts successfully
- [ ] Continue execution with `debugger_continue`
- [ ] Disconnect session with `debugger_disconnect`

## Breakpoints

- [ ] Create a test file with multiple lines
- [ ] Set breakpoint with `debugger_set_breakpoint`
- [ ] Launch debug session for the file
- [ ] Verify execution stops at breakpoint
- [ ] List breakpoints with `debugger_list_breakpoints`
- [ ] Remove breakpoint with `debugger_remove_breakpoint`
- [ ] Clear all breakpoints with `debugger_clear_breakpoints`

## Stepping

- [ ] Stop at a breakpoint
- [ ] Step over with `debugger_step_over`
- [ ] Step into a function with `debugger_step_into`
- [ ] Step out of a function with `debugger_step_out`
- [ ] Verify each step operation works correctly

## Variable Inspection

- [ ] Stop at a breakpoint
- [ ] Get variables with `debugger_get_variables`
- [ ] Evaluate expression with `debugger_evaluate`
- [ ] Get stack trace with `debugger_get_stack_trace`

## Value Tracking

- [ ] Track a variable with `debugger_track_value`
- [ ] Step through code multiple times
- [ ] Get value history with `debugger_get_value_history`
- [ ] Verify history shows value changes

## Exception Breakpoints

- [ ] Set exception breakpoints with `debugger_set_exception_breakpoints`
  - Filters: `["caught", "uncaught"]`
- [ ] Run code that throws an exception
- [ ] Verify debugger stops at exception
- [ ] Get exception info with `debugger_get_exception_info`

## Watch Expressions

- [ ] Add watch expression with `debugger_add_watch`
- [ ] Evaluate watches with `debugger_evaluate_watches`
- [ ] List watches with `debugger_list_watches`
- [ ] Remove watch with `debugger_remove_watch`
- [ ] Clear all watches with `debugger_clear_watches`

## Source Maps (TypeScript)

- [ ] Enable source maps with `debugger_enable_source_maps`
- [ ] Create a TypeScript file and compile it
- [ ] Set breakpoint in TypeScript source with `debugger_set_breakpoint_source_mapped`
- [ ] Verify breakpoint works in compiled JavaScript
- [ ] Check source map with `debugger_check_source_map`

## Session Management

- [ ] Launch multiple debug sessions
- [ ] List all sessions with `debugger_list_sessions`
- [ ] Get session info with `debugger_get_session_info`
- [ ] Terminate session with `debugger_terminate`
- [ ] Clean up old sessions with `debugger_cleanup_sessions`

## Debug Logs

- [ ] Run a debug session with various operations
- [ ] Get debug log with `debugger_get_log`
- [ ] Export debug log with `debugger_export_log`
- [ ] Verify log contains all operations

## Error Handling

- [ ] Try to use invalid session ID
- [ ] Try to step when not stopped
- [ ] Try to set breakpoint in non-existent file
- [ ] Verify proper error messages are returned

## Performance

- [ ] Launch debug session with large program
- [ ] Set multiple breakpoints (10+)
- [ ] Track multiple values (10+)
- [ ] Verify operations remain responsive

## Final Checks

- [ ] All core features tested
- [ ] No crashes or hangs
- [ ] Error messages are clear and helpful
- [ ] README accurately describes all features
- [ ] Version number is correct in package.json