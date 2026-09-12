# WASM worker owns remap and clock tick

The compiled remap engine runs in a dedicated worker. The worker owns clock tick and remap state (beat grid lookup, chop reducer, seek settlement). The main thread owns WebCodecs decode and WebGPU present.

Cross-thread messages per frame carry `{ sourceTime, chopState }` (exact shape TBD at integration). Clock authority may move later if audio-authoritative sync requires it.

**Considered:** Stateless worker with main-thread clock; SharedArrayBuffer with everything except WebGPU in worker.

**Status:** accepted
