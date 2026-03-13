/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { AddressesController } from "./addresses.controller.js";
import { AddressesService } from "./addresses.service.js";

const addressesServiceMock = {
  findMyAddresses: jest.fn(),
  createAddress: jest.fn(),
  updateAddress: jest.fn(),
  deleteAddress: jest.fn(),
};

describe("AddressesController", () => {
  let controller: AddressesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AddressesController],
      providers: [
        {
          provide: AddressesService,
          useValue: addressesServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AddressesController>(AddressesController);
    jest.resetAllMocks();
  });

  it("delegates GET /addresses to the service for the current user", async () => {
    addressesServiceMock.findMyAddresses.mockResolvedValue({
      items: [
        {
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
        },
      ],
    });

    await expect(controller.findMyAddresses("cmuser111111111111111111111111")).resolves.toEqual({
      items: [
        {
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
        },
      ],
    });

    expect(addressesServiceMock.findMyAddresses).toHaveBeenCalledWith(
      "cmuser111111111111111111111111"
    );
  });

  it("delegates POST /addresses to the service with the validated body", async () => {
    const body = {
      fullName: "Grace Bello",
      phoneNumber: "+2348098765432",
      street: "7 Admiralty Way",
      city: "Lekki",
      state: "Lagos",
      country: "Nigeria",
      zipCode: "106104",
      isDefault: true,
    } as const;
    addressesServiceMock.createAddress.mockResolvedValue({
      id: "cmaddress222222222222222222222",
      ...body,
      createdAt: "2026-03-13T09:00:00.000Z",
      updatedAt: "2026-03-13T09:00:00.000Z",
    });

    await expect(
      controller.createAddress("cmuser111111111111111111111111", body)
    ).resolves.toMatchObject({
      id: "cmaddress222222222222222222222",
      fullName: "Grace Bello",
      isDefault: true,
    });

    expect(addressesServiceMock.createAddress).toHaveBeenCalledWith(
      "cmuser111111111111111111111111",
      body
    );
  });

  it("delegates PATCH /addresses/:id to the service with route params and body", async () => {
    const params = { id: "cmaddress333333333333333333333" } as const;
    const body = {
      city: "Abuja",
      isDefault: true,
    } as const;
    addressesServiceMock.updateAddress.mockResolvedValue({
      id: params.id,
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

    await expect(
      controller.updateAddress("cmuser111111111111111111111111", params, body)
    ).resolves.toMatchObject({
      id: params.id,
      city: "Abuja",
      isDefault: true,
    });

    expect(addressesServiceMock.updateAddress).toHaveBeenCalledWith(
      "cmuser111111111111111111111111",
      params.id,
      body
    );
  });

  it("delegates DELETE /addresses/:id to the service with the owned address id", async () => {
    const params = { id: "cmaddress444444444444444444444" } as const;
    addressesServiceMock.deleteAddress.mockResolvedValue({
      id: params.id,
      deleted: true,
    });

    await expect(
      controller.deleteAddress("cmuser111111111111111111111111", params)
    ).resolves.toEqual({
      id: params.id,
      deleted: true,
    });

    expect(addressesServiceMock.deleteAddress).toHaveBeenCalledWith(
      "cmuser111111111111111111111111",
      params.id
    );
  });
});
