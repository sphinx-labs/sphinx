// This is the ABI that was generated for a test contract.
export const ABI = [
  {
    inputs: [
      {
        internalType: 'uint256[]',
        name: '_myArray',
        type: 'uint256[]',
      },
      {
        internalType: 'uint256[][]',
        name: '_myNestedArray',
        type: 'uint256[][]',
      },
    ],
    name: 'myArrayFunction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
      {
        components: [
          {
            internalType: 'int256',
            name: 'a',
            type: 'int256',
          },
          {
            internalType: 'bool',
            name: 'b',
            type: 'bool',
          },
          {
            components: [
              {
                internalType: 'address',
                name: 'd',
                type: 'address',
              },
              {
                internalType: 'uint256[]',
                name: 'e',
                type: 'uint256[]',
              },
            ],
            internalType: 'struct HelloSphinx.MyNestedStruct',
            name: 'c',
            type: 'tuple',
          },
        ],
        internalType: 'struct HelloSphinx.MyStruct',
        name: '_myStruct',
        type: 'tuple',
      },
      {
        internalType: 'uint256',
        name: '_myNumber',
        type: 'uint256',
      },
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    name: 'myFunctionWithUnnamedVars',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'myFunctionWithoutArgs',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_myNumber',
        type: 'uint256',
      },
    ],
    name: 'mySingleArgFunction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'int256',
            name: 'a',
            type: 'int256',
          },
          {
            internalType: 'bool',
            name: 'b',
            type: 'bool',
          },
          {
            components: [
              {
                internalType: 'address',
                name: 'd',
                type: 'address',
              },
              {
                internalType: 'uint256[]',
                name: 'e',
                type: 'uint256[]',
              },
            ],
            internalType: 'struct HelloSphinx.MyNestedStruct',
            name: 'c',
            type: 'tuple',
          },
        ],
        internalType: 'struct HelloSphinx.MyStruct',
        name: '_myStruct',
        type: 'tuple',
      },
    ],
    name: 'myStructFunction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'int256',
            name: 'a',
            type: 'int256',
          },
          {
            internalType: 'bool',
            name: 'b',
            type: 'bool',
          },
          {
            components: [
              {
                internalType: 'address',
                name: 'd',
                type: 'address',
              },
              {
                internalType: 'uint256[]',
                name: 'e',
                type: 'uint256[]',
              },
            ],
            internalType: 'struct HelloSphinx.MyNestedStruct',
            name: 'c',
            type: 'tuple',
          },
        ],
        internalType: 'struct HelloSphinx.MyStruct[]',
        name: '_myStructArray',
        type: 'tuple[]',
      },
    ],
    name: 'myStructArrayFunction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]
