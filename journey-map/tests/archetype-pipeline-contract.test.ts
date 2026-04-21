import { test } from "node:test";
import { strict as assert } from "node:assert";
import type {
  ArchetypePipelineEvent,
  ArchetypeRendererProps,
} from "../lib/archetypes/types";
import type { GenerateEvent } from "../lib/pipeline/events";

// These tests pin down the archetype pipeline's interaction surface so future
// refactors don't drift from the SSE event protocol the route depends on.

test("ArchetypePipelineEvent is a structural subset of GenerateEvent", () => {
  const events: ArchetypePipelineEvent[] = [
    { phase: "subject_id", current: 1, total: 2, sourceLabel: "a" },
    { phase: "extracting", current: 1, total: 2, sourceLabel: "a" },
    { phase: "synthesizing" },
    { phase: "critiquing" },
    { phase: "critiquing", fidelity_score: 0.87 },
    { phase: "revising", reason: "needs tightening" },
  ];
  for (const e of events) {
    const widened: GenerateEvent = e;
    assert.ok(widened.phase === e.phase);
  }
});

test("ArchetypeRendererProps<T> flows T through doc & onChange", () => {
  type Fake = { foo: string };
  const props: ArchetypeRendererProps<Fake> = {
    doc: { foo: "hello" },
    onChange: (next: Fake) => {
      assert.equal(typeof next.foo, "string");
    },
    selection: null,
    onSelectionChange: () => {},
  };
  assert.equal(props.doc.foo, "hello");
});
