# debugger-mcp Design Notes

## Language Independence

This debugger MCP implementation is designed to be language-agnostic by following the Debug Adapter Protocol (DAP) standard. Here are the key design principles:

### Current State

1. **Adapter-based Architecture**
   - Language support is provided through adapters (e.g., 'node', 'python', 'gdb')
   - Each adapter implements the DAP specification
   - Core functionality is language-independent

2. **Generic Parameters**
   - `program`: Path to executable/script (works for any language)
   - `args`: Command line arguments (universal)
   - `env`: Environment variables (universal)
   - `cwd`: Working directory (universal)
   - `adapter`: Specifies which debug adapter to use

3. **DAP Compliance**
   - All tools follow DAP operations (launch, setBreakpoints, continue, etc.)
   - Response formats are standardized across languages
   - Event handling is uniform

### Language-Specific Considerations

While the core is language-agnostic, some language-specific features may require special handling:

1. **Source Maps** (TypeScript/JavaScript)
   - Currently implemented for JS/TS
   - Could be extended for other compiled languages

2. **Virtual Environments** (Python)
   - Python may need `pythonPath` parameter
   - Virtual environment activation

3. **Build Systems** (C/C++, Go)
   - May need compilation before debugging
   - Symbol file locations

### Future Improvements

1. **Abstract language-specific features**
   - Create adapter-specific configuration schemas
   - Move language-specific logic to adapter implementations

2. **Expand test coverage**
   - Add Python debugging tests
   - Add compiled language tests (C/C++, Go)
   - Ensure all tests work with multiple adapters

3. **Documentation**
   - Language-specific setup guides
   - Adapter configuration examples
   - Cross-language debugging scenarios

## Naming Convention: debug_ → debugger_

### Update (Breaking Change Applied)
- All 47 tools now use `debugger_` prefix
- Examples: `debugger_launch`, `debugger_continue`, `debugger_set_breakpoint`
- This change was made before v0.1.0 release

### Rationale for debugger_ prefix

**Benefits:**
- More semantically clear (these are debugger tools)
- Avoids potential namespace conflicts  
- Aligns with the project name (debugger-mcp)
- Consistent with the tool's purpose

**Implementation:**
- All tool definitions updated
- All tests updated
- All documentation updated
- No backward compatibility needed (pre-release change)