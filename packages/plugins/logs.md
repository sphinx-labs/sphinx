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




each number below was averaged over three runs

e2e:
6.300

ffiGetCanonicalConfigData:
1.076
agg: 5.584
