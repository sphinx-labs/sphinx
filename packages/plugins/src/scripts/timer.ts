import { execSync } from 'child_process'

const main = async () => {
  let agg = 0
  const runs = 10
  for (let i = 0; i < runs; i++) {
    const begin = Date.now()
    await execSync('forge script src/scripts/ChugSplash.s.sol')
    const end = Date.now()
    agg += (end - begin) / 1000
  }
  console.log('avg', (agg / runs).toFixed(3))
}

main()
