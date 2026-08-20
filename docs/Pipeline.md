1. Prompt-generation / implementation-planning pipeline

This is the one for turning Kimi's screen/feature plan into a Kilo implementation prompt:

                 KIMI SCREEN / FEATURE PLAN
                           │
                           ▼
                    GPT-5.6 TERRA
                           │
                           ▼
               INITIAL IMPLEMENTATION PLAN
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
         GEMINI          CLAUDE       QWEN 3.8 MAX
        Plan Audit      Plan Audit     Plan/Scope
            │              │              │
            └──────────────┼──────────────┘
                           ▼
                       QWEN CODE
                  Actual-code verification
                           │
                           ▼
                     GPT-5.6 LUNA
                  Final plan synthesis
                           │
                           ▼
                 FINAL KILO PROMPT

Purpose: produce the best possible implementation prompt for Kilo.


2. Code Skeptic Audit

This is the pipeline you pasted:

                    ACTUAL CODEBASE
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
         CLAUDE         GEMINI      QWEN 3.8 MAX
        Skeptic       System/Safety   Structure
            │             │             │
            └─────────────┼─────────────┘
                          ▼
                     QWEN CODE
                 Evidence verification
                          │
                          ▼
                    GPT-5.6 LUNA
                 Adjudication / final
				 

Purpose: deliberately try to find things that are wrong, fragile, incomplete, or dangerous.

3. Code Review Audit

Separate from the skeptic audit:

                    ACTUAL CODEBASE
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
         GEMINI         CLAUDE       QWEN CODE
       Code Review     Code Review    Code Review
            │             │             │
            └─────────────┼─────────────┘
                          ▼
                    GPT-5.6 LUNA
                 Final Code Review

Purpose: determine whether the implementation is actually good enough to approve.