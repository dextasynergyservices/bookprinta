/// <reference types="jest" />
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { AddressesService } from "./addresses.service.js";

const mockPrismaService = {
  address: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  order: {
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe("AddressesService", () => {
  let service: AddressesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AddressesService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<AddressesService>(AddressesService);
    jest.resetAllMocks();
  });

  describe("findMyAddresses", () => {
    it("returns the authenticated user's saved addresses as serialized API payloads", async () => {
      mockPrismaService.address.findMany.mockResolvedValue([
        {
          id: "cmaddress555555555555555555555",
          fullName: "Grace Bello",
          phoneNumber: "+2348098765432",
          street: "7 Admiralty Way",
          city: "Lekki",
          state: "Lagos",
          country: "Nigeria",
          zipCode: "106104",
          isDefault: true,
          createdAt: new Date("2026-03-12T09:00:00.000Z"),
          updatedAt: new Date("2026-03-13T09:00:00.000Z"),
        },
        {
          id: "cmaddress666666666666666666666",
          fullName: "Ada Okafor",
          phoneNumber: "+2348012345678",
          street: "14 Marina Road",
          city: "Lagos",
          state: "Lagos",
          country: "Nigeria",
          zipCode: null,
          isDefault: false,
          createdAt: new Date("2026-03-10T09:00:00.000Z"),
          updatedAt: new Date("2026-03-11T09:00:00.000Z"),
        },
      ]);

      await expect(service.findMyAddresses("cmuser111111111111111111111111")).resolves.toEqual({
        items: [
          {
            id: "cmaddress555555555555555555555",
            fullName: "Grace Bello",
            phoneNumber: "+2348098765432",
            street: "7 Admiralty Way",
            city: "Lekki",
            state: "Lagos",
            country: "Nigeria",
            zipCode: "106104",
            isDefault: true,
            createdAt: "2026-03-12T09:00:00.000Z",
            updatedAt: "2026-03-13T09:00:00.000Z",
          },
          {
            id: "cmaddress666666666666666666666",
            fullName: "Ada Okafor",
            phoneNumber: "+2348012345678",
            street: "14 Marina Road",
            city: "Lagos",
            state: "Lagos",
            country: "Nigeria",
            zipCode: null,
            isDefault: false,
            createdAt: "2026-03-10T09:00:00.000Z",
            updatedAt: "2026-03-11T09:00:00.000Z",
          },
        ],
      });

      expect(mockPrismaService.address.findMany).toHaveBeenCalledWith({
        where: { userId: "cmuser111111111111111111111111" },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
        select: expect.any(Object),
      });
    });
  });

  describe("createAddress", () => {
    it("marks the first saved address as default even when isDefault is omitted", async () => {
      const tx = {
        address: {
          count: jest.fn().mockResolvedValue(0),
          updateMany: jest.fn(),
          create: jest.fn().mockResolvedValue({
            id: "cmaddress111111111111111111111",
            fullName: "Ada Okafor",
            phoneNumber: "+2348012345678",
            street: "14 Marina Road",
            city: "Lagos",
            state: "Lagos",
            country: "Nigeria",
            zipCode: "101001",
            isDefault: true,
            createdAt: new Date("2026-03-12T09:00:00.000Z"),
            updatedAt: new Date("2026-03-12T09:00:00.000Z"),
          }),
        },
      };
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (trx: typeof tx) => unknown) => callback(tx)
      );

      const result = await service.createAddress("cmuser111111111111111111111111", {
        fullName: "Ada Okafor",
        phoneNumber: "+2348012345678",
        street: "14 Marina Road",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        zipCode: "101001",
      });

      expect(tx.address.updateMany).not.toHaveBeenCalled();
      expect(tx.address.create).toHaveBeenCalledWith({
        data: {
          userId: "cmuser111111111111111111111111",
          fullName: "Ada Okafor",
          phoneNumber: "+2348012345678",
          street: "14 Marina Road",
          city: "Lagos",
          state: "Lagos",
          country: "Nigeria",
          zipCode: "101001",
          isDefault: true,
        },
        select: expect.any(Object),
      });
      expect(result).toEqual({
        id: "cmaddress111111111111111111111",
        fullName: "Ada Okafor",
        phoneNumber: "+2348012345678",
        street: "14 Marina Road",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        zipCode: "101001",
        isDefault: true,
        createdAt: "2026-03-12T09:00:00.000Z",
        updatedAt: "2026-03-12T09:00:00.000Z",
      });
    });

    it("demotes the previous default when a new address is explicitly created as default", async () => {
      const tx = {
        address: {
          count: jest.fn().mockResolvedValue(2),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({
            id: "cmaddress777777777777777777777",
            fullName: "Grace Bello",
            phoneNumber: "+2348098765432",
            street: "7 Admiralty Way",
            city: "Lekki",
            state: "Lagos",
            country: "Nigeria",
            zipCode: "106104",
            isDefault: true,
            createdAt: new Date("2026-03-13T09:00:00.000Z"),
            updatedAt: new Date("2026-03-13T09:00:00.000Z"),
          }),
        },
      };
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (trx: typeof tx) => unknown) => callback(tx)
      );

      await expect(
        service.createAddress("cmuser111111111111111111111111", {
          fullName: "Grace Bello",
          phoneNumber: "+2348098765432",
          street: "7 Admiralty Way",
          city: "Lekki",
          state: "Lagos",
          country: "Nigeria",
          zipCode: "106104",
          isDefault: true,
        })
      ).resolves.toMatchObject({
        id: "cmaddress777777777777777777777",
        isDefault: true,
      });

      expect(tx.address.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "cmuser111111111111111111111111",
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    });
  });

  describe("updateAddress", () => {
    it("promotes the updated address to default and demotes the previous default", async () => {
      mockPrismaService.address.findFirst.mockResolvedValueOnce({
        id: "cmaddress888888888888888888888",
        fullName: "Ada Okafor",
        phoneNumber: "+2348012345678",
        street: "14 Marina Road",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        zipCode: "101001",
        isDefault: false,
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        updatedAt: new Date("2026-03-11T09:00:00.000Z"),
      });

      const tx = {
        address: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({
            id: "cmaddress888888888888888888888",
            fullName: "Ada Okafor",
            phoneNumber: "+2348012345678",
            street: "14 Marina Road",
            city: "Abuja",
            state: "FCT",
            country: "Nigeria",
            zipCode: "900001",
            isDefault: true,
            createdAt: new Date("2026-03-10T09:00:00.000Z"),
            updatedAt: new Date("2026-03-13T09:00:00.000Z"),
          }),
        },
      };
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (trx: typeof tx) => unknown) => callback(tx)
      );

      await expect(
        service.updateAddress("cmuser111111111111111111111111", "cmaddress888888888888888888888", {
          city: "Abuja",
          state: "FCT",
          zipCode: "900001",
          isDefault: true,
        })
      ).resolves.toEqual({
        id: "cmaddress888888888888888888888",
        fullName: "Ada Okafor",
        phoneNumber: "+2348012345678",
        street: "14 Marina Road",
        city: "Abuja",
        state: "FCT",
        country: "Nigeria",
        zipCode: "900001",
        isDefault: true,
        createdAt: "2026-03-10T09:00:00.000Z",
        updatedAt: "2026-03-13T09:00:00.000Z",
      });

      expect(tx.address.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "cmuser111111111111111111111111",
          isDefault: true,
          NOT: {
            id: "cmaddress888888888888888888888",
          },
        },
        data: {
          isDefault: false,
        },
      });
      expect(tx.address.update).toHaveBeenCalledWith({
        where: { id: "cmaddress888888888888888888888" },
        data: {
          city: "Abuja",
          state: "FCT",
          zipCode: "900001",
          isDefault: true,
        },
        select: expect.any(Object),
      });
    });

    it("throws NotFoundException when updating an address the user does not own", async () => {
      mockPrismaService.address.findFirst.mockResolvedValue(null);

      const error = await service
        .updateAddress("cmuser111111111111111111111111", "cmaddress999999999999999999999", {
          city: "Abuja",
        })
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.message).toBe('Address "cmaddress999999999999999999999" not found');
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("deleteAddress", () => {
    it("throws ConflictException when the address is already linked to an order", async () => {
      mockPrismaService.address.findFirst.mockResolvedValue({
        id: "cmaddress222222222222222222222",
        fullName: "Ada Okafor",
        phoneNumber: "+2348012345678",
        street: "14 Marina Road",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        zipCode: "101001",
        isDefault: false,
        createdAt: new Date("2026-03-11T09:00:00.000Z"),
        updatedAt: new Date("2026-03-11T09:00:00.000Z"),
      });
      mockPrismaService.order.count.mockResolvedValue(1);

      const error = await service
        .deleteAddress("cmuser111111111111111111111111", "cmaddress222222222222222222222")
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
      expect(error.message).toBe(
        "This address is already linked to an active or historical order and cannot be deleted."
      );
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it("maps a delete foreign-key race to the same ConflictException", async () => {
      mockPrismaService.address.findFirst.mockResolvedValueOnce({
        id: "cmaddressrace11111111111111111",
        fullName: "Ada Okafor",
        phoneNumber: "+2348012345678",
        street: "14 Marina Road",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        zipCode: "101001",
        isDefault: false,
        createdAt: new Date("2026-03-11T09:00:00.000Z"),
        updatedAt: new Date("2026-03-11T09:00:00.000Z"),
      });
      mockPrismaService.order.count.mockResolvedValue(0);
      mockPrismaService.$transaction.mockRejectedValue({ code: "P2003" });

      const error = await service
        .deleteAddress("cmuser111111111111111111111111", "cmaddressrace11111111111111111")
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
      expect(error.message).toBe(
        "This address is already linked to an active or historical order and cannot be deleted."
      );
    });

    it("promotes the next address when deleting the current default address", async () => {
      mockPrismaService.address.findFirst.mockResolvedValueOnce({
        id: "cmaddress333333333333333333333",
        fullName: "Ada Okafor",
        phoneNumber: "+2348012345678",
        street: "14 Marina Road",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        zipCode: "101001",
        isDefault: true,
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        updatedAt: new Date("2026-03-12T08:00:00.000Z"),
      });
      mockPrismaService.order.count.mockResolvedValue(0);
      const tx = {
        address: {
          delete: jest.fn().mockResolvedValue({
            id: "cmaddress333333333333333333333",
          }),
          findFirst: jest.fn().mockResolvedValue({
            id: "cmaddress444444444444444444444",
          }),
          update: jest.fn().mockResolvedValue({
            id: "cmaddress444444444444444444444",
          }),
        },
      };
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (trx: typeof tx) => unknown) => callback(tx)
      );

      await expect(
        service.deleteAddress("cmuser111111111111111111111111", "cmaddress333333333333333333333")
      ).resolves.toEqual({
        id: "cmaddress333333333333333333333",
        deleted: true,
      });

      expect(tx.address.delete).toHaveBeenCalledWith({
        where: { id: "cmaddress333333333333333333333" },
      });
      expect(tx.address.findFirst).toHaveBeenCalledWith({
        where: { userId: "cmuser111111111111111111111111" },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      expect(tx.address.update).toHaveBeenCalledWith({
        where: { id: "cmaddress444444444444444444444" },
        data: {
          isDefault: true,
        },
      });
    });
  });
});
