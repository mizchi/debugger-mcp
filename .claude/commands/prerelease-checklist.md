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
  - Tool: `debug_launch`
  - Program: `node`
  - Args: `["-e", "console.log('Hello'); debugger; console.log('World')"]`
- [ ] Verify session starts successfully
- [ ] Continue execution with `debug_continue`
- [ ] Disconnect session with `debug_disconnect`

## Breakpoints

- [ ] Create a test file with multiple lines
- [ ] Set breakpoint with `debug_set_breakpoint`
- [ ] Launch debug session for the file
- [ ] Verify execution stops at breakpoint
- [ ] List breakpoints with `debug_list_breakpoints`
- [ ] Remove breakpoint with `debug_remove_breakpoint`
- [ ] Clear all breakpoints with `debug_clear_breakpoints`

## Stepping

- [ ] Stop at a breakpoint
- [ ] Step over with `debug_step_over`
- [ ] Step into a function with `debug_step_into`
- [ ] Step out of a function with `debug_step_out`
- [ ] Verify each step operation works correctly

## Variable Inspection

- [ ] Stop at a breakpoint
- [ ] Get variables with `debug_get_variables`
- [ ] Evaluate expression with `debug_evaluate`
- [ ] Get stack trace with `debug_get_stack_trace`

## Value Tracking

- [ ] Track a variable with `debug_track_value`
- [ ] Step through code multiple times
- [ ] Get value history with `debug_get_value_history`
- [ ] Verify history shows value changes

## Exception Breakpoints

- [ ] Set exception breakpoints with `debug_set_exception_breakpoints`
  - Filters: `["caught", "uncaught"]`
- [ ] Run code that throws an exception
- [ ] Verify debugger stops at exception
- [ ] Get exception info with `debug_get_exception_info`

## Watch Expressions

- [ ] Add watch expression with `debug_add_watch`
- [ ] Evaluate watches with `debug_evaluate_watches`
- [ ] List watches with `debug_list_watches`
- [ ] Remove watch with `debug_remove_watch`
- [ ] Clear all watches with `debug_clear_watches`

## Source Maps (TypeScript)

- [ ] Enable source maps with `debug_enable_source_maps`
- [ ] Create a TypeScript file and compile it
- [ ] Set breakpoint in TypeScript source with `debug_set_breakpoint_source_mapped`
- [ ] Verify breakpoint works in compiled JavaScript
- [ ] Check source map with `debug_check_source_map`

## Session Management

- [ ] Launch multiple debug sessions
- [ ] List all sessions with `debug_list_sessions`
- [ ] Get session info with `debug_get_session_info`
- [ ] Terminate session with `debug_terminate`
- [ ] Clean up old sessions with `debug_cleanup_sessions`

## Debug Logs

- [ ] Run a debug session with various operations
- [ ] Get debug log with `debug_get_log`
- [ ] Export debug log with `debug_export_log`
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