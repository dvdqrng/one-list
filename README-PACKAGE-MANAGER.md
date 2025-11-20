# Package Manager

This project uses **pnpm** exclusively.

## Why pnpm?

- Faster installs
- Disk space efficient
- Strict dependency resolution
- Better monorepo support

## Installation

```bash
npm install -g pnpm
```

Or use Corepack (recommended):
```bash
corepack enable
corepack prepare pnpm@latest --activate
```

## Usage

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm electron:dev     # Run Electron in dev mode
pnpm electron:build   # Build Electron app
```

## Important

- **DO NOT use npm or yarn** - This will create conflicting lockfiles
- The project enforces pnpm via `packageManager` field in package.json
- `package-lock.json` and `yarn.lock` are gitignored

If you accidentally used npm/yarn:
```bash
rm package-lock.json yarn.lock
pnpm install
```
