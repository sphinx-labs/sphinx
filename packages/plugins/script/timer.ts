import util from 'util'
import { exec } from 'child_process'

const execAsync = util.promisify(exec)

const main = async () => {
  let agg = 0
  const runs = 20
  for (let i = 0; i < runs; i++) {
    const begin = Date.now()
    await execAsync('forge script script/Sphinx.s.sol')
    const end = Date.now()
    agg += (end - begin) / 1000
  }
  console.log('avg', (agg / runs).toFixed(3))
}

main()
