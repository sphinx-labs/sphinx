## Merkle Tree Bundling Logic

### Goal
A function that transforms an arbitrary set of transactions on an arbitrary set of networks into a Merkle tree which is executable by the SphinxModuleProxy. See the [SphinxModuleProxy Merkle tree spec](TODO(end)) for more detail on the exact structure and content of the Merkle tree and its leaves.

### Secondary Goals
- Simple
- Should be agnostic to the source of transaction data so it can be used to assemble a Merkle tree based on transactions generated from any scripting framework (i.e Foundry, Hardhat Ignition, some arbitrary future framework)

### Relevant Files
- The function: [merkle-tree.ts](TODO(end))
- Unit tests: [merkle-tree.spec.ts](TODO(end))

### Input
Accepts an object where the keys are canonical chain ids and the values are deployment data objects which contain all of the necessary info to assemble a SphinxMerkleTree. See the [inline documentation](TODO(end)) for exact details on the input data.

### Output
A `StandardMerkleTree` from the `@openzeppelin/merkle-tree` library with leaves that match the SphinxModule Merkle tree spec. In addition to that, the `StandardMerkleTree` should contain leaves that are ordered by chain ID ascending and index ascending starting with the approval leaf for each chain.

So for example, if we intend to run some set of transactions on Goerli (5), OP Goerli (420), and Polygon Mumbai (80001). Then the leaves are expected to be ordered with the approval leaf for Goerli first, then all of the transaction leaves on Goerli in ascending order, then the approval leaf for OP Goerli, all the transaction leaves on OP Goerli in ascending order, and so on.
