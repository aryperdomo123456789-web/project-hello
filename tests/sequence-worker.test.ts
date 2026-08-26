import { describe, expect, it } from "vitest";

import {
  mergeContactTags,
  nextSequenceRunAt,
  sequenceEventKey,
} from "@/queue/sequence-worker.server";
import { cosineSimilarity, normalizedCosineSimilarity } from "@/services/embedding.server";

describe("sequence worker primitives", () => {
  it("creates a stable event key per enrollment and step", () => {
    expect(sequenceEventKey("enrollment-1", "step-1")).toBe("sequence:enrollment-1:step:step-1");
    expect(sequenceEventKey("enrollment-1", "step-1")).toBe(
      sequenceEventKey("enrollment-1", "step-1"),
    );
    expect(sequenceEventKey("enrollment-1", "step-1")).not.toBe(
      sequenceEventKey("enrollment-2", "step-1"),
    );
  });

  it("calculates the next run using a non-negative delay", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    expect(nextSequenceRunAt(now, 30).toISOString()).toBe("2026-08-26T12:30:00.000Z");
    expect(nextSequenceRunAt(now, -10).toISOString()).toBe(now.toISOString());
  });

  it("merges tags idempotently and caps the stored list", () => {
    expect(mergeContactTags(["lead", "vip"], " vip ")).toEqual(["lead", "vip"]);
    expect(mergeContactTags(undefined, "novo-lead")).toEqual(["novo-lead"]);
    expect(mergeContactTags(["lead"], "")).toEqual(["lead"]);
    expect(
      mergeContactTags(
        Array.from({ length: 100 }, (_, index) => `tag-${index}`),
        "overflow",
      ),
    ).toHaveLength(100);
  });

  it("scores embeddings with cosine similarity and clamps to a usable range", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(normalizedCosineSimilarity([1, 0], [0, 1])).toBe(0.5);
    expect(cosineSimilarity([1], [1, 0])).toBe(0);
  });
});
