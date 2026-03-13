/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { BooksController } from "./books.controller.js";
import { BooksService } from "./books.service.js";

const booksServiceMock = {
  getUserBookReprintConfig: jest.fn(),
};

describe("BooksController", () => {
  let controller: BooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BooksController],
      providers: [
        {
          provide: BooksService,
          useValue: booksServiceMock,
        },
      ],
    }).compile();

    controller = module.get<BooksController>(BooksController);
    jest.resetAllMocks();
  });

  it("delegates GET /books/:id/reprint-config to the service for the current user", async () => {
    const params = { id: "cmbook11111111111111111111111" } as const;
    booksServiceMock.getUserBookReprintConfig.mockResolvedValue({
      bookId: params.id,
      canReprintSame: true,
      disableReason: null,
      finalPdfUrlPresent: true,
      pageCount: 192,
      minCopies: 25,
      defaultBookSize: "A5",
      defaultPaperColor: "white",
      defaultLamination: "gloss",
      allowedBookSizes: ["A4", "A5", "A6"],
      allowedPaperColors: ["white", "cream"],
      allowedLaminations: ["matt", "gloss"],
      costPerPageBySize: {
        A4: 20,
        A5: 10,
        A6: 5,
      },
      enabledPaymentProviders: ["PAYSTACK", "STRIPE"],
    });

    await expect(
      controller.getBookReprintConfig("cmuser111111111111111111111111", params)
    ).resolves.toEqual({
      bookId: params.id,
      canReprintSame: true,
      disableReason: null,
      finalPdfUrlPresent: true,
      pageCount: 192,
      minCopies: 25,
      defaultBookSize: "A5",
      defaultPaperColor: "white",
      defaultLamination: "gloss",
      allowedBookSizes: ["A4", "A5", "A6"],
      allowedPaperColors: ["white", "cream"],
      allowedLaminations: ["matt", "gloss"],
      costPerPageBySize: {
        A4: 20,
        A5: 10,
        A6: 5,
      },
      enabledPaymentProviders: ["PAYSTACK", "STRIPE"],
    });

    expect(booksServiceMock.getUserBookReprintConfig).toHaveBeenCalledWith(
      "cmuser111111111111111111111111",
      params.id
    );
  });
});
