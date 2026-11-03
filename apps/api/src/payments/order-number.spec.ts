/// <reference types="jest" />
import { ServiceUnavailableException } from "@nestjs/common";
import { generateOrderNumber } from "./order-number.js";

function txWith(findUnique: jest.Mock) {
  return { order: { findUnique } } as never;
}

describe("generateOrderNumber", () => {
  it("returns BP-<year>-<up to 6 uppercase base36 chars> when it is free", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);

    const orderNumber = await generateOrderNumber(txWith(findUnique));

    expect(orderNumber).toMatch(new RegExp(`^BP-${new Date().getFullYear()}-[0-9A-Z]{1,6}$`));
    expect(findUnique).toHaveBeenCalledWith({
      where: { orderNumber },
      select: { id: true },
    });
  });

  it("tries again when the number is already taken", async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ id: "existing" })
      .mockResolvedValueOnce(null);

    await generateOrderNumber(txWith(findUnique));

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("gives up after six collisions", async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: "existing" });

    await expect(generateOrderNumber(txWith(findUnique))).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
    expect(findUnique).toHaveBeenCalledTimes(6);
  });
});
