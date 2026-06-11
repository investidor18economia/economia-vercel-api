# MIA_ARCHITECTURE.md

# MIA / EconomIA — Proprietary AI Architecture

## Vision

MIA is not a chatbot.
MIA is not a prompt wrapper.
MIA is not a GPT frontend.
MIA is not a traditional recommendation engine.

MIA is a proprietary vertical AI decision architecture focused on assisted online purchasing.

The objective is to create a system capable of:

- understanding user intent deeply
- mapping contextual priorities
- evaluating tradeoffs
- reasoning over structured product intelligence
- generating contextual decisions
- explaining consequences in human terms
- maintaining architectural independence from any single LLM provider

The long-term goal is for MIA to become:

- a vertical reasoning engine for purchases
- a proprietary decision infrastructure
- a trust layer between users and commerce
- a cognitive purchasing assistant
- a market intelligence platform

---

# Core Architectural Philosophy

## MIA owns the intelligence.
## The LLM only verbalizes.

This is the single most important architectural principle of the entire system.

The LLM:

- does NOT decide winners
- does NOT create reasoning
- does NOT determine tradeoffs
- does NOT determine priorities
- does NOT rank products
- does NOT invent conclusions
- does NOT own cognition

The LLM only:

- verbalizes
- formats language
- converts structured cognition into natural language

All intelligence must remain inside the MIA proprietary architecture.

This architecture must remain:

- LLM-agnostic
- provider-agnostic
- model-independent
- transferable across providers

The system must continue functioning if:

- OpenAI changes models
- Claude changes APIs
- Gemini changes quality
- providers disappear entirely

The intelligence cannot live inside prompts.

The intelligence must live inside:

- Data Layer
- Decision Engine
- Reasoning Engine
- Governance Layers
- Contextual Intelligence
- Confidence Systems
- Behavioral Systems
- Memory Systems
- Market Intelligence Systems

---

# High-Level Architecture

```txt
User Input
↓
Intent Detection
↓
Context Extraction
↓
Priority Mapping
↓
Contextual Weight Calibration
↓
Data Layer Retrieval
↓
Product Resolution
↓
Decision Engine
↓
Proprietary Reasoning Engine
↓
Confidence Engine
↓
Tradeoff Governance
↓
Behavior Engine
↓
LLM Verbalization Layer
↓
Post-Processing Governance
↓
Final Response
```

---

# Architectural Layers

# 1. Data Layer

## Purpose

The Data Layer is the foundation of MIA.

It is the source of truth.

The system must NEVER rely on the LLM for factual product intelligence.

The Data Layer stores:

- structured specs
- aliases
- scores
- reasoning metadata
- contextual fields
- governance signals
- ranking signals
- product relationships
- hierarchy
- long-term value indicators
- market signals

---

## Current Stack

- Supabase
- phone_specs table
- proprietary structured fields
- reasoning-oriented schema
- Google Sheets governance layer

---

## Data Layer Goals

The Data Layer must:

- support contextual reasoning
- support retrieval reliability
- support embeddings
- support intent resolution
- support human reasoning
- support tradeoff analysis
- support future categories
- support provider-independent cognition

---

## Data Layer Principles

### NEVER:

- use LLM-generated fake specs
- rely on prompt memory for product knowledge
- let the LLM improvise factual comparisons
- use fuzzy hallucinated comparisons

### ALWAYS:

- trust structured product intelligence
- retrieve before reasoning
- validate candidates
- ground all reasoning in real structured data

---

# 2. Product Resolution Layer

## Purpose

Resolve user mentions into real products.

This layer exists because humans:

- abbreviate names
- misspell models
- use incomplete names
- use informal language
- compare generations incorrectly

Examples:

```txt
"A73"
"s25"
"iphone 13"
"moto edge"
```

This layer maps user language into:

- canonical products
- aliases
- variants
- generations
- compatible matches

---

# 3. Intent Detection Layer

## Purpose

Understand:

- what the user wants
- what the user fears
- what the user prioritizes
- what the user is optimizing for

Intent must NEVER depend only on keywords.

The system must reason contextually.

---

## Example

User:

```txt
"fico muito fora de casa e jogo bastante"
```

This means:

```txt
priority:
- performance
- battery

hidden fears:
- lag
- instability
- running out of battery
```

The system must detect:

- explicit priorities
- implicit priorities
- hidden emotional context
- usage style
- risk tolerance
- regret probability

---

# 4. Contextual Intelligence Layer

## Purpose

Convert raw intent into contextual weighting.

This layer determines:

- which axes matter most
- which axes are suppressed
- how strongly each category matters
- how tradeoffs should behave

---

## Example

User:

```txt
"jogo bastante"
```

Should increase:

- performance weight
- thermal stability importance
- longevity pressure

Should suppress:

- camera importance
- aesthetic reasoning

---

## Context-to-Argument Bridge

This system converts:

```txt
context
→
argument structure
```

Meaning:

- arguments are not generic
- arguments adapt to user context
- arguments are contextually prioritized

---

# 5. Decision Engine

## Purpose

The Decision Engine determines:

- ranking
- winner
- tradeoffs
- contextual dominance
- recommendation intensity

The LLM NEVER decides this.

---

## Responsibilities

The Decision Engine:

- evaluates contextual scores
- compares weighted priorities
- calculates dominance
- detects close decisions
- determines confidence
- identifies tradeoffs
- suppresses irrelevant axes
- locks recommendation authority

---

## Decision Authority Contract

One of the most important systems in the architecture.

This layer guarantees:

