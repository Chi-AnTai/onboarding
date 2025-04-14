const { expect } = require("chai");
const { ethers } = require("hardhat");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");

const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const USDC = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";
const WETH_HOLDER = "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443"; // 有大量 WETH 的帳號
const USDC_HOLDER = "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443"; // 有大量 USDC 的帳號
const NONFUNGIBLE_POSITION_MANAGER_ADDRESS =
  "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

const usdcTestAmount = ethers.parseUnits("5000", 6);
const wethTestAmount = ethers.parseEther("5");

const usdcOpenPositionAmount = ethers.parseUnits("1000", 6);
const wethOpenPositionAMount = ethers.parseEther("1");

// current tick is around -202375
const upperTick = -100000;
const lowerTick = -300000;

describe("UniswapInteraction", function () {
  let contract;
  let uniswapPositionManager;
  let weth, usdc;
  let owner;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    // Fork mainnet
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ARBITRUM_RPC_URL, // 在 .env 設定
            blockNumber: 326180000,
          },
        },
      ],
    });

    // Impersonate token holders
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [WETH_HOLDER],
    });
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDC_HOLDER],
    });

    const wethWhale = await ethers.getSigner(WETH_HOLDER);
    const usdcWhale = await ethers.getSigner(USDC_HOLDER);

    // Deploy contract
    const ContractFactory = await ethers.getContractFactory(
      "UniswapInteraction"
    );
    contract = await ContractFactory.deploy();
    await contract.waitForDeployment();

    uniswapPositionManager = await ethers.getContractAt(
      "INonfungiblePositionManager",
      NONFUNGIBLE_POSITION_MANAGER_ADDRESS
    );

    // Get token contracts
    weth = await ethers.getContractAt("IERC20", WETH);
    usdc = await ethers.getContractAt("IERC20", USDC);

    // Transfer tokens to test signer
    await setBalance(wethWhale.address, ethers.parseEther("1"));
    await setBalance(usdcWhale.address, ethers.parseEther("1"));
    await weth.connect(wethWhale).transfer(owner.address, wethTestAmount);
    await usdc.connect(usdcWhale).transfer(owner.address, usdcTestAmount);

    // Approve to contract
    await weth
      .connect(owner)
      .approve(await contract.getAddress(), ethers.MaxUint256);
    await usdc
      .connect(owner)
      .approve(await contract.getAddress(), ethers.MaxUint256);

    // Send tokens to contract
    await weth
      .connect(owner)
      .transfer(await contract.getAddress(), wethTestAmount);
    await usdc
      .connect(owner)
      .transfer(await contract.getAddress(), usdcTestAmount);
  });

  it("should open a position", async () => {
    await contract
      .connect(owner)
      .openPosition(
        lowerTick,
        upperTick,
        wethOpenPositionAMount,
        usdcOpenPositionAmount,
        0,
        0
      );

    const posId = await contract.uniswap_position_id();
    expect(posId).to.not.equal(0);

    const balance = await uniswapPositionManager.balanceOf(
      await contract.getAddress()
    );
    expect(balance).to.equal(1);
  });

  it("should increase liquidity", async () => {
    await contract
      .connect(owner)
      .openPosition(
        lowerTick,
        upperTick,
        wethOpenPositionAMount,
        usdcOpenPositionAmount,
        0,
        0
      );

    const beforeLiquidity = await contract.getPositionLiquidity();

    await contract
      .connect(owner)
      .increaseLiquidity(
        ethers.parseEther("0.5"),
        ethers.parseUnits("500", 6),
        0,
        0
      );

    const afterLiquidity = await contract.getPositionLiquidity();

    expect(afterLiquidity).to.greaterThan(beforeLiquidity);
  });

  it("should not increase liquidity when no position exist", async () => {
    await expect(contract
      .connect(owner)
      .increaseLiquidity(
        ethers.parseEther("0.5"),
        ethers.parseUnits("500", 6),
        0,
        0
      )).to.be.rejectedWith("Position does not exist")
  })

  it("should decrease liquidity", async () => {
    await contract
      .connect(owner)
      .openPosition(
        lowerTick,
        upperTick,
        wethOpenPositionAMount,
        usdcOpenPositionAmount,
        0,
        0
      );
    const beforeLiquidity = await contract.getPositionLiquidity();
    await contract.connect(owner).decreaseLiquidity(1000, 0, 0);

    const afterLiquidity = await contract.getPositionLiquidity();

    expect(beforeLiquidity).to.greaterThan(afterLiquidity);
  });

  it("should not decrease liquidity when no position exist", async () => {
    await expect(contract
      .connect(owner)
      .decreaseLiquidity(
        1000,
        0,
        0
      )).to.be.rejectedWith("Position does not exist")
  })

  it("should collect fees", async () => {
    await contract
      .connect(owner)
      .openPosition(
        lowerTick,
        upperTick,
        wethOpenPositionAMount,
        usdcOpenPositionAmount,
        0,
        0
      );
    await contract.connect(owner).collectTradingFee();
  });

  it("should not collect fee when no position exist", async () => {
    await expect(contract.connect(owner).collectTradingFee()).to.be.rejectedWith("Position does not exist")
  })

  it("should burn the position", async () => {
    await contract
      .connect(owner)
      .openPosition(
        lowerTick,
        upperTick,
        wethOpenPositionAMount,
        usdcOpenPositionAmount,
        0,
        0
      );
    await contract.connect(owner).removeAllLiquidityAndburnPosition();

    const posId = await contract.uniswap_position_id();
    expect(posId).to.equal(0);

    const balance = await uniswapPositionManager.balanceOf(
      await contract.getAddress()
    );
    expect(balance).to.equal(0);
  });

  it("should not burn when no position exist", async () => {
    await expect(contract.connect(owner).removeAllLiquidityAndburnPosition()).to.be.rejectedWith("Position does not exist")
  })
});
