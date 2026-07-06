import { OpenApiGeneratorV31, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  createCredentialRequestSchema,
  createCredentialResponseSchema,
  errorResponseSchema,
  evidenceItemSchema,
  healthResponseSchema,
  currentUserResponseSchema,
  listCredentialsResponseSchema,
  logoutResponseSchema,
  proposedOrderSchema,
  riskResultSchema,
  signInRequestSchema,
  signInResponseSchema,
  setupFirstAdminRequestSchema,
  setupFirstAdminResponseSchema,
  setupStatusResponseSchema,
} from "./schemas.js";

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

const jsonContent = <TSchema extends z.ZodType>(schema: TSchema) => ({
  "application/json": {
    schema,
  },
});

export function createOpenApiDocument(): OpenApiDocument {
  const registry = new OpenAPIRegistry();

  const HealthResponse = registry.register("HealthResponse", healthResponseSchema);
  const ErrorResponse = registry.register("ErrorResponse", errorResponseSchema);
  const CurrentUserResponse = registry.register("CurrentUserResponse", currentUserResponseSchema);
  const CreateCredentialRequest = registry.register(
    "CreateCredentialRequest",
    createCredentialRequestSchema,
  );
  const CreateCredentialResponse = registry.register(
    "CreateCredentialResponse",
    createCredentialResponseSchema,
  );
  const ListCredentialsResponse = registry.register(
    "ListCredentialsResponse",
    listCredentialsResponseSchema,
  );
  const LogoutResponse = registry.register("LogoutResponse", logoutResponseSchema);
  const SignInRequest = registry.register("SignInRequest", signInRequestSchema);
  const SignInResponse = registry.register("SignInResponse", signInResponseSchema);
  const SetupStatusResponse = registry.register("SetupStatusResponse", setupStatusResponseSchema);
  const SetupFirstAdminRequest = registry.register(
    "SetupFirstAdminRequest",
    setupFirstAdminRequestSchema,
  );
  const SetupFirstAdminResponse = registry.register(
    "SetupFirstAdminResponse",
    setupFirstAdminResponseSchema,
  );
  registry.register("EvidenceItem", evidenceItemSchema);
  registry.register("ProposedOrder", proposedOrderSchema);
  registry.register("RiskResult", riskResultSchema);

  registry.registerPath({
    method: "get",
    path: "/api/health",
    summary: "Return API health status.",
    tags: ["Platform"],
    responses: {
      200: {
        description: "The API process is healthy.",
        content: jsonContent(HealthResponse),
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/setup/status",
    summary: "Return whether first-admin setup is required.",
    tags: ["Setup"],
    responses: {
      200: {
        description: "First-admin setup status.",
        content: jsonContent(SetupStatusResponse),
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/setup/first-admin",
    summary: "Create the first local admin user.",
    tags: ["Setup"],
    request: {
      body: {
        required: true,
        content: jsonContent(SetupFirstAdminRequest),
      },
    },
    responses: {
      201: {
        description: "First local admin created.",
        content: jsonContent(SetupFirstAdminResponse),
      },
      400: {
        description: "The request body is invalid.",
        content: jsonContent(ErrorResponse),
      },
      403: {
        description: "The request origin is not allowed.",
        content: jsonContent(ErrorResponse),
      },
      409: {
        description: "First local admin setup is already complete.",
        content: jsonContent(ErrorResponse),
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/openapi.json",
    summary: "Return the generated OpenAPI contract.",
    tags: ["Platform"],
    responses: {
      200: {
        description: "Generated OpenAPI 3.1 document.",
        content: jsonContent(z.record(z.string(), z.unknown())),
      },
      500: {
        description: "The OpenAPI document could not be generated.",
        content: jsonContent(ErrorResponse),
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/auth/me",
    summary: "Return the current authenticated user, if any.",
    tags: ["Auth"],
    responses: {
      200: {
        description: "Current user state.",
        content: jsonContent(CurrentUserResponse),
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/sign-in",
    summary: "Sign in with email and password.",
    tags: ["Auth"],
    request: {
      body: {
        required: true,
        content: jsonContent(SignInRequest),
      },
    },
    responses: {
      200: {
        description: "Authenticated session created.",
        content: jsonContent(SignInResponse),
      },
      400: {
        description: "The request body is invalid.",
        content: jsonContent(ErrorResponse),
      },
      401: {
        description: "The email or password is invalid.",
        content: jsonContent(ErrorResponse),
      },
      403: {
        description: "The request origin is not allowed.",
        content: jsonContent(ErrorResponse),
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/logout",
    summary: "Invalidate the current session.",
    tags: ["Auth"],
    responses: {
      200: {
        description: "Session invalidated.",
        content: jsonContent(LogoutResponse),
      },
      403: {
        description: "The request origin or CSRF token is invalid.",
        content: jsonContent(ErrorResponse),
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/credentials",
    summary: "List encrypted credential metadata for the current user.",
    tags: ["Credentials"],
    responses: {
      200: {
        description: "Credential metadata without plaintext secrets.",
        content: jsonContent(ListCredentialsResponse),
      },
      401: {
        description: "Authentication is required.",
        content: jsonContent(ErrorResponse),
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/credentials",
    summary: "Save an encrypted credential for the current user.",
    tags: ["Credentials"],
    request: {
      body: {
        required: true,
        content: jsonContent(CreateCredentialRequest),
      },
    },
    responses: {
      201: {
        description: "Credential saved; plaintext secret is not returned.",
        content: jsonContent(CreateCredentialResponse),
      },
      400: {
        description: "The request body is invalid.",
        content: jsonContent(ErrorResponse),
      },
      401: {
        description: "Authentication is required.",
        content: jsonContent(ErrorResponse),
      },
      403: {
        description: "The request origin or CSRF token is invalid.",
        content: jsonContent(ErrorResponse),
      },
      500: {
        description: "Credential encryption key is not configured.",
        content: jsonContent(ErrorResponse),
      },
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Pasa Trader Platform API",
      version: "0.1.0",
      description: "Self-hosted operating system for automated trading.",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local web/API process",
      },
      {
        url: "http://localhost:8080",
        description: "Docker Compose Caddy reverse proxy",
      },
    ],
  }) as OpenApiDocument;
}
