/// <reference types="jest" />

const mockCreateRequestHandler = jest.fn(() => jest.fn());

jest.mock("@expo/server/build/index", () => ({
  createRequestHandler: mockCreateRequestHandler,
}));

describe("Expo Router Lambda adapter request headers", () => {
  const loadInternals = () => {
    jest.resetModules();
    jest.doMock("@expo/server/build/index", () => ({
      createRequestHandler: mockCreateRequestHandler,
    }));

    return require("../../../../packages/infra/lambda/index.js")._internal;
  };

  it("reconstructs the Cookie header from API Gateway v2 cookies", () => {
    const { buildRequestHeaders } = loadInternals();

    const headers = buildRequestHeaders({
      version: "2.0",
      headers: {
        host: "api.hashpass.tech",
      },
      cookies: [
        "__Secure-better-auth.state=oauth-state.signature",
        "other=value",
      ],
    });

    expect(headers.get("cookie")).toBe(
      "__Secure-better-auth.state=oauth-state.signature; other=value",
    );
  });

  it("preserves an explicit Cookie header when API Gateway already provides one", () => {
    const { buildRequestHeaders } = loadInternals();

    const headers = buildRequestHeaders({
      version: "2.0",
      headers: {
        Cookie: "existing=value",
      },
      cookies: ["ignored=value"],
    });

    expect(headers.get("cookie")).toBe("existing=value");
  });

  it("allows credentialed CORS requests from the dev frontend", () => {
    const { applyCorsHeaders } = loadInternals();

    const headers = applyCorsHeaders(
      {},
      {
        headers: {
          origin: "https://dev.hashpass.tech",
        },
      },
    );

    expect(headers["access-control-allow-origin"]).toBe(
      "https://dev.hashpass.tech",
    );
    expect(headers["access-control-allow-credentials"]).toBe("true");
  });
});
