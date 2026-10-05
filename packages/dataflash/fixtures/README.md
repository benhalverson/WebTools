# Recorded binary fixtures (not generated)

These public upstream recordings are copied without re-encoding. No existing
WebTools MAVLink or parameter fixtures were regenerated or modified.

## pymavlink-test.BIN

- Repository: https://github.com/ArduPilot/pymavlink
- Commit: `20111a041f3abfeda1c4b34dae43c0cd4441ef52`
- Source: https://github.com/ArduPilot/pymavlink/blob/20111a041f3abfeda1c4b34dae43c0cd4441ef52/tests/test.BIN
- Complete upstream fixture, exactly 65,536 bytes.
- SHA-256: `a51f040b2ad7f55185c1da5705f226f51469b86562c4ff76d05c99e0e52c2bf4`
- Recorded ArduPlane V3.8.2-dev/PX4v4 log, 2017 GPS timestamp; older formats
  without FMTU instance metadata. Upstream's fixture is already a partial log.
- Upstream license retained in `pymavlink-COPYING`.

## plane-4.6.2-prefix.BIN

- Repository: https://github.com/pryamcem/go-dataflash
- Commit: `a7d656050e2c55c50ead433b88f8ee50bcf1a051`
- Source: https://github.com/pryamcem/go-dataflash/blob/a7d656050e2c55c50ead433b88f8ee50bcf1a051/testdata/testlog.bin
- First 262,144 bytes of the 5,861,376-byte public recorded log, selected with
  `head -c 262144 testlog.bin`. This is an exact prefix, not regenerated data.
- Full source SHA-256: `9eb715d612bf4ddd06e956e2a26bf75932946903c13528774410a28bd5563096`
- Prefix SHA-256: `d7634bc98b3112d92b4b79f83c15d929dcb1ae16111655e0494d623bbba45a53`
- Recorded ArduPlane V4.6.2 (1ebd4d99), MatekF405-TE; contains FMTU,
  unit/multiplier metadata, GPS, MSG firmware/board metadata, multiple BAT
  instances (0 and 3) and ORGN instances (0 and 1). The prefix deliberately
  also exercises upstream's incomplete-tail handling.
- Upstream GPLv3 license retained in `go-dataflash-LICENSE`.

Tests derive malformed and truncated variants in memory from these exact bytes;
they do not pretend those variants are independent recordings. Hash assertions
make fixture drift explicit. Run-time tests have no network dependency.
