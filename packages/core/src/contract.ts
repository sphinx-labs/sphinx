import {
  BaseContract,
  BaseContractMethod,
  Contract,
  ContractInterface,
  ContractMethodArgs,
  ContractRunner,
  Interface,
  InterfaceAbi,
  isError,
} from 'ethers'
import { writeFileSync } from 'fs'

// TODO(docs) everywhere

// TODO(docs): the SphinxContract class shouldn't have any public properties because...

type SBaseContractMethod = (...args: Array<any>) => void

type TODO = any

// const passProperties = ['then'] // TODO: what does this do (copied from ethersJS)
export class SContract implements ContractInterface {
  [name: string]: BaseContractMethod

  #calls: Array<TODO> = []

  #buildWrappedMethod = (
    sphinxContract: SContract,
    key: string
  ): SBaseContractMethod => {
    sphinxContract
    key

    const method = async (...args: Array<any>) => {
      sphinxContract.#calls.push({ key, args })
      writeFileSync(
        'calls.json',
        JSON.stringify(sphinxContract.#calls, null, 2)
      )
    }
    return method
  }

  #getFunction(key: string): SBaseContractMethod {
    const func = this.#buildWrappedMethod(this, key)
    return func
  }

  // TODO: getFunction< allows a FunctionFragment. should we allow this too?

  // TODO: ethers.js ensures that reserved typescript keywords can be used as function names. check
  // that we can do this too. c/f: getFunction<T extends ContractMethod

  // TODO: check that the index signature works with conflicting properties. e.g. if this class has a
  // `callback` function, then calling `class.callback()` should trigger the index signature, not the
  // function on this class.

  // TODO(test): https://docs.ethers.org/v6/migrating/#migrate-contracts
  // TODO(test): ct['increment(uint15)']. this reverts w/ ethers.contract, but it shouldn't revert for us until
  // the parsing logic.

  // TODO: check that all properties + methods are private

  constructor(referenceName: string) {
    referenceName

    // Return a Proxy that will respond to functions
    return new Proxy(this, {
      get: (target, prop) => {
        if (typeof prop === 'symbol') {
          throw new Error(`TODO: not sure if we should throw an error for this`)
        }

        return this.#getFunction(prop)

        // Undefined properties should return undefined
        // try {
        //   return target.getFunction(prop)
        // } catch (error) {
        //   if (!isError(error, 'INVALID_ARGUMENT') || error.argument !== 'key') {
        //     throw error
        //   }
        // }

        // return undefined
      },
    })
  }
}

// Instantiate a contract from a reference name
const ct = new SContract('MyContract')
ct.increment('2', '3')
ct.increment('4', '5')
