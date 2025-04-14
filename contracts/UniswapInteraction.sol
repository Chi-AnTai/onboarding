pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {INonfungiblePositionManager} from "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";

contract UniswapInteraction {
    address public constant UNI_POSITION_MANAGER_ADDRESS =
        0xC36442b4a4522E871399CD717aBDD847Ab11FE88;

    address public constant WETH_ADDRESS =
        0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;

    address public constant USDC_ADDRESS =
        0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;

    uint24 public constant UNISWAP_FEE = 500;

    uint256 public uniswap_position_id = 0;

    function openPosition(
        int24 lowerTick,
        int24 upperTick,
        uint256 amount0,
        uint256 amount1,
        uint256 amount0Min,
        uint256 amount1Min
    ) external {
        IERC20(WETH_ADDRESS).approve(UNI_POSITION_MANAGER_ADDRESS, amount0);
        IERC20(USDC_ADDRESS).approve(UNI_POSITION_MANAGER_ADDRESS, amount1);
        INonfungiblePositionManager.MintParams
            memory params = INonfungiblePositionManager.MintParams({
                token0: WETH_ADDRESS,
                token1: USDC_ADDRESS,
                fee: UNISWAP_FEE,
                tickLower: lowerTick,
                tickUpper: upperTick,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                recipient: address(this),
                deadline: block.timestamp
            });
        (uint256 tokenId, , , ) = INonfungiblePositionManager(
            UNI_POSITION_MANAGER_ADDRESS
        ).mint(params);

        uniswap_position_id = tokenId;
    }

    function increaseLiquidity(
        uint256 amount0,
        uint256 amount1,
        uint256 amount0Min,
        uint256 amount1Min
    ) external {
        require(uniswap_position_id != 0, "Position does not exist");

        IERC20(WETH_ADDRESS).approve(UNI_POSITION_MANAGER_ADDRESS, amount0);
        IERC20(USDC_ADDRESS).approve(UNI_POSITION_MANAGER_ADDRESS, amount1);

        INonfungiblePositionManager.IncreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .IncreaseLiquidityParams({
                    tokenId: uniswap_position_id,
                    amount0Desired: amount0,
                    amount1Desired: amount1,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp
                });

        INonfungiblePositionManager(UNI_POSITION_MANAGER_ADDRESS)
            .increaseLiquidity(params);
    }

    function decreaseLiquidity(
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min
    ) external {
        require(uniswap_position_id != 0, "Position does not exist");

        INonfungiblePositionManager.DecreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: uniswap_position_id,
                    liquidity: liquidity,
                    amount0Min: amount0Min,
                    amount1Min: amount1Min,
                    deadline: block.timestamp
                });

        INonfungiblePositionManager(UNI_POSITION_MANAGER_ADDRESS)
            .decreaseLiquidity(params);
    }

    function collectTradingFee() external {
        require(uniswap_position_id != 0, "Position does not exist");

        INonfungiblePositionManager.CollectParams
            memory collectParams = INonfungiblePositionManager.CollectParams({
                tokenId: uniswap_position_id,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        // Collect position fee.
        (uint256 amount0, uint256 amount1) = INonfungiblePositionManager(
            UNI_POSITION_MANAGER_ADDRESS
        ).collect(collectParams);
    }

    function removeAllLiquidityAndburnPosition() external {
        require(uniswap_position_id != 0, "Position does not exist");

        uint128 liquidity = getPositionLiquidity();

        INonfungiblePositionManager.DecreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: uniswap_position_id,
                    liquidity: liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                });

        INonfungiblePositionManager(UNI_POSITION_MANAGER_ADDRESS)
            .decreaseLiquidity(params);

        INonfungiblePositionManager.CollectParams
            memory collectParams = INonfungiblePositionManager.CollectParams({
                tokenId: uniswap_position_id,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });
        INonfungiblePositionManager(UNI_POSITION_MANAGER_ADDRESS).collect(
            collectParams
        );

        INonfungiblePositionManager(UNI_POSITION_MANAGER_ADDRESS).burn(
            uniswap_position_id
        );
        uniswap_position_id = 0;
    }

    function getPositionLiquidity() public view returns (uint128 liquidity) {
        (, , , , , , , liquidity, , , , ) = INonfungiblePositionManager(
            UNI_POSITION_MANAGER_ADDRESS
        ).positions(uniswap_position_id);
    }
}
