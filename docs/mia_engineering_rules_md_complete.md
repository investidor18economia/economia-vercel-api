# MIA_ENGINEERING_RULES.md

# MIA / EconomIA — Official Engineering Rules

# Purpose Of This Document

This document defines:

- mandatory engineering principles
- architectural protection rules
- cognitive governance rules
- implementation standards
- anti-pattern restrictions
- development philosophy
- AI-assisted engineering constraints

This document exists to protect:

```txt
MIA's proprietary intelligence architecture.
```

This is NOT:

- a generic coding guideline
- a style guide only
- a prompt engineering guide

This document defines:

```txt
what MUST NEVER be violated.
```

---

# THE MOST IMPORTANT RULE IN THE ENTIRE PROJECT

```txt
MIA owns the intelligence.
The LLM only verbalizes.
```

This is the foundational engineering rule.

Every implementation must preserve this.

If any implementation:

- moves cognition into prompts
- depends on the LLM for reasoning
- lets the LLM decide winners
- lets the LLM invent tradeoffs
- uses prompt tricks as architecture
- creates hidden provider dependency

then the architecture is being violated.

---

# ENGINEERING PHILOSOPHY

MIA is being engineered as:

- proprietary AI infrastructure
- contextual reasoning architecture
- cognitive commerce engine
- vertical decision system

NOT:

- a chatbot
- a GPT wrapper
- a prompt collection
- a template engine
- a benchmark explainer

---

# GLOBAL ENGINEERING PRINCIPLES

# Principle 1 — Architecture First

Architecture has priority over:

- speed
- shortcuts
- hacks
- quick fixes
- prompt tricks

If a solution works but breaks architecture:

```txt
it is NOT an acceptable solution.
```

---

# Principle 2 — Cognition Must Be Proprietary

All cognition must live inside:

- MIA engines
- governance systems
- contextual systems
- structured reasoning layers
- proprietary algorithms

NOT inside:

- prompts
- LLM creativity
- hidden instructions
- provider behavior

---

# Principle 3 — LLM-Agnostic Architecture

The system must remain:

- provider-independent
- model-independent
- portable
- transferable

MIA must continue working with:

- OpenAI
- Claude
- Gemini
- local models
- future providers

without architectural rewrites.

---

# Principle 4 — Reasoning Before Language

The architecture must always prioritize:

```txt
reasoning generation
before
language generation
```

Meaning:

1. MIA calculates
2. MIA reasons
3. MIA governs
4. LLM verbalizes

NEVER:

1. LLM improvises
2. MIA tries to control after

---

# Principle 5 — Structured Intelligence

The system must prefer:

- structured reasoning
- explicit governance
- deterministic cognition
- modular engines

instead of:

- hidden prompt logic
- magical prompting
- vague AI behavior
- provider-specific tricks

---

# CRITICAL ARCHITECTURAL PROTECTIONS

# RULE — The LLM Cannot Decide Winners

The LLM MUST NEVER:

- select products
- rank candidates
- override recommendations
- invent superior products
- change contextual dominance

Winner selection belongs ONLY to:

```txt
Decision Engine
```

---

# RULE — The LLM Cannot Invent Reasoning

The LLM MUST NEVER:

- invent tradeoffs
- invent priorities
- invent contextual fears
- invent performance gaps
- invent user psychology

Reasoning belongs ONLY to:

```txt
Proprietary Reasoning Engine
```

---

# RULE — Prompts Are NOT Architecture

Prompts may:

- guide formatting
- guide verbalization
- guide communication style

Prompts may NOT:

- own cognition
- replace reasoning systems
- replace governance
- replace contextual logic

If a system only works because:

```txt
"the prompt is smart"
```

then the architecture is wrong.

---

# RULE — Never Depend On Hidden LLM Behavior

Forbidden:

- relying on provider quirks
- relying on model personality
- relying on hidden chain-of-thought assumptions
- relying on unstable LLM behavior

Every important system must be:

- explicit
- inspectable
- governable
- reproducible

---

# RULE — Never Hardcode Fake Intelligence

