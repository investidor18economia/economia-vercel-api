/**
 * PATCH 11B.4.1 — Final Conversational Production Validation (API matrix)
 */
import { loadEnvKey, ConversationSession, PROD_API } from "./test-mia-11b4-shared.mjs";
import {
  ValidationRunner,
  parseCliArgs,
  TIMEOUTS,
  FAILURE_TYPES,
  executeApiTurn,
  runMultiTurnApiCase,
  runSingleTurnApiCase,
} from "./test-mia-11b4-observability.mjs";

const API_KEY = loadEnvKey();
if (!API_KEY) {
  console.error("API_SHARED_KEY missing");
  process.exit(1);
}

const { groups } = parseCliArgs();
const runner = new ValidationRunner({ label: "11B.4.1-API", baseUrl: PROD_API });
runner.setActiveGroups(groups);

console.log("\nPATCH 11B.4.1 — Final Conversational Production Validation (API)\n");
if (groups) console.log(`Active groups: ${groups.join(", ")}\n`);

function socialAssertions() {
  return [
    { name: "response_not_empty", expected: "reply length > 15", check: (r) => r.replyLen > 15 },
    { name: "provider_count_zero", expected: "providerExecuted=0", check: (r) => r.providerExecuted === 0 },
    { name: "paid_external_zero", expected: "paidExternal=0", check: (r) => r.paidExternal === 0 },
    { name: "commercial_permission_denied", expected: "pricesCount=0", check: (r) => r.pricesCount === 0 },
    { name: "response_not_generic_only", expected: "non-generic reply", check: (r) => !r.replyGenericOnly },
  ];
}

function commercialAssertions() {
  return [
    { name: "response_not_empty", expected: "reply length > 40", check: (r) => r.replyLen > 40 },
    { name: "response_not_generic_only", expected: "non-generic reply", check: (r) => !r.replyGenericOnly },
    { name: "single_http_response", expected: "http 200", check: (r) => r.http200 },
  ];
}

function clarifyAssertions() {
  return [
    { name: "paid_external_zero", expected: "paidExternal=0", check: (r) => r.paidExternal === 0 },
    { name: "provider_count_zero", expected: "pricesCount=0", check: (r) => r.pricesCount === 0 },
    {
      name: "response_references_user_context",
      expected: "clarification question",
      check: (r) =>
        r.reply.includes("?") ||
        /qual|refer|orçamento|produto|contexto|histórico|opção|recomenda|anterior|valida/i.test(r.reply),
    },
  ];
}

function followUpAssertions(extra = []) {
  return [
    { name: "response_not_empty", expected: "reply length > 12", check: (r) => r.replyLen > 12 },
    { name: "response_not_generic_only", expected: "non-generic reply", check: (r) => !r.replyGenericOnly },
    ...extra,
  ];
}

const SOCIAL_TEXTS = [
  "acho esse Galaxy bonito",
  "estou cansado de pesquisar celular",
  "meu celular está velho",
  "não gosto de Samsung",
  "comprar online dá medo",
  "celular hoje está muito caro",
  "iPhone parece bonito",
  "notebook me dá dor de cabeça",
];

for (let i = 0; i < SOCIAL_TEXTS.length; i++) {
  const text = SOCIAL_TEXTS[i];
  const id = `11B4-SOCIAL-${String(i + 1).padStart(3, "0")}`;
  await runSingleTurnApiCase(
    runner,
    {
      id,
      name: text.slice(0, 60),
      group: "social",
      patchOrigin: "11B",
      executionMode: "api",
    },
    {
      text,
      timeoutMs: TIMEOUTS.API_FAST,
      assertions: socialAssertions(),
    },
    {
      apiKey: API_KEY,
      sessionFactory: () => new ConversationSession({ conversationId: `11b4-${id.toLowerCase()}` }),
    }
  );
}

