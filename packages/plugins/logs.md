`forge build` chugsplash.s.sol after changing the file slightly, using "solc finished in x":
4.31: develop
2.75: sg/foundry-ifaces after ryan
2.75: sg/foundry-ifaces after ryan and making ChugSplashConstants rly small
3.91: sg/foundry-ifaces after putting most of ChugSplash.sol into Utils.sol, using standard imports w/o IUtils.sol
2.39: sg/foundry-ifaces with IUtils.sol and vm.getCode('Utils.sol') in constructor of ChugSplash.sol
1.84: sg/foundry-ifaces merged into develop
.382: inherit empty ChugSplash.sol and Script.sol in script file, and call `deploy(...)` in `run()`
0s: theoretical baseline: chugsplash.s.sol imports Test and Script and has a small `run()`


Storage.config.ts:
3.220: original (after sg/foundry-ts, before ts-import)
~3.22: pate/ts-import (w/o ts-import cache)
2.735: pate/ts-import (using ts-import cache)
2.696: --swc

claim.t.js:
2.441: original (after sg/foundry-ts, before ts-import)
2.564: pate/ts-import
2.526: --swc
2.391: vanilla node

deploy.t.js:
2.669: --swc
2.557: vanilla node


20 runs:
ffiGetCanonicalConfigData (agg):
2.278: unoptimized
---
2.253: optimized inside `case 'getCanonicalConfigData'` (biggest improvement in `getConfigArtifacts` for larger configs)
2.233: created `get-canonical-config-data.ts`
1.800: upper baseline (agg, except no overhead of loading big file)
1.466: lower baseline (`vm.ffi(cmds)` into empty file, where `cmds` are those in `ffiGetCanonicalConfigData`)
---
related:
getConfigArtifacts (for `deploy.t.js`):
826.174ms: unoptimized
774.555ms: promisify
217.755ms: load build infos just once, in `getConfigArtifacts`

20 runs:
ffiGetMinimalParsedConfig (agg):
1.805: unoptimized
---
1.612: removed `readUnvalidatedConfig` in favor of `getMinimalConfig`
1.275: created `get-minimal-config.ts`
1.094: baseline (`vm.ffi(cmds)` into empty file, where `cmds` are those in `ffiGetMinimalConfig`)


known values:
0.714: e2e empty script. (completely empty script that imports and inherits `Script` and `Test`, and has an empty `run()`)
0.229: `vm.ffi(cmds)` into empty file, where cmds are those in `ffiGetMinimalConfig`.
0.411: difference between `vm.ffi` into an empty file vs an empty file that just contains runs a fn (`parseFoundryArtifact`) from `core/src/utils.ts`.
~0.067-0.07 (runs: ~2, not 20): `execAsync(forge config --json)`
~0.7s: `readUserChugSplashConfig` on `claim.ts` (`claim.t.js` typescript version)

ideas:
- we're leaving a couple hundred ms on the table by importing a ton of stuff to `getCanonicalConfigData`. there are a lot of downstream dependencies, so this'd be a large refactor
- maybe we can slim down the number of files inherited by ChugSplash.sol. Not sure if this'd make a meaningful difference
- compile foundry/index.ts into wasm?
- instead of passing a ton of data from TS to solidity via ffi, we should see if writing to FS in TS then reading from FS in Solidity is faster

attempted to:
- transpile ts to a js string via the `ts.transpileModule`, then requireFromString(result.outputText). the issue was that require statements inside the ts config weren't resolved by doing this. e.g. `require(../test/constants)` wasn't resolved



each number below was averaged over three runs

e2e:
6.300

ffiGetCanonicalConfigData:
1.076
agg: 5.584
