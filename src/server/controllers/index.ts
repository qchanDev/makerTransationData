import { Context } from "../../context";
import Router from "koa-router";
import { ChainFactory } from "orbiter-chaincore/src/watch/chainFactory";
import { ITransaction } from "orbiter-chaincore/src/types";
import { ScanChainMain } from "orbiter-chaincore";
import path from "path";
import {
  redisEmitter,
  RedisEvent,
} from "orbiter-chaincore/src/utils/redisEmitter";
export async function scanBlock(ctxs: Router.RouterContext)
{
  const { apiKey, chainId, hash, address, startBlock, endBlock }: any =
    ctxs.request.query;
  const checkRes = checkApiKey(apiKey);
  if (checkRes.code !== 0) {
    ctxs.body = checkRes;
    return;
  }
  if (!chainId) {
    ctxs.body = {
      code: 1,
      msg: "Missing parameter chainId",
    };
  } else {
    const ctx: Context = new Context();
    await ctx.init();
    await ctx.mq.connect();
    const prefix = process.env["RABBIT_PREFIX"] || "";
    const exchangeName = `MakerTransationData${prefix}`;
    const producer = await ctx.mq.createProducer({
      exchangeName,
      exchangeType: "direct",
    });
    const makerList = ctx.makerConfigs.map(item =>
      item.sender.toLowerCase(),
    );
    const dir = path.join(process.env.logDir || process.cwd() + "/runtime/api") || "runtime/api";
    const watchService = ChainFactory.createWatchChainByIntranetId(
      String(chainId),
    );
    await watchService.init({
      cache: ScanChainMain.getCacheService(chainId, dir),
      logger: ScanChainMain.getLoggerService(chainId, watchService.chain.chainConfig.name, dir),
    });
    watchService.addWatchAddress(makerList);
    if (hash) {
      const scanTxListByHash = async () => {
        const tx = await watchService.chain.getTransactionByHash(hash);
        await producer.publish([tx], "");
        ctx.logger.info(`api exec ${hash} success`);
      };
      scanTxListByHash();
    } else if (Number(startBlock) && Number(endBlock) && address) {
      const scanTxList = async () => {
        const chainInfo = ctx.config.chains.find(
          item => item.internalId == chainId,
        );
        if (!chainInfo) {
          ctx.logger.error("Missing parameter chainId config");
          return;
        }
        let list: ITransaction[] = [];
        if (chainInfo.watch.includes("rpc")) {
          await watchService.replayBlock(
            startBlock,
            endBlock,
            async function (
              start: any,
              txMap: Map<string, Array<ITransaction>>,
            ) {
              txMap.forEach(function (txList) {
                list.push(...txList);
              });
              if (list.length) await producer.publish(list, "");
            },
          );
        } else {
          list = (await watchService.chain.getTransactions(address, {
            address,
            startblock: startBlock,
            endblock: endBlock,
          }))?.txlist || [];
          if (list.length) await producer.publish(list, "");
        }
        ctx.logger.info(
          `api exec ${address} ${startBlock}-${endBlock} complete`,
        );
      };
      scanTxList();
    } else {
      ctxs.body = {
        code: 1,
        msg: "Missing parameter chainId or startBlock,endBlock,address",
      };
    }
  }

  ctxs.body = {
    code: 0,
    msg: "success",
  };
}

export async function changeBlock(ctx: Router.RouterContext) {
  const { apiKey, chainId, height, timestamp }: any = ctx.request.query;
  const checkRes = checkApiKey(apiKey);
  if (checkRes.code !== 0) {
    ctx.body = checkRes;
    return;
  }
  await redisEmitter.emit(RedisEvent.block, JSON.stringify({
    chainId, height, timestamp,
  }), 3);
  ctx.body = {
    code: 0,
    msg: "success",
  };
}

function checkApiKey(apiKey: string): { code: number, msg?: string } {
  if (!apiKey) {
    return {
      code: 1,
      msg: "Missing parameter apiKey",
    };
  }
  const systemApiKey = process.env["ROUTE_API_KEY"];
  if (!systemApiKey) {
    return {
      code: 1,
      msg: "API key not configured",
    };
  }
  if (apiKey.toLowerCase() !== systemApiKey.toLowerCase()) {
    return {
      code: 1,
      msg: "API key error",
    };
  }
  return {
    code: 0,
  };
}
