# Recorded MAGFit input

`plane-4.6.2.BIN` is the complete, unmodified 5,861,376-byte recording from
[go-dataflash at a7d656050e2c55c50ead433b88f8ee50bcf1a051](https://github.com/pryamcem/go-dataflash/blob/a7d656050e2c55c50ead433b88f8ee50bcf1a051/testdata/testlog.bin).
SHA-256: `9eb715d612bf4ddd06e956e2a26bf75932946903c13528774410a28bd5563096`.
Its GPLv3 license is retained at `packages/dataflash/fixtures/go-dataflash-LICENSE`.

The DataFlash package's prefix fixture is from this same recording; these are
not two independent flights. Tests exercise both attitude sources, full/cropped
ranges, all orientation modes, motor and non-motor fits, diagnostics, and exports.
The older pymavlink recording is separately checked as an unsupported log.
No recording is regenerated. Numerical comparisons execute the unchanged MAGFit
at the assigned base `0f4607db3dccbc7d06e5847c02465dab38d1eb80` with its actual
matrix vendor and the pinned parser. DOM-only stubs do not replace calculations.
Node comparisons require exact serialized numerical values and parameter bytes;
browser comparisons allow 1e-10 absolute plus 1e-12 relative floating-point
roundoff between V8 versions, with parameter download bytes still exact.
