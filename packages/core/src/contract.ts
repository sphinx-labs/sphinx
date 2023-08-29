import {
  UserAddressOverrides,
  UserCallAction,
  UserConfigVariable,
  UserFunctionArgOverride,
} from './config'
import 'core-js/features/array/at'
import { isUserFunctionArgOverrideArray } from './utils'

// TODO(docs) everywhere in this file

// TODO(docs): the Contract class shouldn't have any public properties because...

type MethodArgs = [...Array<UserConfigVariable | UserFunctionArgOverride>]
type Method = (...args: MethodArgs) => UserCallAction

export class Contract {
  [name: string]: Method

  #address: string

  #abi?: Array<any>

  #addressOverrides?: Array<UserAddressOverrides>

  #buildWrappedMethod = (
    sphinxContract: Contract,
    functionName: string
  ): Method => {
    sphinxContract
    functionName

    // TODO(docs): args is the function args and optionally the overrides
    const method = (...args: MethodArgs): UserCallAction => {
      const firstArgs = args.slice(0, -1)
      const lastArg = args.at(-1)

      let functionArgs: Array<UserConfigVariable>
      let functionArgOverrides: Array<UserFunctionArgOverride> | undefined
      if (args.length > 1 && isUserFunctionArgOverrideArray(lastArg)) {
        functionArgs = firstArgs
        functionArgOverrides = lastArg
      } else {
        // TODO(docs)
        functionArgs = args
      }

      return {
        functionName,
        functionArgs,
        abi: sphinxContract.#abi,
        address: sphinxContract.#address,
        addressOverrides: sphinxContract.#addressOverrides,
        functionArgOverrides,
      }
    }
    return method
  }

  // TODO(test): https://docs.ethers.org/v6/migrating/#migrate-contracts
  // TODO(test): ct['increment(uint15)']. this reverts w/ ethers.contract, but it shouldn't revert for us until
  // the parsing logic.

  // TODO(docs): natspec docs here for the user
  constructor(
    address: string,
    options?: {
      abi?: Array<any>
      overrides?: Array<UserAddressOverrides>
    }
  ) {
    if (options) {
      const { abi, overrides } = options
      this.#abi = abi
      this.#addressOverrides = overrides
    }

    this.#address = address

    // Return a Proxy that will respond to functions
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, receiver)
        }

        return this.#buildWrappedMethod(this, prop)
      },
    })
  }
}

// const ct = new Contract('{{ MyContract }}')
// const a = ct.increment()
// const b = ct.increment('2', '3', '4')
// const c = ct.increment('2', '3', {
//   chains: ['anvil'],
//   args: {},
// })
// // const ct2 = new Contract('0x1234...', HelloSphinxABI)
// // const ct3 = new Contract('0x1234...', HelloSphinxABI, [
// //   {
// //     chains: ['ethereum', 'optimism'],
// //     address: '0x1234...',
// //   },
// // ])

// const main = async () => {
//   ct.then('2', '3')
//   // ct.increment('2', '3')
//   ct.increment('4', '5', [
//     {
//       chains: ['ethereum', 'optimism'],
//       params: {
//         _myNumber: 1,
//       },
//     },
//   ])
// }

// main()
