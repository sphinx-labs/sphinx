import util from 'util'
import { exec } from 'child_process'

const execAsync = util.promisify(exec)

const main = async () => {
  console.time('a')
  await execAsync('forge script src/scripts/ChugSplash.s.sol')
  console.timeEnd('a')
}

main()
