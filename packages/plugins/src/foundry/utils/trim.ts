import { BuildInfo } from '@sphinx-labs/core'

/**
 * This function is used to trim down the build info file to exactly the fields we specify in our type.
 * To do this, we use a template object which contains all the fields we want. We cannot use the typescript
 * type itself since that doesn't exist at runtime. So, if we want to update the BuildInfo type, we also
 * need to update the template below.
 *
 * This is kind of a foot gun since we could forget to update the template, but it's not that big of a
 * concern since we almost never change the BuildInfo type. It's also non-trivial to resolve. We'd need to do
 * something like autogenerate the BuildInfo type from the template defined here to really resolve it.
 *
 * @dev Note that this function does not implement any logic for trimming individual elements inside of arrays.
 * It is only possible to select the entire array.
 */
export const trimObjectToType = <T>(obj: any, typeTemplate: T): T => {
  // If the template is either an array then we just return since we don't do any filtering on arrays
  if (Array.isArray(typeTemplate)) {
    return obj
  } else if (typeof typeTemplate !== 'object') {
    // If the template is a primative type, then we just return so the value is included in the result
    return obj
  } else if (!typeTemplate === null || !typeTemplate === undefined) {
    throw new Error('Cannot specify a typeTemplate that is null or undefined')
  }

  const result: any = {}
  // Look through the template object for all the requested keys
  for (const key in typeTemplate) {
    if (key === 'sphinx_all_keys') {
      /**
       * If we specified `sphinx_all_keys` then we need to select and trim all of the keys according template specified
       * For example lets say we're trimming the `SolcInput` type and we want to trim to this typescript type:
       * ```
       * sources: {
       *   [sourceName: string]: {
       *     content: string;
       *   }
       * }
       * ```
       *
       * This doesn't work with the template strategy used for the rest of the fields b/c we can't include all of the
       * possible keys in our template.
       *
       * So instead we use the template:
       * ```
       * sources: {
       *   sphinx_all_keys: {
       *     content: ''
       *   }
       * }
       * ```
       *
       * When we detect the `sphinx_all_keys` field, we just select all of the keys and parse using next nested template
       * which in this case would be:
       * { content: '' }
       */
      // eslint-disable-next-line guard-for-in
      for (const genericKey in obj) {
        result[genericKey] = trimObjectToType(
          obj[genericKey],
          typeTemplate[key]
        )
      }
    } else if (key in obj) {
      // If the key is in the obj, then we can include it in the result
      // we call `trimObjectToType` recursively to handle nested objects
      result[key] = trimObjectToType(obj[key], typeTemplate[key])
    }
  }

  return result
}

export const BuildInfoTemplate: BuildInfo = {
  id: '',
  solcVersion: '',
  solcLongVersion: '',
  input: {
    language: '',
    sources: {
      sphinx_all_keys: {
        content: '',
      },
    },
    settings: {
      viaIR: false,
      optimizer: {
        runs: 0,
        enabled: false,
        details: {
          yulDetails: {
            optimizerSteps: '',
          },
        },
      },
      metadata: {
        useLiteralContent: false,
        bytecodeHash: '',
        appendCBOR: true,
      },
      outputSelection: {
        sphinx_all_keys: {
          sphinx_all_keys: [''],
        },
      },
      evmVersion: '',
      libraries: {
        sphinx_all_keys: {
          sphinx_all_keys: '',
        },
      },
      remappings: [''],
    },
  },
  output: {
    contracts: {
      sphinx_all_keys: {
        sphinx_all_keys: {
          abi: [''],
          evm: {
            bytecode: {
              object: '',
              linkReferences: {
                sphinx_all_keys: {
                  sphinx_all_keys: [
                    {
                      start: 0,
                      length: 20,
                    },
                  ],
                },
              },
              immutableReferences: {
                sphinx_all_keys: [{ start: 0, length: 20 }],
              },
            },
            deployedBytecode: {
              object: '',
              linkReferences: {
                sphinx_all_keys: {
                  sphinx_all_keys: [
                    {
                      start: 0,
                      length: 20,
                    },
                  ],
                },
              },
              immutableReferences: {
                sphinx_all_keys: [{ start: 0, length: 20 }],
              },
            },
          },
          metadata: '',
        },
      },
    },
  },
}
