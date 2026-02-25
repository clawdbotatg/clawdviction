import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployContracts: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Deploy mock CLAWD token
  const mockClawd = await deploy("MockCLAWD", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  // Deploy staking contract
  await deploy("ClawdVictionStaking", {
    from: deployer,
    args: [mockClawd.address],
    log: true,
    autoMine: true,
  });
};

export default deployContracts;
deployContracts.tags = ["MockCLAWD", "ClawdVictionStaking"];
// Only run on localhost/hardhat - not on real networks
deployContracts.skip = async hre => {
  return hre.network.name !== "localhost" && hre.network.name !== "hardhat";
};
