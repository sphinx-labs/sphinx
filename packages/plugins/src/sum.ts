import * as networkConfig from '../a.json'

let sum = 0
for (const e of networkConfig.actionInputs) {
  sum += Number(e.gas)
}
console.log(sum)
