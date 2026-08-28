# Active Context

## Current Development Requirements

### agentMemory Integration (MANDATORY)

**This project requires agentMemory MCP tools for all development work.**

#### MCP Tools Available

- `memory_search` - Query existing knowledge
- `memory_write` - Document decisions and patterns  
- `memory_read` - Retrieve specific memories

#### Mandatory Workflow

1. **Before starting:** Call `memory_search()` to check existing knowledge
2. **During work:** Reference established patterns from memory
3. **After completion:** Call `memory_write()` to document your work

**Failure to use memory tools = Incomplete work**
