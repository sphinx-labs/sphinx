import * as fs from 'fs'

for (let i = 0; i < 20; i++) {
  fs.copyFileSync(
    './out/artifacts/build-info/6a2460719846411714d83e241e6920c1.json',
    `./out/artifacts/build-info/${Number(Date.now())}.json`
  )
}
