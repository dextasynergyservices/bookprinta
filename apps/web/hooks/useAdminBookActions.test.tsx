import { renderHook } from "@testing-library/react";
import {
  AdminBookConflictError,
  downloadAdminBookFile,
  downloadAdminBookVersionFile,
  useAdminBookHtmlUploadMutation,
  useAdminBookRejectMutation,
  useAdminBookStatusMutation,
  validateAdminBookHtmlFile,
} from "./useAdminBookActions";
import { adminBooksQueryKeys } from "./useAdminBooks";

const useMutationMock = jest.fn();
const invalidateQueriesMock = jest.fn();
const originalXmlHttpRequest = global.XMLHttpRequest;

jest.mock("./useAdminBooks", () => ({
  adminBooksQueryKeys: {
    all: ["admin", "books"],
    detail: (bookId: string) => ["admin", "books", "detail", bookId],
  },
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => {
    useMutationMock(options);
    return options;
  },
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

type MutationOptionsShape = {
  mutationFn: (input: unknown) => Promise<unknown>;
  onSuccess?: () => Promise<void>;
};

describe("useAdminBookActions", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    invalidateQueriesMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    global.XMLHttpRequest = originalXmlHttpRequest;
  });

  it("validates admin HTML uploads by extension and size", () => {
    expect(
      validateAdminBookHtmlFile(new File(["<p>Hello</p>"], "manual.html", { type: "text/html" }))
    ).toBeNull();
    expect(
      validateAdminBookHtmlFile(new File(["hello"], "notes.txt", { type: "text/plain" }))
    ).toBe("unsupported");
    expect(validateAdminBookHtmlFile(new File([], "manual.html", { type: "text/html" }))).toBe(
      "empty"
    );
    expect(
      validateAdminBookHtmlFile(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "manual.html", { type: "text/html" })
      )
    ).toBe("size");
  });

  it("sends status updates through the admin books status endpoint and invalidates detail/list", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        bookId: "cm1111111111111111111111111",
        previousStatus: "FORMATTING_REVIEW",
        nextStatus: "PREVIEW_READY",
        displayStatus: "PREVIEW_READY",
        statusSource: "production",
        bookVersion: 4,
        updatedAt: "2026-03-13T09:00:00.000Z",
        audit: {
          auditId: "audit_1",
          action: "ADMIN_BOOK_STATUS_UPDATED",
          entityType: "BOOK",
          entityId: "cm1111111111111111111111111",
          recordedAt: "2026-03-13T09:00:00.000Z",
          recordedBy: "admin_1",
          note: null,
          reason: "Ready for preview",
        },
      }),
    } as unknown as Response);

    renderHook(() => useAdminBookStatusMutation("cm1111111111111111111111111"));
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = (await options.mutationFn({
      nextStatus: "PREVIEW_READY",
      expectedVersion: 3,
      reason: "Ready for preview",
    })) as { nextStatus: string };

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/books/cm1111111111111111111111111/status"),
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      nextStatus: "PREVIEW_READY",
      expectedVersion: 3,
      reason: "Ready for preview",
    });
    expect(result.nextStatus).toBe("PREVIEW_READY");

    await options.onSuccess?.();

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminBooksQueryKeys.detail("cm1111111111111111111111111"),
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminBooksQueryKeys.all,
    });
  });

  it("maps 409 status conflicts to AdminBookConflictError", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: jest.fn().mockResolvedValue({
        message: "Book was updated by another admin. Refresh and try again.",
      }),
    } as unknown as Response);

    renderHook(() => useAdminBookStatusMutation("cm1111111111111111111111111"));
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    await expect(
      options.mutationFn({
        nextStatus: "PREVIEW_READY",
        expectedVersion: 3,
      })
    ).rejects.toBeInstanceOf(AdminBookConflictError);
  });

  it("submits manuscript rejections through the admin reject endpoint", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        bookId: "cm1111111111111111111111111",
        previousStatus: "FORMATTING",
        nextStatus: "REJECTED",
        displayStatus: "REJECTED",
        statusSource: "manuscript",
        bookVersion: 5,
        rejectionReason: "Please fix the chapter headings.",
        rejectedAt: "2026-03-13T09:15:00.000Z",
        audit: {
          auditId: "audit_reject",
          action: "ADMIN_BOOK_REJECTED",
          entityType: "BOOK",
          entityId: "cm1111111111111111111111111",
          recordedAt: "2026-03-13T09:15:00.000Z",
          recordedBy: "admin_1",
          note: null,
          reason: "Please fix the chapter headings.",
        },
      }),
    } as unknown as Response);

    renderHook(() => useAdminBookRejectMutation("cm1111111111111111111111111"));
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = (await options.mutationFn({
      expectedVersion: 4,
      rejectionReason: "Please fix the chapter headings.",
    })) as { nextStatus: string };

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/books/cm1111111111111111111111111/reject"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
    expect(result.nextStatus).toBe("REJECTED");
  });

  it("runs the authorize-upload-finalize HTML fallback flow and invalidates detail/list", async () => {
    const file = new File(["<p>Hello</p>"], "manual.html", { type: "text/html" });

    class MockXMLHttpRequest {
      static DONE = 4;

      upload = {
        onprogress: null as
          | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
          | null,
      };
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      onreadystatechange: (() => void) | null = null;
      readyState = 0;
      status = 0;
      responseText = "";
      open = jest.fn();

      send() {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 });
        this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
        this.status = 200;
        this.responseText = JSON.stringify({
          secure_url: "https://example.com/uploaded.html",
          public_id: "html_public_1",
        });
        this.readyState = 4;
        this.onreadystatechange?.();
      }
    }

    global.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          action: "authorize",
          upload: {
            signature: "sig_123",
            timestamp: 123456,
            cloudName: "demo",
            apiKey: "key_123",
            folder: "bookprinta/admin/books/book_1",
            resourceType: "raw",
            publicId: "html_public_1",
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          action: "finalize",
          bookId: "cm1111111111111111111111111",
          file: {
            id: "file_html_1",
            fileType: "CLEANED_HTML",
            url: "https://example.com/uploaded.html",
            fileName: "manual.html",
            fileSize: 123,
            mimeType: "text/html",
            version: 2,
            createdBy: "admin_1",
            createdAt: "2026-03-13T09:30:00.000Z",
          },
          status: "FORMATTED",
          productionStatus: null,
          displayStatus: "FORMATTED",
          statusSource: "manuscript",
          bookVersion: 5,
          queuedJob: {
            queue: "page-count",
            name: "count-pages",
            jobId: "page-count:1",
          },
        }),
      } as unknown as Response);

    const onProgress = jest.fn();
    renderHook(() => useAdminBookHtmlUploadMutation("cm1111111111111111111111111"));
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    const result = (await options.mutationFn({
      file,
      expectedVersion: 4,
      onProgress,
    })) as { action: string };

    expect(onProgress).toHaveBeenCalledWith(40);
    expect(onProgress).toHaveBeenCalledWith(100);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/api/v1/admin/books/cm1111111111111111111111111/upload-html"),
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "authorize",
      fileName: "manual.html",
      fileSize: file.size,
      mimeType: "text/html",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      action: "finalize",
      expectedVersion: 4,
      fileName: "manual.html",
      fileSize: file.size,
      mimeType: "text/html",
      secureUrl: "https://example.com/uploaded.html",
      publicId: "html_public_1",
    });
    expect(result.action).toBe("finalize");

    await options.onSuccess?.();

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminBooksQueryKeys.detail("cm1111111111111111111111111"),
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: adminBooksQueryKeys.all,
    });
  });

  it("downloads protected admin book files with credentials", async () => {
    const createObjectUrlMock = jest.fn().mockReturnValue("blob:download");
    const revokeObjectUrlMock = jest.fn();
    const clickMock = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectUrlMock,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(["<p>Hello</p>"], { type: "text/html" })),
      headers: {
        get: jest.fn().mockReturnValue('attachment; filename="manual.html"'),
      },
    } as unknown as Response);

    await downloadAdminBookFile({
      bookId: "cm1111111111111111111111111",
      fileType: "cleaned",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/books/cm1111111111111111111111111/download/cleaned"),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
    );
    expect(createObjectUrlMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:download");

    clickMock.mockRestore();
  });

  it("downloads the final clean PDF from the admin endpoint", async () => {
    const createObjectUrlMock = jest.fn().mockReturnValue("blob:final-pdf");
    const revokeObjectUrlMock = jest.fn();
    const clickMock = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectUrlMock,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
      headers: {
        get: jest.fn().mockReturnValue('attachment; filename="manual-final.pdf"'),
      },
    } as unknown as Response);

    await downloadAdminBookFile({
      bookId: "cm1111111111111111111111111",
      fileType: "final-pdf",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/admin/books/cm1111111111111111111111111/download/final-pdf"),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
    );
    expect(createObjectUrlMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:final-pdf");

    clickMock.mockRestore();
  });

  it("downloads a specific admin book file version with credentials", async () => {
    const createObjectUrlMock = jest.fn().mockReturnValue("blob:file-version");
    const revokeObjectUrlMock = jest.fn();
    const clickMock = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectUrlMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectUrlMock,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: jest.fn().mockResolvedValue(
        new Blob(["docx"], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      ),
      headers: {
        get: jest
          .fn()
          .mockReturnValue('attachment; filename="THE MINISTRY OF THE SPIRIT - FINAL EDIT.docx"'),
      },
    } as unknown as Response);

    await downloadAdminBookVersionFile({
      bookId: "cm1111111111111111111111111",
      fileId: "cm2222222222222222222222222",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v1/admin/books/cm1111111111111111111111111/files/cm2222222222222222222222222/download"
      ),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
    );
    expect(createObjectUrlMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:file-version");

    clickMock.mockRestore();
  });
});
