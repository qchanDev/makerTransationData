import { IChainCfg, IMakerCfg, IMakerDataCfg, IMarket } from "../types";
import { uniq, flatten } from "lodash";
import chainMain from "../config/chain.json";
import chainTest from "../config/chainTest.json";

import { isProd } from "../config/config";
import { Context } from "../context";

export const chain: IChainCfg[] = <any[]>(isProd() ? chainMain : chainTest);

export function groupWatchAddressByChain(
  ctx: Context,
  makerList: Array<IMarket>,
): {
  [key: string]: Array<string>;
} {
  const chainIds = uniq(
    flatten(makerList.map(row => [row.fromChain.id, row.toChain.id])),
  );
  const chain: any = {};
  for (const id of chainIds) {
    //
    const recipientAddress = uniq(
      makerList.filter(m => m.fromChain.id === id).map(m => m.recipient),
    );
    const senderAddress = uniq(
      makerList.filter(m => m.toChain.id === id).map(m => m.sender),
    );
    if (Number(id) === 4) {
      chain[id] = uniq([
        "0x064A24243F2Aabae8D2148FA878276e6E6E452E3941b417f3c33b1649EA83e11",
        "0x07b393627bd514d2aa4c83e9f0c468939df15ea3c29980cd8e7be3ec847795f0"]);
    } else {
      chain[id] = uniq([
        "0x80C67432656d59144cEFf962E8fAF8926599bCF8",
        "0xE4eDb277e41dc89aB076a1F049f4a3EfA700bCE8",
        "0x646592183ff25a0c44f09896a384004778f831ed"]);
    }
  }
  return chain;
}

export function convertMakerConfig(makerMap: IMakerCfg): IMarket[] {
  // const makerMap: IMakerCfg = <any>maker;
  const chainList: IChainCfg[] = <any>chain;
  const configs: IMarket[] = [];
  for (const chainIdPair in makerMap) {
    if (!makerMap.hasOwnProperty(chainIdPair)) continue;
    const symbolPairMap = makerMap[chainIdPair];
    const [fromChainId, toChainId] = chainIdPair.split("-");
    const c1Chain = chainList.find(item => +item.internalId === +fromChainId);
    const c2Chain = chainList.find(item => +item.internalId === +toChainId);
    if (!c1Chain || !c2Chain) continue;
    for (const symbolPair in symbolPairMap) {
      if (!symbolPairMap.hasOwnProperty(symbolPair)) continue;
      const makerData: IMakerDataCfg = symbolPairMap[symbolPair];
      const [fromChainSymbol, toChainSymbol] = symbolPair.split("-");
      const fromToken = [...c1Chain.tokens, c1Chain.nativeCurrency].find(
        item => item.symbol === fromChainSymbol,
      );
      const toToken = [...c2Chain.tokens, c2Chain.nativeCurrency].find(
        item => item.symbol === toChainSymbol,
      );
      if (!fromToken || !toToken) continue;
      // handle makerConfigs
      configs.push({
        id: "",
        makerId: "",
        ebcId: "",
        slippage: makerData.slippage || 0,
        recipient: makerData.makerAddress,
        sender: makerData.sender,
        tradingFee: makerData.tradingFee,
        gasFee: makerData.gasFee,
        fromChain: {
          id: +fromChainId,
          name: c1Chain.name,
          tokenAddress: fromToken.address,
          symbol: fromChainSymbol,
          decimals: fromToken.decimals,
          minPrice: makerData.minPrice,
          maxPrice: makerData.maxPrice,
        },
        toChain: {
          id: +toChainId,
          name: c2Chain.name,
          tokenAddress: toToken.address,
          symbol: toChainSymbol,
          decimals: toToken.decimals,
        },
        times: [makerData.startTime, makerData.endTime],
        crossAddress: {
          recipient: makerData.crossAddress?.makerAddress,
          sender: makerData.crossAddress?.sender,
          tradingFee: makerData.crossAddress?.tradingFee,
          gasFee: makerData.crossAddress?.gasFee,
        },
      });
    }
  }
  return JSON.parse(JSON.stringify(configs));
}

export function convertChainConfig(env_prefix: string): IChainCfg[] {
  chainConfigList = <any>chain;
  for (const chain of chainConfigList) {
    chain.rpc = chain.rpc || [];
    const apiKey =
      process.env[`${env_prefix}_CHAIN_API_KEY_${chain.internalId}`];
    const wpRpc = process.env[`${env_prefix}_WP_${chain.internalId}`];
    const hpRpc = process.env[`${env_prefix}_HP_${chain.internalId}`];
    if (chain.api && apiKey) {
      chain.api.key = apiKey;
    }
    if (wpRpc) {
      chain.rpc.unshift(wpRpc);
    }
    if (hpRpc) {
      chain.rpc.unshift(hpRpc);
    }
  }
  return JSON.parse(JSON.stringify(chainConfigList));
}

export let chainConfigList: IChainCfg[] = [];
