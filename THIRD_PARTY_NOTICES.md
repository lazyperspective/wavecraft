# Third-party notices

Wavecraft includes the following direct runtime and development dependencies. They remain subject to their respective licenses.

| Package | Version in lockfile | License | Purpose |
|---|---:|---|---|
| React / React DOM | 19.2.8 | MIT | Editor UI |
| Zustand | 5.0.15 | MIT | Live project/editor state |
| Lucide React | 0.468.0 | ISC | Interface icons |
| `@mcp-b/webmcp-polyfill` | 5.0.1 | MIT | Local WebMCP API bridge for ordinary browsers |
| `@mcp-b/webmcp-types` | 5.0.1 | MIT | Current WebMCP TypeScript contracts |
| Vite | 8.2.2 | MIT | Build and development server |
| Vitest | 4.1.11 | MIT | Automated tests |

The full transitive dependency tree and integrity hashes are recorded in `package-lock.json`.

## Demo media

The demo contains no third-party recordings, music, logos, stock footage, or waveform assets. Its PCM is generated at runtime by Wavecraft source code using deterministic synthesis and noise functions.
