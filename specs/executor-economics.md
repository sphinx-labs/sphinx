# ChugSplash Executor Economics

Executors need to be economically incentivized to execute tasks for upgrades. Here we describe the behavior we want to incentivize, mechanisms used to incentivize executors, and why we believe these mechanisms properly incentivize the desired behavior.

## Desired Behavior

* Upgrades should happen automatically without communication between project and executors.
* Upgrades should complete quickly.
* Projects should be able to optionally limit the costs of their deployment with the understanding that an upgrade may take longer when on-chain congestion causes deployment costs to become higher than the maximum set by the project.
* Upgrade executors should be paid more than the cost to carry out the upgrade actions.

## Mechanism

### Payment Currency

For the sake of simplicity, upgrade execution is paid in ETH. Users can deposit ETH into the ChugSplashManager contract for a given project which can used to pay for upgrade executions.

### Withdrawal Locks

Funds cannot be withdrawn while an upgrade is active. This guarantees that executors will be paid for any transactions submitted during the upgrade. Users may withdraw funds after an upgrade is completed, reverted, paused, or cancelled. However, to prevent users from trolling executors by immediately cancelling and withdrawing funds, users must post a bond of `user_bond_amount` to be forfeited if an upgrade is cancelled. Upgrade cancellation is a potentially dangerous action and should not be executed unless in an emergency. We therefore do not expect cancellations (and bond forfeits) to occur frequently.

### Executor Selection Strategies

If upgrade execution were to be a free-for-all, we would expect to see Priority Gas Auctions (PGAs) to develop where executors aim to guarantee that their execution transactions land on-chain before the transactions of any other executors. PGAs generally drive up the cost of upgrades and cause executors to pay transaction fees that they cannot be rewarded for. Furthermore, the cost of a PGA is directed to block producers which means that economic value is leaving the ChugSplash system.

To avoid costly PGAs, we introduce the concept of Executor Selection Strategies (ESS). Projects specify a reference to a contract `executor_selection_strategy` which determines the strategy used to select executors for upgrades for the project. It’s the goal of an ESS to minimize inefficiencies as much as possible. Each project can specify its own `executor_selection_strategy`, but executors can choose which strategies they will participate in. By allowing the `executor_selection_strategy` to be a variable configurable by projects, we can introduce opt-in upgrades to newer, more robust ESS contracts.

An ESS contract has the following simple interface:

```solidity
interface IExecutorSelectionStragegy {
  /**
   * Queries the selected executor for a given project/bundle.
   *
   * @param _project  Address of the ChugSplashManager that mananges the project.
   * @param _bundleId ID of the bundle currently being executed.
   *
   * @return Address of the selected executor.
   * @return Time when the executor was selected.
   */
  function getSelectedExecutor(
    address _project,
    bytes32 _bundleId
  ) external view returns (address, uint256);
}
```

Each ESS then implements its own logic for selecting the executor for a given project and upgrade bundle. A project’s ESS cannot be changed while an upgrade is active. Anyone may create a new ESS at any time.

#### ESS #1: Simple Lock

Our first MVP ESS is the `SimpleLockESS`. Executors may post a bond of `executor_bond_amount` to claim the sole right to execute actions for the locked upgrade for a period of `upgrade_lock_time`. Only the first executor to post a bond gains this right. If the selected executor completes the upgrade within the `upgrade_lock_time` or if the upgrade is cancelled, the bond is returned. If the executor fails to complete the upgrade within the `upgrade_lock_time`, a new executor may post a bond instead and the original bond is forfeited and transferred into the wallet of the project’s `ChugSplashManager` contract. We note that this creates a PGA for the transaction that posts the bond and locks the upgrade but removes PGAs during the execution process.

### Executor Payment Strategies

Similar to the model for Executor Selection Strategies, we also introduce the idea of Executor Payment Strategies (EPS). Each project may specify an EPS which determines how executors will be paid. Executors will sort and filter by EPS contracts they believe reward executors fairly, so it’s recommended to use certain default EPS contracts.

An EPS contract has the following simple interface:

```solidity
interface IExecutorPaymentStrategy {
  /**
   * Computes the payment amount for a given executor transaction.
   *
   * @param _project            Address of the ChugSplashManager that mananges the project.
   * @param _bundleId           ID of the bundle currently being executed.
   * @param _gasUsed            Amount of gas used by the executor's transaction.
   * @param _timeElapsedSeconds Amount of time elapsed since the executor was selected.
   */
  function computeExecutorPayment(
    address _project,
    bytes32 _bundleId,
    uint256 _gasUsed,
    uint256 _timeElapsedSeconds
  ) external view returns (uint256);
}
```

#### EPS #1: Flat Fee

The `FlatFeeEPS` is a simple EPS that pays the executor a fee of `flat_fee_percent` over the amount of gas used, based on the current `basefee`.

#### EPS #2: Diminishing Bonus

The `DiminishingBonusEPS` is a modification of the `FlatFeeEPS` that pays a `diminishing_fee_max_percent` fee that diminishes to `flat_fee_percentage` over the course of `upgrade_lock_time` from when the executor was first selected. We intend for this to be used in tandem with the `SimpleLockESS` to incentivize fast execution of the upgrade.

## Variables

* `user_bond_amount`: 0.1 ETH
* `executor_bond_amount`: 0.1 ETH
* `upgrade_lock_time`: 15 minutes
* `flat_fee_percent`: 20%
* `diminishing_fee_max_percent`: 40%
