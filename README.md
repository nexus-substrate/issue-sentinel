# issue-sentinel

Security pipeline E2E tester for [nexus-agents](https://github.com/nexus-substrate/nexus-agents). Validates `issue_triage` trust classification and injection detection.

## Quick start

```bash
pnpm install
pnpm test        # Run unit tests
pnpm typecheck   # TypeScript strict check
pnpm build       # Compile to dist/
```

## MCP tools covered

| Tool | Purpose |
|------|---------|
| `issue_triage` | Triage GitHub issues with trust classification and typed action recommendations |

## Features

- Trust tier validation (Tier 1-4)
- Injection pattern detection
- Typed action schema validation
- Policy gate decision verification

## Live integration mode

```bash
NEXUS_LIVE=true ISSUE_URL="https://github.com/owner/repo/issues/1" npx tsx src/run-live.ts
```

## License

MIT
