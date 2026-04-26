# Collaboration Guide

This guide covers how to contribute to the `next-api-bridge` package.

## Development Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Git

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd next-api-bridge
```

2. Install dependencies:
```bash
npm install
```

### Development Scripts

```bash
# Build the package
npm run build

# Watch mode for development
npm run dev

# Type checking
npm run typecheck

# Prepare for publishing
npm run prepublishOnly
```

## Project Structure

```
src/
  index.ts                    # Main entry point (server-only)
  create-client.ts            # Factory function
  client.ts                  # Main client class
  config/
    constants.ts             # Default constants (no env vars)
  cookies/
    build-cookie-header.ts   # Cookie header builder
    parse-set-cookie.ts      # Pure cookie parsing utilities
    sync-response-cookies.ts # Cookie sync from response
  logger/
    colors.ts                # ANSI color utilities
    logger.ts                # Logging functions
  types/
    auth.ts                  # Authentication types
    client.ts                # Client and request types
    response.ts              # Response types
    cookies.ts               # Cookie types
    index.ts                 # Type re-exports
  form/
    cache.ts                 # Page revalidation helper
    feedback.ts              # Toast helpers (client-only)
    form-data.ts             # FormData parser
    utils.ts                 # Redirect helpers
    index.ts                 # Form helper exports

examples/
  bridge.ts                  # Example API bridge instances
  products.actions.ts        # Product CRUD examples
  weather.actions.ts         # Weather API example
  index.ts                   # Example re-exports
```

## Key Design Principles

### 1. Server-Only Enforcement

The package uses `server-only` to prevent client-side usage. All core code must run on the server.

### 2. No Environment Variables

The package does not read environment variables directly. All configuration is passed through the `createNextApiBridge()` factory function.

### 3. Modular Structure

Code is organized by responsibility:
- `config/` - Constants and configuration
- `cookies/` - Cookie handling logic
- `logger/` - Logging utilities
- `types/` - TypeScript type definitions
- `form/` - Form helper utilities

### 4. Pure Functions

Cookie parsing functions are pure (no Next.js dependencies) for easier testing.

### 5. Request-Scoped Cookies

Cookies are passed through method calls, not stored as shared state. This ensures concurrency safety.

## Code Style

### TypeScript

- Use strict TypeScript mode
- Prefer explicit types over `any`
- Use interfaces for public APIs
- Use type aliases for utility types

### Naming Conventions

- **Constants**: UPPER_SNAKE_CASE
- **Types**: PascalCase with `I` prefix for interfaces (e.g., `IUser`)
- **Functions**: camelCase
- **Files**: kebab-case

### Imports

- Group imports: standard, external, internal
- Use absolute imports for internal modules
- Order: `import 'server-only'` first, then other imports

### Comments

- Use JSDoc for public APIs
- Keep comments concise and relevant
- Document non-obvious logic

## Adding New Features

### 1. Add Types

Define types in the appropriate file in `src/types/`:

```ts
// src/types/feature.ts
export interface FeatureOptions {
  // options
}
```

Export from `src/types/index.ts`.

### 2. Implement Logic

Add implementation in the appropriate module (e.g., `src/cookies/`, `src/logger/`).

### 3. Update Client

Add methods to `NextApiBridgeClient` in `src/client.ts` if needed.

### 4. Update Factory

If the feature requires configuration, update `ApiBridgeOptions` and the factory function.

### 5. Add Tests

Add example usage in `examples/` directory.

### 6. Update Documentation

Update README.md with the new feature.

## Testing

### Manual Testing

Use the example Server Actions in the `examples/` directory:

```ts
import { getProductsExampleAction } from 'next-api-bridge/examples';

const response = await getProductsExampleAction();
console.log(response);
```

### Type Checking

Run type checking before committing:

```bash
npm run typecheck
```

### Build Verification

Build the package to ensure it compiles correctly:

```bash
npm run build
```

## Building

The package uses `tsup` for bundling:

```bash
npm run build
```

This outputs to the `dist/` directory with:
- ESM format (`dist/index.js`)
- CommonJS format (`dist/index.cjs`)
- TypeScript declarations (`dist/index.d.ts`)

## Publishing

1. Update version in `package.json`
2. Run pre-publish checks:
```bash
npm run prepublishOnly
```
3. Publish to npm:
```bash
npm publish
```

## Reporting Issues

When reporting issues, include:

- Next.js version
- Node.js version
- Package version
- Minimal reproduction code
- Expected vs actual behavior
- Error messages and stack traces

## Pull Request Guidelines

1. **Fork** the repository
2. **Branch** from `main` (e.g., `feature/your-feature`)
3. **Commit** with clear messages
4. **Push** to your fork
5. **Create** a pull request

### PR Checklist

- [ ] Code follows project structure
- [ ] Types are properly defined
- [ ] No environment variables are read directly
- [ ] Server-only enforcement is maintained
- [ ] TypeScript compiles without errors
- [ ] Documentation is updated
- [ ] Examples are added if applicable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