Forbidden:

- fake reasoning
- fake contextuality
- fake personalization
- static recommendation templates
- keyword-only cognition

Bad:

```js
if (gaming) {
  return "phone x is best for gaming";
}
```

Good:

```txt
contextual weighting
→ reasoning generation
→ consequence mapping
→ recommendation
```

---

# RULE — Never Build Generic Chatbot Logic

Forbidden:

- generic assistant behavior
- generic AI phrasing
- generic review structure
- generic recommendation flow

MIA must NEVER sound like:

- ChatGPT
- Gemini generic mode
- review YouTube channels
- benchmark websites
- spec comparison sites

---

# RULE — Human Consequence Before Technical Evidence

The system must prioritize:

```txt
human consequence
before
technical specification
```

Bad:

```txt
"Snapdragon 778G with 8GB RAM"
```

Good:

```txt
"less sensation of the phone reaching its limit during heavy usage"
```

Specs should appear:

- minimally
- only when useful
- only as supporting evidence

---

# RULE — Tradeoffs Must Remain Honest

The system must NEVER:

- flatten tradeoffs
- fake ties
- fake neutrality
- exaggerate winners
- distort loser advantages

Tradeoffs must be:

- contextual
- proportional
- honest
- strategically explained

---

# RULE — No False Balance

A tradeoff does NOT automatically mean:

```txt
"both are equally good"
```

MIA must preserve:

- contextual dominance
- recommendation clarity
- confidence hierarchy

---

# RULE — Suppressed Axes Must Stay Suppressed

If an axis is contextually irrelevant:

- it should not dominate reasoning
- it should not contaminate recommendation
- it should not appear excessively

Example:

User:

```txt
"I play games a lot"
```

Camera should not suddenly dominate the response.

---

# RULE — Anti-Spec-Dump Enforcement

Forbidden:

- benchmark dumps
- review-style comparisons
- spec-heavy responses
- repetitive technical jargon

The system must prefer:

- practical impact
- experiential reasoning
- contextual consequence
- emotional realism

---

# RULE — Anti-Generic Language Enforcement

Forbidden phrases include:

- “better performance”
- “superior experience”
- “great option”
- “ideal choice”
- “offers superior performance”
- “equipped with”
- “stands out in performance”

The system must sound:

- strategic
- contextual
- practical
- proprietary
- human

---

# RULE — No YouTube Review Tone

MIA must NEVER sound like:

- a tech reviewer
- a benchmark channel
- a spec explainer
- a comparison website

MIA should sound like:

```txt
an intelligent purchasing consultant.
```

---

# RULE — No Fake Personality

MIA personality must emerge from:

- reasoning style
- communication quality
- strategic thinking
- contextual precision

NOT:

- forced gimmicks
- exaggerated catchphrases
- artificial quirks
- meme behavior

---

# RULE — Context Must Control Reasoning

Reasoning must adapt to:

- priorities
- fears
- tradeoffs
- usage patterns
- emotional pressure
- contextual risk

Reasoning must NEVER be static.

---

# RULE — Every Important System Must Be Governable

Every major engine must expose:

- rules
- signals
- flags
- constraints
- logs
- governance states

Avoid:

- black-box logic
- invisible behavior
- hidden cognition

---

# RULE — Post-Processing Is Governance, Not Intelligence

Post-processing may:

- enforce consistency
- suppress generic language
- compress output
- protect architecture

Post-processing may NOT:

- create reasoning from nothing
- replace cognition
- fabricate logic

---

# RULE — No Architecture Coupling To One Provider

Forbidden:

- OpenAI-specific cognition
- Claude-only workflows
- provider-locked architecture
- provider-dependent reasoning

The architecture must survive:

- provider changes
- model degradation
- API changes
- model replacement

---

# ENGINEERING STANDARDS

# Standard — Modular Systems

Engines must remain:

- isolated
- modular
- inspectable
- reusable
- composable

Avoid giant monolithic logic.

---

# Standard — Explicit Naming

Avoid vague names.

Bad:

```js
handleLogic()
processData()
```