```txt
LLM cannot override the winner.
```

The contract determines:

- decisionIsLocked
- authorityLevel
- confidenceLevel
- canRecommendWinner
- contextual dominance

Example:

```txt
locked_high_confidence
```

means:

- winner already decided
- LLM cannot change outcome
- LLM only explains reasoning

---

# 6. Proprietary Reasoning Engine

## Purpose

Transform structured scores into contextual reasoning.

This layer converts:

```txt
scores
→
human reasoning
```

This is NOT prompt engineering.

This is proprietary cognition.

---

## Responsibilities

The Reasoning Engine:

- interprets scores
- evaluates tradeoffs
- generates reasoning signals
- builds contextual arguments
- creates impact explanations
- determines winner narratives
- generates proprietary reasoning payloads

---

## Specs Impact Translation Engine

This system converts:

```txt
specs
→
human consequences
```

Example:

BAD:

```txt
"Snapdragon 778G"
```

GOOD:

```txt
"less chance of feeling the phone reaching its limit during heavy use"
```

The architecture prioritizes:

```txt
human consequence
before
technical specification
```

---

## Human Impact Expansion Layer

This layer increases:

- experiential reasoning
- emotional realism
- practical consequence mapping
- friction analysis
- long-term sensation reasoning

It transforms:

```txt
"better performance"
```

into:

```txt
"more margin during heavy usage and less sensation of the phone struggling when the workload increases"
```

---

# 7. Tradeoff Governance Layer

## Purpose

Prevent:

- fake dominance
- fake neutrality
- false ties
- exaggerated winners
- misleading reasoning

---

## Dominance Flattening Fix

The system must avoid:

```txt
tradeoff = tie
```

A product may:

- lose battery
- win performance
- still be the correct recommendation

The architecture must preserve:

- contextual dominance
- tradeoff integrity
- recommendation authority

---

## Tradeoff Integrity

The system cannot:

- transform the loser advantage into a winner argument
- distort the real tradeoff
- hide contextual compensation

---

# 8. Behavior Engine

## Purpose

Control HOW MIA communicates.

The Behavior Engine does NOT create reasoning.

It controls:

- tone
- flow
- structure
- assertiveness
- conversational rhythm
- density
- emotional intensity

---

## Responsibilities

The Behavior Engine:

- compresses payloads
- governs dominance expression
- prevents generic language
- prevents spec dumping
- structures conversational flow
- controls response pacing
- shapes MIA personality

---

## Anti-Spec-Dump System

Purpose:

Prevent answers from sounding like:

- YouTube reviews
- benchmark dumps
- spec sheets
- generic AI comparisons

The system prioritizes:

```txt
human consequence
before
technical evidence
```

Specs should appear:

- minimally
- only as supporting evidence
- never as the core argument

---

## Anti-Generic Language Enforcement

Prevent phrases like:

- “better performance”
- “great option”
- “superior experience”
- “ideal choice”
- “equipped with”
- “offers superior performance”

The system must sound:

- contextual
- human
- practical
- experiential
- strategic

---

# 9. Confidence Engine

## Purpose

Determine:

- how confident MIA is
- how assertive the recommendation should be
- how aggressively the system should recommend

---

## Confidence Levels

Examples:

```txt
low
medium
high
locked_high_confidence
```

Confidence affects:

- wording
- dominance
- assertiveness
- recommendation strength
- tradeoff framing

---

# 10. Memory Systems

## Future Architecture

MIA will include:

- conversational memory
- preference memory
- purchase history memory
- regret tracking
- behavioral patterns
- long-term satisfaction tracking

---

# 11. Market Intelligence Layer

## Future Architecture

MIA will evolve beyond static product reasoning.

Future systems:

- market timing
- price intelligence
- risk analysis
- launch prediction
- depreciation tracking
- opportunity detection
- purchase timing intelligence

---

# 12. Commercial Intelligence Layer

## Future Architecture

MIA will eventually reason about:

- value per money
- opportunity cost
- price windows
- future discounts
- resale value
- long-term ownership value
- ecosystem lock-in

---

# 13. Multi-Category Expansion

## Long-Term Goal

The architecture is designed to expand beyond smartphones.

Future categories:

- laptops
- TVs
- tablets
- appliances
- gaming devices
- vehicles
- services
- financial products

The architecture must remain:

```txt
category-agnostic
```

while keeping:

```txt
vertical reasoning quality
```

---

# Engineering Philosophy

# The system must be:

- modular
- governable
- explainable
- provider-independent
- context-driven
- reasoning-first
- architecture-first
- anti-hardcode
- anti-template
- anti-prompt-dependency

---

# What MIA Is NOT

MIA is NOT:

- a GPT wrapper
- a prompt collection
- a recommendation chatbot
- a static rules engine
- a benchmark responder
- a generic assistant
- a simple comparison app

---

# What MIA IS

MIA IS:

- a proprietary decision architecture
- a contextual reasoning engine
- a vertical AI infrastructure
- a cognitive commerce system
- an intelligent purchase consultant
- a trust layer for purchasing decisions

---

# Core Non-Negotiable Rule

```txt
MIA owns the intelligence.
The LLM only verbalizes.
```

This rule must NEVER be violated.

Every future engine, layer, feature, prompt, refactor, or system must preserve this architecture.

If a future implementation:

- moves cognition into prompts
- lets the LLM decide
- depends on provider-specific behavior
- creates hardcoded chatbot logic
- turns reasoning into templates

then the architecture is being violated.

The architecture itself is the product.

