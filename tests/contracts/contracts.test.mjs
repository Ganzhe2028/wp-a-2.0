import assert from "node:assert/strict";
import test from "node:test";

import { ERROR_CODES } from "../../lib/contracts/errors.ts";
import {
  createRequestId,
  isRequestId,
  REQUEST_ID_PATTERN,
} from "../../lib/contracts/request-id.ts";
import { failure, success } from "../../lib/contracts/response.ts";

test("stable error codes are unique", () => {
  assert.equal(new Set(ERROR_CODES).size, ERROR_CODES.length);
  assert.ok(ERROR_CODES.includes("INTERNAL_ERROR"));
  assert.ok(ERROR_CODES.includes("SECTION_LOCKED_FOR_VIEWER"));
});

test("request IDs are server-generated and match the public format", () => {
  const first = createRequestId();
  const second = createRequestId();

  assert.match(first, REQUEST_ID_PATTERN);
  assert.equal(isRequestId(first), true);
  assert.notEqual(first, second);
  assert.equal(isRequestId("req_user-controlled"), false);
});

test("response helpers preserve the common envelope", () => {
  const requestId = createRequestId();

  assert.deepEqual(success({ status: "ok" }, requestId), {
    data: { status: "ok" },
    requestId,
  });
  assert.deepEqual(failure("FORBIDDEN", "forbidden", requestId), {
    error: { code: "FORBIDDEN", message: "forbidden", details: {} },
    requestId,
  });
});