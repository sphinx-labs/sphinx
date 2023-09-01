import {
  UserAddressOverrides,
  UserCallAction,
  UserConfigVariable,
  UserFunctionArgOverride,
} from './config'
import 'core-js/features/array/at'
import { isUserFunctionArgOverrideArray } from './utils'

type MethodArgs = [...Array<UserConfigVariable | UserFunctionArgOverride>]
type ContractMethod = (...args: MethodArgs) => UserCallAction

export class Contract {
  // This is an index signature. It allows the user to call arbitrary methods on this class without
  // throwing a type error. This is necessary because function calls can be named anything. A
  // consequence of this is that Typescript will throw an error if we define any public properties
  // on this class, since it will conflict with the index signature.
  [name: string]: ContractMethod

  #address: string

  #abi?: Array<any>

  #addressOverrides?: Array<UserAddressOverrides>

  #buildWrappedMethod = (
    sphinxContract: Contract,
    functionName: string
  ): ContractMethod => {
    sphinxContract
    functionName

    /**
     * @notice This is the function that the user will call on their contract.
     *
     * @param args The arguments that the user supplies to their contract function call. It includes
     * function arguments and overrides.
     * @returns {UserCallAction}
     */
    const method = (...args: MethodArgs): UserCallAction => {
      const firstArgs = args.slice(0, -1)
      const lastArg = args.at(-1)

      let functionArgs: Array<UserConfigVariable>
      let functionArgOverrides: Array<UserFunctionArgOverride> | undefined
      if (args.length > 1 && isUserFunctionArgOverrideArray(lastArg)) {
        functionArgs = firstArgs
        functionArgOverrides = lastArg
      } else {
        // No overrides were provided, so we just use the args as-is.
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

  /**
   * @notice Create a new Sphinx contract instance.
   *
   * @param address The address of the contract. This can either be a reference name (e.g. `{{
   * MyContract }}`) or an address (e.g. `0x1234...`
   * @param options The options for the contract. This includes a field for any chain-specific
   * address overrides. It also includes a field for the contract ABI, which must be supplied if the
   * contract is an external contract that isn't defined in the Sphinx config.
   */
  constructor(
    address: string,
    options?: {
      overrides?: Array<UserAddressOverrides>
      abi?: Array<any>
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
