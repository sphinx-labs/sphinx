## Safe Module Merkle Tree Bundling Logic

### Goal
A function that transforms an arbitrary set of transactions on an arbitrary set of networks into a Merkle Tree which is executable by the SphinxModule. See the SphinxModule Merkle Tree spec for more detail on the exact structure and content of the Merkle tree and its leafs.

### Secondary Goals
- Simple and auditable
- Should be a function that is agnostic to the source of transactions so it can be used to assemble a Merkle Tree based on transactions generated from any scripting framework (i.e Foundry, Hardhat Ignition, some arbitrary future framework)

### Input
Accepts an object where the keys are canonical chain ids and the values are deployment data objects.

#### Deployment Object Fields:
- nonce: The current nonce of the Safe on the target network
- txs: An array of Sphinx Transaction objects

#### Sphinx Transaction Object Fields:
- to: The destination address for the transaction
- value: The amount of native gas token to send from the Safe as part of the transaction
- gas: The gas limit for the transaction.
- operation: The type of transaction operation. We should use a Typescript enum with the values `Call`(0) and `DelegateCall`(1) which correspond to the `Enum.Operation.Call` and `Enum.Operation.DelegateCall` enum values defined by Safe.
- data: Arbitrary calldata to forward to the safe.

### Output
A `StandardMerkleTree` from the `@openzeppelin/merkle-tree` library with leafs that match the SphinxModule Merkle tree spec. In addition to that, the `StandardMerkleTree` should contain leafs which are ordered by chain id ascending and index ascending starting with the approval leaf for each chain.

So for example, if we intend to run some set of transactions on Goerli (5), OP Goerli (420), and Polygon Mumbai (80001). Then the leafs are expected to be ordered with the approval leaf for Goerli first, then all of the transaction leafs on Goerli in ascending order, then the approval leaf for OP Goerli, then all the transaction leafs on OP Goerli in ascending order, and so on.
