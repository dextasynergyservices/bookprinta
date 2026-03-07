import {
  normalizeBookFontSize,
  normalizeBookPageSize,
  validateManuscriptFile,
} from "./useManuscriptUpload";

describe("useManuscriptUpload helpers", () => {
  it("normalizes supported page sizes", () => {
    expect(normalizeBookPageSize("A4")).toBe("A4");
    expect(normalizeBookPageSize("A5")).toBe("A5");
    expect(normalizeBookPageSize("LETTER")).toBeNull();
  });

  it("normalizes supported font sizes", () => {
    expect(normalizeBookFontSize(11)).toBe(11);
    expect(normalizeBookFontSize(12)).toBe(12);
    expect(normalizeBookFontSize(14)).toBe(14);
    expect(normalizeBookFontSize(10)).toBeNull();
  });

  it("validates manuscript files for type and size", () => {
    const validDocx = new File(["hello"], "book.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "book.pdf", {
      type: "application/pdf",
    });
    const invalidType = new File(["hello"], "book.txt", { type: "text/plain" });

    expect(validateManuscriptFile(validDocx)).toBeNull();
    expect(validateManuscriptFile(tooLarge)).toBe("size");
    expect(validateManuscriptFile(invalidType)).toBe("unsupported");
  });
});
