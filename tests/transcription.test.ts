import { describe, expect, it } from "vitest";

import { isSafeKnowledgeUrl } from "@/services/knowledge.server";

describe("safe media and knowledge URLs", () => {
  it("accepts public http and https URLs", () => {
    expect(isSafeKnowledgeUrl("https://docs.example.com/faq")).toBe(true);
    expect(isSafeKnowledgeUrl("http://example.com/resource")).toBe(true);
  });

  it("rejects local and private network targets", () => {
    expect(isSafeKnowledgeUrl("http://localhost:3000/admin")).toBe(false);
    expect(isSafeKnowledgeUrl("http://127.0.0.1/metadata")).toBe(false);
    expect(isSafeKnowledgeUrl("http://10.0.0.5/internal")).toBe(false);
    expect(isSafeKnowledgeUrl("http://172.16.0.4/internal")).toBe(false);
    expect(isSafeKnowledgeUrl("http://192.168.1.10/internal")).toBe(false);
  });

  it("rejects credentials and unsupported protocols", () => {
    expect(isSafeKnowledgeUrl("https://user:pass@example.com/file")).toBe(false);
    expect(isSafeKnowledgeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeKnowledgeUrl("not-a-url")).toBe(false);
  });
});
