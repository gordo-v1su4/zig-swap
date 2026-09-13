import { test, expect } from "bun:test";
import { summarizeRun, differences, validateRun } from "./results-model";
test("summary does not invent missing measurements", () => {
  const row = summarizeRun({
    decks: [{ cuts: 3, onTimeCuts: 2, p95Ms: 12 }, { cuts: 3 }],
    completed: true,
  });
  expect(row.onTime).toBeNull();
  expect(row.p95).toBeNull();
  expect(row.memory).toBeNull();
});
test("cut summary weights event counts and uses worst per-deck latency", () => {
  const row = summarizeRun({
    decks: [
      { cuts: 1, onTimeCuts: 1, p95Ms: 12 },
      { cuts: 9, onTimeCuts: 4, p95Ms: 30 },
    ],
  });
  expect(row.onTime).toBe(50);
  expect(row.p95).toBe(30);
});
test("ramps and capability probes do not claim ordinary cut scores", () => {
  expect(
    summarizeRun({
      mode: "remap",
      decks: [{ cuts: 1, onTimeCuts: 1, p95Ms: 0 }],
    }).p95,
  ).toBeNull();
  expect(
    summarizeRun({ kind: "capability-gate", reason: "timeout" }).state,
  ).toBe("Not scored");
});
test("different media and memory budgets prevent equal-condition comparison", () => {
  expect(
    differences(
      { clips: [{ sha256: "a" }], cacheBudgetBytes: 256 },
      { clips: [{ sha256: "b" }], cacheBudgetBytes: 512 },
    ),
  ).toEqual(["cacheBudgetBytes", "media hashes"]);
});

test("malformed imported reports are rejected before rendering", () => {
  expect(() =>
    validateRun({ kind: "musical-run", backend: "gpu-bank", decks: [null] }),
  ).toThrow();
  expect(() =>
    validateRun({
      kind: "musical-run",
      backend: "gpu-bank",
      decks: [],
      invalid: "oops",
    }),
  ).toThrow();
  expect(() =>
    validateRun({ kind: "capability-gate", backend: "libmedia" }),
  ).not.toThrow();
});