Good:

```js
buildMiaImpactComparison()
applyMiaTradeoffIntegrityGuard()
```

---

# Standard — Governance Over Magic

Prefer:

- explicit flags
- explicit rules
- explicit contracts

instead of:

- hidden assumptions
- magical AI behavior
- unexplained heuristics

---

# Standard — Logs Matter

Important systems should expose logs.

Logs help:

- debugging
- architecture validation
- reasoning validation
- governance inspection

---

# Standard — Every Engine Needs Clear Responsibility

Avoid engines doing everything.

Each layer must own:

- one cognitive responsibility
- one governance responsibility
- one communication responsibility

---

# Standard — Minimize Prompt Dependency

Prompts should become:

```txt
thin verbalization instructions
```

NOT:

```txt
the source of intelligence.
```

---

# Standard — Prefer Deterministic Reasoning

Where possible:

- explicit logic
- deterministic systems
- structured reasoning

are preferred over:

- random LLM behavior
- emergent guessing
- prompt improvisation

---

# STANDARD — Human Experience > Technical Detail

Always prioritize:

- consequence
- comfort
- friction
- sensation
- long-term satisfaction

before:

- specs
- benchmarks
- technical jargon

---

# ENGINEERING ANTI-PATTERNS

# Anti-Pattern — Prompt-As-Brain

Bad:

```txt
Huge prompt trying to make GPT smart.
```

Correct:

```txt
Structured proprietary cognition.
```

---

# Anti-Pattern — Hidden Hardcodes

Bad:

```js
if (product === "A73") winner = true;
```

Correct:

```txt
contextual reasoning pipeline
→ weighted decision
→ governed recommendation
```

---

# Anti-Pattern — Generic AI Tone

Bad:

```txt
"This device offers superior performance."
```

Correct:

```txt
"You feel less pressure when the workload gets heavier."
```

---

# Anti-Pattern — Fake Neutrality

Bad:

```txt
"Both are excellent options."
```

when the contextual dominance is obvious.

---

# Anti-Pattern — Review-Site Thinking

Bad:

```txt
spec
→ benchmark
→ recommendation
```

Correct:

```txt
context
→ impact
→ consequence
→ recommendation
```

---

# Anti-Pattern — Provider Worship

Forbidden mentality:

```txt
"GPT will solve this automatically"
```

MIA must own:

- reasoning
- governance
- intelligence
- cognition

---

# AI-ASSISTED ENGINEERING RULES

# RULE — AI Assistants Must Respect Architecture

When using:

- Cursor
- Claude
- ChatGPT
- Gemini
- Copilot

always remind:

```txt
MIA owns the intelligence.
The LLM only verbalizes.
```

---

# RULE — Never Accept AI Suggestions Blindly

AI-generated code must always be reviewed for:

- architecture violations
- hidden prompt dependency
- fake cognition
- hardcoded reasoning
- provider coupling

---

# RULE — AI Must Follow Existing Engines

New implementations must integrate with:

- Decision Engine
- Reasoning Engine
- Governance Layers
- Contextual Systems
- Behavior Systems

NOT bypass them.

---

# RULE — Architecture Consistency Over Fast Shipping

Never sacrifice:

- cognition ownership
- modularity
- governance
- architecture integrity

for:

- speed
- demos
- shortcuts
- temporary hacks

---

# LONG-TERM ENGINEERING OBJECTIVE

The long-term objective is to build:

```txt
a proprietary cognitive commerce infrastructure.
```

The moat is NOT:

- prompts
- wrappers
- UI
- APIs

The moat is:

- reasoning architecture
- contextual intelligence
- governance systems
- proprietary cognition
- decision quality
- experiential reasoning

---

# FINAL NON-NEGOTIABLE RULE

```txt
MIA owns the intelligence.
The LLM only verbalizes.
```

Every:

- refactor
- engine
- feature
- prompt
- payload
- reasoning layer
- behavioral system
- market system
- memory system

must reinforce this rule.

If a future implementation weakens this principle:

```txt
it is architecturally incorrect.
```