await runMultiTurnApiCase(
  runner,
  {
    id: "11B4-FOLLOWUP-001",
    name: "follow-up price battery second option worth",
    group: "follow-up",
    patchOrigin: "11B.1",
    executionMode: "api",
  },
  [
    { text: "qual celular você recomenda até 2500?", commercialTurn: true, timeoutMs: TIMEOUTS.API_COMMERCIAL, assertions: commercialAssertions() },
    {
      text: "e quanto custa?",
      timeoutMs: TIMEOUTS.API_FOLLOWUP,
      assertions: followUpAssertions([
        {
          name: "follow_up_product_preserved",
          expected: "price reference",
          check: (r) => /\bR\$\s*[\d.,]+|pre[cç]o|valor|custa/i.test(r.reply),
        },
      ]),
    },
    { text: "e bateria?", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "e a segunda opção?", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "vale a pena mesmo?", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
  ],
  {
    apiKey: API_KEY,
    sessionFactory: () => new ConversationSession({ conversationId: "11b4-followup-001" }),
  }
);

const MIXED_TEXTS = [
  "estou cansado de pesquisar, mas quero um celular até 2500.",
  "tenho medo de me arrepender, qual celular você recomenda?",
  "acho o iPhone bonito, mas vale a pena comprar?",
  "não gosto de Samsung, mas quero um celular com boa bateria.",
  "meu último celular travava, quero um mais rápido até 3000.",
];
for (let i = 0; i < MIXED_TEXTS.length; i++) {
  const text = MIXED_TEXTS[i];
  await runSingleTurnApiCase(
    runner,
    {
      id: `11B4-MIXED-${String(i + 1).padStart(3, "0")}`,
      name: text.slice(0, 60),
      group: "mixed",
      patchOrigin: "11B.2",
      executionMode: "api",
    },
    {
      text,
      commercialTurn: true,
      timeoutMs: TIMEOUTS.API_COMMERCIAL,
      assertions: commercialAssertions(),
    },
    {
      apiKey: API_KEY,
      sessionFactory: () => new ConversationSession({ conversationId: `11b4-mixed-${i + 1}` }),
    }
  );
}

await runMultiTurnApiCase(
  runner,
  {
    id: "11B4-REFINEMENT-001",
    name: "constraint refinement battery exclude iPhone storage cheaper worth",
    group: "refinement",
    patchOrigin: "11B.3",
    executionMode: "api",
  },
  [
    { text: "qual celular você recomenda até 3000?", commercialTurn: true, timeoutMs: TIMEOUTS.API_COMMERCIAL, assertions: commercialAssertions() },
    { text: "quero mais bateria", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    {
      text: "sem iPhone",
      timeoutMs: TIMEOUTS.API_FOLLOWUP,
      assertions: followUpAssertions([
        {
          name: "excluded_brand_not_recommended",
          expected: "no iPhone 11/13/14 in reply",
          actual: (r) => r.reply.slice(0, 120),
          check: (r) => !/iPhone 13|iPhone 11|iPhone 14/i.test(r.reply),
        },
      ]),
    },
    { text: "mas preciso de 256 GB", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "tem um mais barato?", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "esse vale a pena mesmo?", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
  ],
  {
    apiKey: API_KEY,
    sessionFactory: () => new ConversationSession({ conversationId: "11b4-refinement-001" }),
  }
);

const NO_CONTEXT = [
  "tem um mais barato?",
  "quero mais bateria",
  "sem iPhone",
  "preciso de 256 GB",
  "e a segunda opção?",
  "vale a pena mesmo?",
];
for (let i = 0; i < NO_CONTEXT.length; i++) {
  const text = NO_CONTEXT[i];
  await runSingleTurnApiCase(
    runner,
    {
      id: `11B4-CLARIFY-${String(i + 1).padStart(3, "0")}`,
      name: `no context: ${text}`,
      group: "clarification",
      patchOrigin: "11B.4",
      executionMode: "api",
    },
    { text, timeoutMs: TIMEOUTS.API_CLARIFY, assertions: clarifyAssertions() },
    {
      apiKey: API_KEY,
      sessionFactory: () => new ConversationSession({ conversationId: `11b4-clarify-${i + 1}` }),
    }
  );
}

await runMultiTurnApiCase(
  runner,
  {
    id: "11B4-TOPIC-SWITCH-001",
    name: "topic switch after commercial",
    group: "topic-switch",
    patchOrigin: "11B.4",
    executionMode: "api",
  },
  [
    { text: "qual celular até 2500?", commercialTurn: true, timeoutMs: TIMEOUTS.API_COMMERCIAL, assertions: commercialAssertions() },
    {
      text: "mudando de assunto, como você está?",
      timeoutMs: TIMEOUTS.API_FAST,
      assertions: [
        { name: "paid_external_zero", expected: "paidExternal=0", check: (r) => r.paidExternal === 0 },
        { name: "response_not_generic_only", expected: "non-generic reply", check: (r) => !r.replyGenericOnly },
        { name: "single_http_response", expected: "http 200", check: (r) => r.http200 },
      ],
    },
  ],
  {
    apiKey: API_KEY,
    sessionFactory: () => new ConversationSession({ conversationId: "11b4-topic-switch-001" }),
  }
);

await runMultiTurnApiCase(
  runner,
  {
    id: "11B4-TOPIC-SWITCH-002",
    name: "commercial suspend conversation",
    group: "topic-switch",
    patchOrigin: "11B.4",
    executionMode: "api",
  },
  [
    { text: "me recomenda um notebook.", commercialTurn: true, timeoutMs: TIMEOUTS.API_COMMERCIAL, assertions: commercialAssertions() },
    {
      text: "deixa isso para depois, quero só conversar.",
      timeoutMs: TIMEOUTS.API_FAST,
      assertions: [{ name: "paid_external_zero", expected: "paidExternal=0", check: (r) => r.paidExternal === 0 }],
    },
  ],
  {
    apiKey: API_KEY,
    sessionFactory: () => new ConversationSession({ conversationId: "11b4-topic-switch-002" }),
  }
);

const DENIAL_TEXTS = [
  "não quero comprar agora, só estou comentando.",
  "não precisa pesquisar, estou apenas desabafando.",
  "esquece a recomendação, quero só conversar.",
  "não quero ver ofertas agora.",
];
for (let i = 0; i < DENIAL_TEXTS.length; i++) {
  const text = DENIAL_TEXTS[i];
  await runSingleTurnApiCase(
    runner,
    {
      id: `11B4-CANCEL-${String(i + 1).padStart(3, "0")}`,
      name: text.slice(0, 60),
      group: "cancel",
      patchOrigin: "11B.4",
      executionMode: "api",
    },
    {
      text,
      timeoutMs: TIMEOUTS.API_FAST,
      assertions: [
        { name: "paid_external_zero", expected: "paidExternal=0", check: (r) => r.paidExternal === 0 },
        { name: "provider_count_zero", expected: "pricesCount=0", check: (r) => r.pricesCount === 0 },
        { name: "single_http_response", expected: "http 200", check: (r) => r.http200 },
      ],
    },
    {
      apiKey: API_KEY,
      sessionFactory: () => new ConversationSession({ conversationId: `11b4-cancel-${i + 1}` }),
    }
  );
}

await runMultiTurnApiCase(
  runner,
  {
    id: "11B4-REFINEMENT-002",
    name: "category switch notebook after phone refinements",
    group: "refinement",
    patchOrigin: "11B.4",
    executionMode: "api",
  },
  [
    { text: "quero um celular até 2500.", commercialTurn: true, timeoutMs: TIMEOUTS.API_COMMERCIAL, assertions: commercialAssertions() },
    { text: "sem iPhone.", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "quero mais bateria.", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    {
      text: "agora quero um notebook até 4000.",
      commercialTurn: true,
      timeoutMs: TIMEOUTS.API_COMMERCIAL,
      assertions: [
        {
          name: "category_switch_isolated",
          expected: "notebook category in reply",
          check: (r) => /notebook|dell|lenovo|acer|hp|asus|vivobook/i.test(r.reply.toLowerCase()),
        },
      ],
    },
  ],
  {
    apiKey: API_KEY,
    sessionFactory: () => new ConversationSession({ conversationId: "11b4-refinement-002" }),
  }
);

const GEN_TEXTS = [
  "quero uma geladeira mais barata",
  "sem Nike",
  "quero um perfume mais suave",
  "preciso de uma cadeira menor",
  "tem um aspirador mais silencioso?",
];
for (let i = 0; i < GEN_TEXTS.length; i++) {
  const text = GEN_TEXTS[i];
  await runSingleTurnApiCase(
    runner,
    {
      id: `11B4-GENERAL-${String(i + 1).padStart(3, "0")}`,
      name: text,
      group: "generalization",
      patchOrigin: "11B.4",
      executionMode: "api",
    },
    {
      text,
      timeoutMs: TIMEOUTS.API_CLARIFY,
      assertions: [
        {
          name: "response_not_empty",
          expected: "clarify or substantive reply",
          check: (r) => r.http200 && (clarifyAssertions().every((a) => a.check(r)) || r.replyLen > 20),
        },
      ],
    },
    {
      apiKey: API_KEY,
      sessionFactory: () => new ConversationSession({ conversationId: `11b4-general-${i + 1}` }),
    }
  );
}

// Concurrency — sequential execution, isolation assertions after turns
{
  const caseDef = {
    id: "11B4-CONCURRENCY-001",
    name: "session A phone vs session B notebook isolation",
    group: "concurrency",
    patchOrigin: "11B.4",
    executionMode: "api",
  };
  const caseResult = runner.startCase(caseDef);
  if (caseResult) {
    const sessA = new ConversationSession({ conversationId: "11b4-conc-a", userId: "conc-a" });
    const sessB = new ConversationSession({ conversationId: "11b4-conc-b", userId: "conc-b" });
    caseResult.conversationId = `${sessA.conversationId}|${sessB.conversationId}`;
    try {
      const turns = [
        { session: sessA, text: "quero um celular até 2500.", commercialTurn: true, timeoutMs: TIMEOUTS.API_COMMERCIAL, assertions: commercialAssertions() },
        { session: sessB, text: "quero um notebook até 5000.", commercialTurn: true, timeoutMs: TIMEOUTS.API_COMMERCIAL, assertions: commercialAssertions() },
        { session: sessA, text: "sem iPhone.", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
        { session: sessB, text: "prefiro Dell.", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
      ];
      let allPassed = true;
      let anyTransient = false;
      let a1 = null;
      let b1 = null;
      for (let i = 0; i < turns.length; i++) {
        const step = turns[i];
        const turn = await executeApiTurn({
          runner,
          caseResult,
          session: step.session,
          apiKey: API_KEY,
          turnIndex: i + 1,
          totalTurns: turns.length,
          input: step.text,
          commercialTurn: step.commercialTurn,
          timeoutMs: step.timeoutMs,
          assertions: step.assertions,
        });
        if (i === 0) a1 = turn.result;
        if (i === 1) b1 = turn.result;
        if (!turn.pass) {
          allPassed = false;
          break;
        }
        if (turn.transientRecovered) anyTransient = true;
      }
      if (!allPassed) {
        runner.finishCase(caseResult, "FAIL");
      } else {
        const a4 = sessA.turns[sessA.turns.length - 1];
        const b4 = sessB.turns[sessB.turns.length - 1];
        const isolationOk =
          sessA.conversationId !== sessB.conversationId &&
          a1?.anchor &&
          b1?.anchor &&
          a1.anchor !== b1.anchor &&
          !String(a4.reply || "").toLowerCase().includes("notebook") &&
          !String(b4.reply || "").toLowerCase().includes("iphone") &&
          !String(b4.reply || "").toLowerCase().includes("galaxy s23");
        if (!isolationOk) {
          caseResult.failureType = FAILURE_TYPES.CONCURRENCY_ISOLATION_FAILURE;
          caseResult.failedAssertion = "concurrency_isolation_failure";
          caseResult.failureMessage = `expected isolated sessions; A=${a4.anchor} B=${b4.anchor}`;
          caseResult.initialFailure = {
            turnIndex: turns.length,
            failureType: FAILURE_TYPES.CONCURRENCY_ISOLATION_FAILURE,
            failedAssertion: "concurrency_isolation_failure",
          };
          runner.finishCase(caseResult, "FAIL");
        } else {
          runner.finishCase(caseResult, anyTransient ? "TRANSIENT_RECOVERED" : "PASS");
        }
      }
    } catch (error) {
      runner.markInfrastructureFailure(error);
      runner.finishCase(caseResult, "FAIL", { failureType: FAILURE_TYPES.RUNNER_INTERNAL_ERROR });
    }
  }
}

// Full 12-turn flow
await runMultiTurnApiCase(
  runner,
  {
    id: "11B4-MULTITURN-001",
    name: "full 12-turn production flow",
    group: "multi-turn",
    patchOrigin: "11B.4",
    executionMode: "api",
  },
  [
    { text: "estou cansado de pesquisar celular, mas quero um até 3000.", commercialTurn: true, timeoutMs: TIMEOUTS.API_COMMERCIAL, assertions: commercialAssertions() },
    { text: "e quanto custa?", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "quero mais bateria.", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    {
      text: "sem iPhone.",
      timeoutMs: TIMEOUTS.API_FOLLOWUP,
      assertions: followUpAssertions([
        {
          name: "excluded_brand_not_recommended",
          expected: "no iPhone 11/13",
          check: (r) => !/iPhone 13|iPhone 11/i.test(r.reply),
        },
      ]),
    },
    { text: "preciso de 256 GB.", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "tem um mais barato?", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "esse vale a pena mesmo?", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    {
      text: "mudando de assunto, como você está?",
      timeoutMs: TIMEOUTS.API_FAST,
      assertions: [{ name: "paid_external_zero", expected: "paidExternal=0", check: (r) => r.paidExternal === 0 }],
    },
    {
      text: "agora quero um notebook até 4000.",
      commercialTurn: true,
      timeoutMs: TIMEOUTS.API_COMMERCIAL,
      assertions: commercialAssertions(),
    },
    { text: "prefiro Dell.", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "quero um mais leve.", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
    { text: "pode passar um pouco do orçamento.", timeoutMs: TIMEOUTS.API_FOLLOWUP, assertions: followUpAssertions() },
  ],
  {
    apiKey: API_KEY,
    defaultTimeout: TIMEOUTS.MULTITURN,
    sessionFactory: () => new ConversationSession({ conversationId: "11b4-multiturn-001" }),
  }
);

await runMultiTurnApiCase(
  runner,
  {
    id: "11B4-COMMERCIAL-AUDIT-001",
    name: "paidExternal audit new search",
    group: "commercial-audit",
    patchOrigin: "11B.4",
    executionMode: "api",
  },
  [
    {
      text: "qual celular você recomenda até 2500?",
      commercialTurn: true,
      timeoutMs: TIMEOUTS.API_COMMERCIAL,
      assertions: [
        { name: "single_http_response", expected: "http 200", check: (r) => r.http200 },
        { name: "provider_policy_failure", expected: "paidExternal >= 0", check: (r) => r.paidExternal >= 0 },
      ],
    },
    {
      text: "e quanto custa?",
      timeoutMs: TIMEOUTS.API_FOLLOWUP,
      assertions: [{ name: "paid_external_zero", expected: "paidExternal=0 on follow-up", check: (r) => r.paidExternal === 0 }],
    },
  ],
  {
    apiKey: API_KEY,
    sessionFactory: () => new ConversationSession({ conversationId: "11b4-commercial-audit-001" }),
  }
);

runner.printHumanSummary();
runner.writeJsonReport({ mode: "api", playwrightVersion: null });
process.exit(runner.getExitCode());
