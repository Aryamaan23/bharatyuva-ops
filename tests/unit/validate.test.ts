import { describe, expect, it } from "vitest";
import { formDefinitionSchema, type Question } from "@/lib/forms/definition";
import { DEFAULT_FORM } from "@/lib/forms/default-form";
import { sanitizeAnswers, validateForm, validateQuestion, wordCount } from "@/lib/forms/validate";

const q = (over: Partial<Question>): Question => ({
  id: "q1",
  type: "short_text",
  label: { en: "Q", hi: "" },
  required: true,
  pii: false,
  ...over,
});

describe("wordCount", () => {
  it("counts words across whitespace and Devanagari", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  one   two\nthree ")).toBe(3);
    expect(wordCount("मैं नीति में रुचि रखता हूँ")).toBe(6);
  });
});

describe("validateQuestion", () => {
  it("enforces required, word limits and length", () => {
    expect(validateQuestion(q({}), "")).toBe("required");
    expect(validateQuestion(q({ required: false }), "")).toBeNull();
    expect(validateQuestion(q({ type: "long_text", wordLimit: 3 }), "one two three four")).toBe("too_many_words");
    expect(validateQuestion(q({ type: "long_text", wordLimit: 3 }), "one two three")).toBeNull();
    expect(validateQuestion(q({ maxLength: 5 }), "abcdef")).toBe("too_long");
  });

  it("validates email, phone and date formats", () => {
    expect(validateQuestion(q({ type: "email" }), "not-an-email")).toBe("invalid_email");
    expect(validateQuestion(q({ type: "email" }), "a@b.in")).toBeNull();
    expect(validateQuestion(q({ type: "phone" }), "12345")).toBe("invalid_phone");
    expect(validateQuestion(q({ type: "phone" }), "98765 43210")).toBeNull();
    expect(validateQuestion(q({ type: "date" }), "2001-02-30")).toBe("invalid_date");
    expect(validateQuestion(q({ type: "date" }), "2001-02-28")).toBeNull();
  });

  it("only accepts listed options", () => {
    const options = [
      { value: "a", label: { en: "A", hi: "" } },
      { value: "b", label: { en: "B", hi: "" } },
    ];
    expect(validateQuestion(q({ type: "single_choice", options }), "c")).toBe("invalid_option");
    expect(validateQuestion(q({ type: "multi_choice", options }), ["a", "b"])).toBeNull();
    expect(validateQuestion(q({ type: "multi_choice", options }), ["a", "z"])).toBe("invalid_option");
  });
});

describe("validateForm", () => {
  it("skips required checks for drafts but still flags bad formats", () => {
    const partial = validateForm(DEFAULT_FORM, { phone: "123" }, { partial: true });
    expect(partial).toEqual({ phone: "invalid_phone" });
    const full = validateForm(DEFAULT_FORM, {});
    expect(full.full_name).toBe("required");
  });

  it("drops unknown answers and coerces types", () => {
    const clean = sanitizeAnswers(DEFAULT_FORM, { full_name: "  Asha  ", bogus: "x", discipline: 4 });
    expect(clean).toEqual({ full_name: "Asha" });
  });
});

describe("formDefinitionSchema", () => {
  it("accepts the default form", () => {
    expect(formDefinitionSchema.safeParse(DEFAULT_FORM).success).toBe(true);
  });

  it("rejects duplicate ids and missing name/phone mapping", () => {
    const dup = {
      steps: [{ id: "s1", title: { en: "S" }, questions: [q({ id: "a" }), q({ id: "a" })] }],
    };
    const res = formDefinitionSchema.safeParse(dup);
    expect(res.success).toBe(false);
    const messages = res.success ? [] : res.error.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes("Duplicate"))).toBe(true);
    expect(messages.some((m) => m.includes("full_name"))).toBe(true);
  });
});
