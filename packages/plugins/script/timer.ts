import util from 'util'
import { exec } from 'child_process'

import ora from 'ora'

const execAsync = util.promisify(exec)

const spinner = ora()

const main = async () => {
  let agg = 0
  const runs = 3
  for (let i = 0; i < runs; i++) {
    spinner.start(`Starting run: ${i + 1} of ${runs}`)

    exec(`anvil --silent &`)

    const begin = Date.now()

    await execAsync(
      'npx sphinx deploy script/Sample.s.sol --network anvil --confirm'
    )

    const end = Date.now()
    agg += (end - begin) / 1000

    spinner.stop()
    console.log('run', i + 1, (end - begin) / 1000)

    await execAsync(`kill $(lsof -t -i:8545)`)
  }
  spinner.stop()
  console.log('avg', (agg / runs).toFixed(3))
}

main()
