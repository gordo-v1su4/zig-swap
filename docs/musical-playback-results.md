# Musical playback results

Historical four-run snapshot. The Results tab includes later reports and is the current inventory. Generated from local raw runs. Browser/GPU submission estimates, not physical scanout. A one-minute preview is not a completed comparison suite. GPU-bank results use a larger explicit memory budget; compare that tradeoff separately.

| Backend | Decks | Resolution | Seconds | Seed | On-time cuts | Worst deck p95 | Longest excess source error | Valid |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| mediabunny | 8 | 720 | 60.0 | 42 | 27.8% | 139.9 ms | 0.20 s | yes |
| gpu-bank | 8 | 720 | 60.0 | 42 | 88.1% | 19.0 ms | 0.00 s | yes |
| gpu-bank | 8 | 720 | 60.0 | 42 | 87.3% | 18.5 ms | 0.00 s | yes |
| gpu-bank | 8 | 720 | 60.0 | 42 | 85.5% | 19.0 ms | 0.00 s | yes |

## Decision

No measured run meets the acceptance gate. Do not migrate Beatmaxxer on these results.

Completed version-2 runs: 4. Passing runs: 0.

## Raw evidence

- [1789189116407-7f65fd90-a1db-488a-87fe-ec02ef43b779.json](../benchmark-results/1789189116407-7f65fd90-a1db-488a-87fe-ec02ef43b779.json)
- [1789189528814-8cbc373f-3e2d-4f25-bf29-1d3b5f151d86.json](../benchmark-results/1789189528814-8cbc373f-3e2d-4f25-bf29-1d3b5f151d86.json)
- [1789190096024-64155559-c4d8-4916-91c5-4f96595551ca.json](../benchmark-results/1789190096024-64155559-c4d8-4916-91c5-4f96595551ca.json)
- [1789190343802-a4b352fa-33f8-4b3d-8fca-57b9c840a912.json](../benchmark-results/1789190343802-a4b352fa-33f8-4b3d-8fca-57b9c840a912.json)

## libmedia capability gate

- Error: Capability probe timed out (1789188724535-cfcc7ae2-7b25-4dae-a3ac-b852b3d139e4.json)
- Error: Capability probe timed out (1789188808964-97142d2e-ec68-481d-8c17-a9ea1e3c0e68.json)
