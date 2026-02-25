import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploy ClawdVictionStaking to Base mainnet using the real $CLAWD token.
 */
const deployToBase: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const REAL_CLAWD_TOKEN = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";

  // Only deploy staking contract - no mock token on mainnet
  await deploy("ClawdVictionStaking", {
    from: deployer,
    args: [REAL_CLAWD_TOKEN],
    log: true,
  });
};

export default deployToBase;
deployToBase.tags = ["BaseMainnet"];
// Skip the mock token deploy script on non-localhost
deployToBase.skip = async hre => {
  return hre.network.name === "localhost" || hre.network.name === "hardhat";
};
