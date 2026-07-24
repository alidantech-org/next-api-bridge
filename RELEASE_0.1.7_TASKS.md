# next-api-bridge 0.1.7 release hardening

The release work preserves the existing bridge factory and request methods while adding safe serializable responses, trusted request-context forwarding, hardened cookie synchronization, redacted logging, cache correctness, and production Next.js test fixtures.

## Release gate

Do not publish 0.1.7 until typechecking, unit tests, integration tests, production Next.js E2E tests for Next 15 and 16, and package tarball verification all pass.
