// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.22;

import './DCAHubCompanionLibrariesHandler.sol';
import './DCAHubCompanionHubProxyHandler.sol';
import '../utils/BaseCompanion.sol';

contract DCAHubCompanion is DCAHubCompanionLibrariesHandler, DCAHubCompanionHubProxyHandler, BaseCompanion, IDCAHubCompanion {
  constructor(
    address _swapper,
    address _allowanceTarget,
    address _governor,
    IPermit2 _permit2
  ) BaseCompanion(_swapper, _allowanceTarget, _governor, _permit2) {}
}
