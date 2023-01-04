# Integrating ChugSplash with Foundry

This guide demonstrates how to integrate ChugSplash into an existing Foundry test suite. Assumes basic knowledge of Foundry.

### Prerequisites:
* [Install Foundry](https://book.getfoundry.sh/getting-started/installation)
* [Setup a ChugSplash project](https://github.com/chugsplash/chugsplash/blob/develop/docs/setup-project.md)

### 1. Start a stand-alone RPC server using Anvil.

Simply run:

```
anvil
```

### 2. Deploy your contracts on the RPC server using ChugSplash.

Assuming that the network name is `localhost`:

```
npx hardhat chugsplash-deploy --network localhost --config-path <path/to/chugsplash/file>
```

This should output a deployment table that looks like the following:
```
┌───────────────────┬───────────────────┬──────────────────────────────────────────────┐
│  Reference Name   │     Contract      │                   Address                    │
├───────────────────┼───────────────────┼──────────────────────────────────────────────┤
│ 'MyFirstContract' │ 'HelloChugSplash' │ '0x39fe80498fFed3F372cD2ec5ED490E41063aB7E4' │
└───────────────────┴───────────────────┴──────────────────────────────────────────────┘
```

We'll use the addresses in the deployment table in the next step.

### 3. Use the deployed addresses in your Foundry tests.

Simply copy and paste the addresses from the deployment table into your Foundry tests. For example:

```solidity
import "forge-std/Test.sol";
... // other imports

contract HelloChugSplashTest is Test {
  HelloChugSplash public myFirstContract;

  function setUp() public {
    // Copy and paste the deployed addresses here
    myFirstContract = HelloChugSplash(0x39fe80498fFed3F372cD2ec5ED490E41063aB7E4);
  }
}
```

If you'd prefer not to manually copy and paste the addresses, you can read them from your deployment artifacts instead. For example:

```
import "forge-std/Test.sol";
... // other imports

contract HelloChugSplashTest is Test {
  HelloChugSplash public myFirstContract;

    function setUp() public {
      // Get the deployment artifact path (assuming it's located in the "localhost" folder)
      string memory deploymentArtifactPath = string.concat(
        vm.projectRoot(),
        "/deployments/localhost/MyFirstContract.json"
      );

      string memory deploymentArtifact = vm.readFile(deploymentArtifactPath);
      bytes memory encodedAddress = vm.parseJson(deploymentArtifact, 'address');
      address addr = abi.decode(encodedAddress, (address));
      myFirstContract = HelloChugSplash(addr);
    }
}
```

### 4. Run your Foundry tests.

Assuming that your RPC server is running on port 8545:

```
forge test --rpc-url http://localhost:8545/
```

That's it!