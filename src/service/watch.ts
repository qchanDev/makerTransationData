import { pubSub, ScanChainMain } from "orbiter-chaincore";
import { chains } from "orbiter-chaincore";
import { Transaction } from "orbiter-chaincore/src/types";
import { groupWatchAddressByChain } from "../utils";
import { Context } from "../context";

import {
  bulkCreateTransaction,
} from "./transaction";
import dayjs from "dayjs";
import { prodDb } from "./match";
export class Watch {
  constructor(public readonly ctx: Context) { }
  public async saveTxRawToCache(txList: Transaction[]) {
    try {
      if (txList && Array.isArray(txList)) {
        txList.forEach(tx => {
          try {
            const chainConfig = chains.getChainInfo(String(tx.chainId));
            const ymd = dayjs(tx.timestamp * 1000).format("YYYYMM");
            this.ctx.redis
              .multi()
              .zadd(
                `TX_RAW:${chainConfig?.internalId}:hash:${ymd}`,
                dayjs(tx.timestamp * 1000).valueOf(),
                tx.hash,
              )
              .hset(
                `TX_RAW:${chainConfig?.internalId}:${ymd}`,
                tx.hash,
                JSON.stringify(tx),
              )
              .exec();
          } catch (error) {
            this.ctx.logger.error(`pubSub.subscribe error`, error);
          }
        });
      }
    } catch (error) {
      this.ctx.logger.error("saveTxRawToCache error", error);
    }
  }
  public async start() {
    const starknetHashFormat = (txHash: string) => {
      if (txHash.length < 66) {
        const end = txHash.substring(2, txHash.length);
        const add = 64 - end.length;
        let addStr = "";
        for (let i = 0; i < add; i++) {
          addStr += "0";
        }
        txHash = "0x" + addStr + end;
      }
      return txHash;
    };
    const ctx = this.ctx;
    try {
      const chainGroup = groupWatchAddressByChain(ctx, ctx.makerConfigs);
      const scanChain = new ScanChainMain(ctx.config.chains);
      for (const id in chainGroup) {
        if (process.env["SingleChain"]) {
          const isScan = process.env["SingleChain"]
            .split(",")
            .includes(String(id));
          if (!isScan) {
            ctx.logger.info(`Single-chain configuration filtering ${id}`);
            continue;
          }
        }
        if (Number(id) % this.ctx.instanceCount !== this.ctx.instanceId) {
          continue;
        }
        ctx.logger.info(
          `Start Subscribe ChainId: ${id}, instanceId:${this.ctx.instanceId}, instances:${this.ctx.instanceCount}`,
        );

        pubSub.subscribe(`${id}:txlist`, async (txList: Transaction[]) => {
          for (const tx of txList) {
            const chainId: any = tx.chainId;
            const hash = chainId == "SN_MAIN" ? starknetHashFormat(tx.hash) : tx.hash;
            const count = (await prodDb.query(`select count(1) from transaction where hash="${hash}"`))[0][0]["count(1)"];
            if (count) {
              console.log(`${chainId} ${hash} is success in mainnet DB ${count}`);
              continue;
            }
            ctx.logger.info(`handle hash ${chainId} ${hash}`);
            await bulkCreateTransaction(ctx, [tx]);
          }
          return true;
        });
        scanChain.startScanChain(id, chainGroup[id]).catch(error => {
          ctx.logger.error(`${id} startScanChain error:`, error);
        });
      }
      pubSub.subscribe("ACCEPTED_ON_L2:4", async (tx: any) => {
        if (tx) {
          try {
            await this.saveTxRawToCache([tx]);
            // return await bulkCreateTransaction(ctx, [tx]);
            const chainId: any = tx.chainId;
            const hash = chainId == "SN_MAIN" ? starknetHashFormat(tx.hash) : tx.hash;
            const count = (await prodDb.query(`select count(1) from transaction where hash="${hash}"`))[0][0]["count(1)"];
            if (count) {
              console.log(`${chainId} ${hash} is success in mainnet DB ${count}`);
              return;
            }
            ctx.logger.info(`handle hash ${chainId} ${hash}`);
            await bulkCreateTransaction(ctx, [tx]);
          } catch (error) {
          }
        }
      });
      process.on("SIGINT", () => {
        scanChain.pause().catch(error => {
          ctx.logger.error("chaincore pause error:", error);
        });
        process.exit(0);
      });
    } catch (error: any) {
      ctx.logger.error("startSub error:", error);
    }
  }
}
