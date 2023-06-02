import { Transaction } from "./../models/Transactions";
import dayjs from "dayjs";
import { chains } from "orbiter-chaincore";
import { ITransaction, TransactionStatus } from "orbiter-chaincore/src/types";
import { dydx } from "orbiter-chaincore/src/utils";
import BigNumber from "bignumber.js";
import {
  equals,
  fix0xPadStartAddress,
  isEmpty,
} from "orbiter-chaincore/src/utils/core";
import { InferCreationAttributes } from "sequelize";
import { Context } from "../context";
import { TranferId } from "../utils";
import {
  getAccountAddressError,
  getAmountFlag,
  getAmountToSend,
  getFormatDate,
  getPTextFromTAmount,
} from "../utils/oldUtils";
import { IMarket } from "../types";
import RLP from "rlp";
import { ethers } from "ethers";
import { prodDb } from "./match";
export async function validateTransactionSpecifications(
  ctx: Context,
  tx: ITransaction,
) {
  const isOrbiterX = tx.source == "xvm" || tx.extra["xvm"]; // temp
  const result = {
    orbiterX: false,
    isToMaker: false,
    isToUser: false,
    intercept: true,
    isToUserCrossAddress: false,
  };
  if (isOrbiterX) {
    result.orbiterX = true;
  }
  const isMakerSend = !!ctx.makerConfigs.find(
    item =>
      equals(item.sender, tx.from) ||
      equals(item.crossAddress?.sender, tx.from),
  );
  if (isMakerSend) {
    result.isToUser = true;
  }
  if (
    Object.values(ctx.config.crossAddressTransferMap).includes(
      tx.from.toLocaleLowerCase(),
    )
  ) {
    result.isToUserCrossAddress = true;
  }
  const isUserSend = !!ctx.makerConfigs.find(
    item =>
      equals(item.recipient, tx.to) ||
      equals(item.crossAddress?.recipient, tx.to),
  );
  if (isUserSend) {
    result.isToMaker = true;
  }
  if (
    result.isToMaker ||
    result.isToUser ||
    result.orbiterX ||
    result.isToUserCrossAddress
  ) {
    result.intercept = false;
  }
  return result;
}
export function validMakerAddress(ctx: Context, address: string) {
  const data = ctx.makerConfigs.find(
    row => equals(row.sender, address) || equals(row.recipient, address),
  );
  return !isEmpty(data);
}
export async function bulkCreateTransaction(
  ctx: Context,
  txlist: Array<any>,
): Promise<Array<Transaction>> {
  const upsertList: Array<Transaction> = [];
  for (const row of txlist) {
    const count = (await prodDb.query(`select count(1) from transaction where hash="${row.hash}" and status=99`))[0];
    if (count) {
      console.log(`${row.hash} is success in mainnet`);
      continue;
    }
    try {
      if (!row || upsertList.findIndex(tx => equals(tx.hash, row.hash)) >= 0) {
        continue;
      }
      if (isEmpty(row.symbol)) {
        continue;
      }
      // ctx.logger.info(`processSubTx:${tx.hash}`);
      const chainConfig = chains.getChainInfo(String(row.chainId));
      if (!chainConfig) {
        ctx.logger.error(
          `getChainByInternalId chainId ${row.chainId} not found(${row.hash})`,
          row,
        );
        continue;
      }
      const toToken = chains.getTokenByChain(
        Number(chainConfig.internalId),
        String(row.tokenAddress),
      );
      if (!toToken) {
        ctx.logger.error(
          ` Token Not Found  ${row.chainId} ${row.hash} ${row.tokenAddress}`,
        );
        continue;
      }
      const value: string = new BigNumber(String(row.value)).toFixed();
      if (value.length >= 32) {
        ctx.logger.error(
          `Amount format error ${row.chainId} ${row.hash} ${getFormatDate(
            row.timestamp,
          )}, value = ${value}`,
        );
        continue;
      }
      let memo = getAmountFlag(
        Number(chainConfig.internalId),
        String(row.value),
      );
      const rst = getPTextFromTAmount(Number(chainConfig.internalId), String(row.value));
      let pText = rst.state ? Number(rst.pText).toString().substring(0, 4) : "0";
      const txExtra = row.extra || {};
      if (["9", "99"].includes(chainConfig.internalId) && txExtra) {
        const arr = txExtra.memo.split("_");
        memo = String(+arr[0] % 9000);
        pText = String(+arr[0]);
      } else if (
        ["11", "511"].includes(chainConfig.internalId) &&
        txExtra["type"] === "TRANSFER_OUT"
      ) {
        if (!row.to) {
          row.to = dydx.getEthereumAddressFromClientId(txExtra["clientId"]);
        }
      }
      const txData: Partial<Transaction> = {
        hash: row.hash.toLowerCase(),
        nonce: String(row.nonce),
        blockHash: row.blockHash,
        blockNumber: row.blockNumber,
        transactionIndex: row.transactionIndex,
        from: row.from,
        to: row.to,
        value,
        symbol: row.symbol,
        gasPrice: row.gasPrice,
        gas: row.gas,
        input: row.input != "0x" ? row.input : undefined,
        status: row.status,
        tokenAddress: row.tokenAddress || "",
        timestamp: dayjs(row.timestamp * 1000)
          .utc()
          .toDate(),
        fee: String(row.fee),
        feeToken: row.feeToken,
        chainId: Number(chainConfig.internalId),
        source: row.source,
        extra: {},
        memo,
        replyAccount: undefined,
        replySender: undefined,
        side: 0,
        makerId: undefined,
        lpId: undefined,
        expectValue: undefined,
        transferId: "",
      };
      const saveExtra: any = {
        ebcId: "",
        server: process.env['ServerName']
      };
      const { isToMaker, isToUser, orbiterX, intercept, isToUserCrossAddress } =
        await validateTransactionSpecifications(ctx, row);
      if (intercept) {
        ctx.logger.info(`${txData.hash} intercept isToMaker=${isToMaker}, isToUser=${isToUser},orbiterX=${orbiterX},isToUserCrossAddress=${isToUserCrossAddress}`);
        continue;
      }
      if (!isToUser && !isToMaker && !orbiterX && !isToUserCrossAddress) {
        ctx.logger.info(`MakerTx ${txData.hash} Not Find Maker Address!`);
        continue;
      }
      if (
        (validMakerAddress(ctx, String(txData.from)) &&
        validMakerAddress(ctx, String(txData.to)))
        || (isToMaker && Number(pText) < 9000)
      ) {
        txData.status = 3;
        txData.extra["reason"] = isToMaker && Number(pText) < 9000 ? "memo" : "maker";
        // upsertList.push(<any>txData);
        continue;
      }
      if (orbiterX) {
        try {
          await handleXVMTx(ctx, txData, txExtra, saveExtra, upsertList);
        } catch (error) {
          ctx.logger.error("handle xvm error", error);
        }
      } else if (isToUser || isToUserCrossAddress) {
        txData.side = 1;
        // maker send
        txData.replyAccount = txData.to;
        txData.replySender = row.from;
        txData.transferId = TranferId(
          String(txData.chainId),
          String(txData.replySender),
          String(txData.replyAccount),
          String(txData.memo),
          String(txData.symbol),
          String(txData.value),
        );
        saveExtra.toSymbol = txData.symbol;
      } else if (isToMaker) {
        txData.side = 0;
        const fromChainId = Number(txData.chainId);
        const toChainId = Number(txData.memo);
        // user send
        txData.replyAccount = txData.from;
        txData.replySender = txData.to;
        if ([99, 9].includes(fromChainId)) {
          const arr = txExtra.memo.split("_");
          if (arr.length > 1) {
            txData.replyAccount = arr[1];
          }
        } else if ([44, 4, 11, 511].includes(fromChainId) && txExtra["ext"]) {
          // dydx contract send
          // starknet contract send
          txData.replyAccount = fix0xPadStartAddress(txExtra["ext"], 42);
        }

        if ([44, 4, 11, 511].includes(toChainId)) {
          const ext = txExtra["ext"] || "";
          saveExtra["ext"] = ext;
          if (isEmpty(ext)) {
            txData.status = 3;
            txData.replyAccount = null;
          } else {
            // 11,511 0x02 first
            // 4, 44 0x03 first
            switch (String(toChainId)) {
              case "11":
              case "511":
                txData.replyAccount = ext.replace("0x02", "0x");
                break;
              case "4":
              case "44":
                txData.replyAccount = ext.replace("0x03", "0x");
                break;
            }
            // txData.replyAccount = `0x${ext.substring(4)}`;
            if ([44, 4].includes(toChainId) && !isEmpty(ext)) {
              txData.replyAccount = fix0xPadStartAddress(txData.replyAccount, 66);
            }
          }
        }
        if (Number(txData.nonce) > 8999 && txData.source!='xvm') {
          txData.status = 3;
          txData.extra['reason'] = 'nonce too high, not allowed';
          upsertList.push(<any>txData);
          continue;
        }
        const market = getMarket(
          ctx,
          fromChainId,
          toChainId,
          String(txData.symbol),
          String(txData.symbol),
          txData.timestamp,
          true,
          String(txData.to)
        );

        const error: string | null = getAccountAddressError(txData.replyAccount, toChainId);
        if (error) {
          ctx.logger.error(`Illegal user starknet address ${txData.replyAccount} hash:${txData.hash}, ${error}`);
        }
        if (!market || isEmpty(txData.replyAccount) || error) {
          // market not found
          txData.status = 3;
        } else {
          // valid timestamp
          txData.lpId = market.id || null;
          txData.makerId = market.makerId || null;
          // ebc
          saveExtra.ebcId = market.ebcId;
          saveExtra.ua = {
            toTokenAddress: market.toChain?.tokenAddress,
          };
          saveExtra.toSymbol = market.toChain.symbol;
          txData.replySender = market.sender;
          // calc response amount
          try {
            const calcResultAmount = getAmountToSend(
              Number(fromChainId),
              Number(toChainId),
              txData.value.toString(),
              market,
              txData.nonce,
            )?.tAmount || 0;
            txData.expectValue = new BigNumber(calcResultAmount).toString();
            txData.transferId = TranferId(
              String(toChainId),
              txData.replySender,
              String(txData.replyAccount),
              String(txData.nonce),
              String(txData.symbol),
              txData.expectValue,
            );
          } catch (error) {
            ctx.logger.error(
              "bulkCreateTransaction calcMakerSendAmount error:",
              error,
            );
          }
        }
      }

      if (
        [3, 33, 8, 88, 12, 512, 9, 99].includes(Number(txData.chainId)) && txData.status === TransactionStatus.PENDING) {
        txData.status = TransactionStatus.COMPLETE;
      }
      // valid cache status
      const cacheStatus = await ctx.redis.hget(
        "TXHASH_STATUS",
        String(txData.hash),
      );
      if (cacheStatus && Number(cacheStatus) == 99) {
        // ctx.logger.info(
        //   `From Cache ${txData.hash} The transaction status has already been matched`,
        // );
        continue;
      }
      // valid status
      const tx = await ctx.models.Transaction.findOne({
        attributes: ["id", "status"],
        where: {
          hash: txData.hash,
        },
      });
      if (tx) {
        // status:0=PENDING,1=COMPLETE,2=REJECT,3=MatchFailed,4=refund,5=timers not match,99= MatchSuccess,98=makerDelayTransfer
        if (tx.status === 99) {
          // save
          if (tx.side === 0) {
            await clearMatchCache(
              ctx,
              Number(txData.chainId),
              Number(txData.memo),
              String(txData.hash),
              "",
              Number(txData.id),
              0,
              txData.transferId,
            );
          } else if (tx.side === 1) {
            await clearMatchCache(
              ctx,
              0,
              Number(txData.chainId),
              "",
              String(txData.hash),
              0,
              Number(txData.id),
              txData.transferId,
            );
          }
          // ctx.logger.info(
          //   `From DB ${txData.hash} The transaction status has already been matched`,
          // );
          continue;
        }
      }
      txData.extra = saveExtra;
      await ctx.redis.hset(
        `TX:${txData.chainId}`,
        String(txData.hash),
        JSON.stringify({
          hash: txData.hash,
          status: txData.status,
          chainId: txData.chainId,
          side: txData.side,
          from: txData.from,
          to: txData.to,
          value: txData.value,
          symbol: txData.symbol,
          extra: txData.extra || {},
          memo: txData.memo,
          replyAccount: txData.replyAccount,
          replySender: txData.replySender,
          expectValue: txData.expectValue,
          transferId: txData.transferId,
        }),
      );
      upsertList.push(<any>txData);
    } catch (error) {
      ctx.logger.error("for handle tx error:", error);
    }
  }
  if (upsertList.length <= 0) {
    return [];
  }
  for (const txData of upsertList) {
    if (txData.status !== 1) continue;
    const t = await ctx.models.sequelize.transaction();
    try {
      await ctx.models.Transaction.findOrCreate({
        defaults: txData,
        attributes: ["id", "status"],
        where: {
          hash: txData.hash,
        },
        transaction: t,
      });
      await t.commit();
    } catch (error) {
      t && t.rollback();
    }
  }
  return upsertList as any;
}
async function handleXVMTx(
  ctx: Context,
  txData: Partial<Transaction>,
  txExtra: any,
  saveExtra: any,
  _upsertList: Array<InferCreationAttributes<Transaction>>,
) {
  saveExtra.xvm = txExtra.xvm;
  const { name, params } = txExtra.xvm;
  txData.value = params.value;
  if (name.toLowerCase() === "swap") {
    const decodeData = decodeSwapData(params.data);
    params.data = decodeData;
    txData.memo = String(decodeData.toChainId);
    const fromChainId = Number(txData.chainId);
    const toChainId = Number(txData.memo);
    const market = getMarket(
      ctx,
      fromChainId,
      toChainId,
      String(txData.tokenAddress),
      decodeData.toTokenAddress,
      txData.timestamp,
      false,
      params['recipient']
    );
    if (!market) {
      // market not found
      txData.status = 3;
      ctx.logger.error("Market not found", txData.hash);
    } else {
      txData.lpId = market.id || null;
      txData.makerId = market.makerId || null;
      saveExtra["ebcId"] = market.ebcId;
      saveExtra.toSymbol = market.toChain.symbol;
      txData.side = 0;
      txData.replySender = market.sender;
      txData.replyAccount = decodeData.toWalletAddress;
      if ([44, 4].includes(toChainId) && !isEmpty(txData.replyAccount)) {
        txData.replyAccount = fix0xPadStartAddress(txData.replyAccount, 66);
      }
      txData.expectValue = decodeData.expectValue;
      txData.transferId = TranferId(
        String(market.toChain.id),
        String(txData.replySender),
        String(txData.replyAccount),
        String(txData.nonce),
        String(market.toChain.symbol),
        String(txData.expectValue),
      );
    }
  } else if (name.toLowerCase() === "swapanswer") {
    // TODO: No association created @Soul
    txData.side = 1;
    const { tradeId, op } = decodeSwapAnswerData(params.data);
    txData.to = params.recipient;
    txData.replyAccount = params.recipient;
    txData.replySender = txData.from;
    // const userTx = await ctx.models.Transaction.findOne(<any>{
    //   // attributes: [
    //   //   "id",
    //   //   "hash",
    //   //   "status",
    //   //   "chainId",
    //   //   "transferId",
    //   //   "replyAccount",
    //   //   "replySender",
    //   //   "side",
    //   // ],
    //   where: {
    //     hash: tradeId,
    //   },
    // });
    if (op == 2) {
      txData.status = 4;
      saveExtra["sendBack"] = {
        fromHash: tradeId,
      };
    }
    // const market = ctx.makerConfigs.find(item =>
    //   equals(item.toChain.tokenAddress, params.token),
    // );
    // if (market) {
    //   saveExtra.toSymbol = market.toChain.symbol;
    // }
    // if (userTx) {
    //   txData.memo = String(userTx.chainId);
    //   txData.transferId = userTx.transferId;
    //   txData.replyAccount = userTx.replyAccount;
    //   txData.replySender = userTx.replySender;
    //   if (op == 2) {
    //     // userTx.status = 4;
    //     // upsertList.push(userTx);
    //   }
    //   if (op == 3) {
    //     // userTx.status = 95;
    //     txData.status = 95;
    //     // upsertList.push(userTx);
    //   }
    // } else {
    //   ctx.logger.error(
    //     `get userTx fail,tradeId:${tradeId}, hash:${txData.hash}`,
    //   );
    // }
  }
}
function getMarket(
  ctx: Context,
  fromChainId: number,
  toChainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  timestamp: any,
  isSymbol: boolean,
  maker: string
) {
  if (isSymbol)
    return ctx.makerConfigs.find(
      m =>
        equals(m.fromChain.id, fromChainId) &&
        equals(m.toChain.id, toChainId) &&
        equals(m.fromChain.symbol, fromTokenAddress) &&
        equals(m.toChain.symbol, toTokenAddress) &&
        dayjs(timestamp).unix() >= m.times[0] &&
        dayjs(timestamp).unix() <= m.times[1] &&
        equals(maker, m.recipient)
    );
  return ctx.makerConfigs.find(
    m =>
      equals(m.fromChain.id, fromChainId) &&
      equals(m.toChain.id, toChainId) &&
      equals(m.fromChain.tokenAddress, fromTokenAddress) &&
      equals(m.toChain.tokenAddress, toTokenAddress) &&
      dayjs(timestamp).unix() >= m.times[0] &&
      dayjs(timestamp).unix() <= m.times[1] &&
      (equals(maker, m.recipient) || equals(maker, m.sender))
  );
}

function decodeSwapData(data: string): {
  toChainId: number;
  toTokenAddress: string;
  toWalletAddress: string;
  expectValue: string;
  slippage: number;
} {
  const decoded: any = RLP.decode(data);
  const result: any = {};
  decoded.forEach((item: any, index: number) => {
    switch (index) {
      case 0:
        result.toChainId = Number(ethers.utils.hexlify(item));
        break;
      case 1:
        result.toTokenAddress = ethers.utils.hexlify(item);
        break;
      case 2:
        result.toWalletAddress = ethers.utils.hexlify(item);
        break;
      case 3:
        result.expectValue = new BigNumber(
          ethers.utils.hexlify(item),
        ).toString();
        break;
      case 4:
        result.slippage = Number(item.toString());
        break;
    }
  });
  return result;
}

function decodeSwapAnswerData(data: string): {
  tradeId: string;
  op: number;
} {
  const dataDecode: any = RLP.decode(data);
  const tradeId = Buffer.from(dataDecode[0]).toString();
  const op = Number(Buffer.from(dataDecode[1]).toString());
  return { tradeId, op };
}

export async function calcMakerSendAmount(
  makerConfigs: Array<any>,
  trx: Transaction,
) {
  if (
    isEmpty(trx.chainId) ||
    isEmpty(trx.memo) ||
    isEmpty(trx.symbol) ||
    isEmpty(trx.tokenAddress) ||
    isEmpty(trx.timestamp)
  ) {
    throw new Error("Missing parameter");
  }
  const fromChainId = Number(trx.chainId);
  const toChainId = Number(trx.memo);
  const market: IMarket = makerConfigs.find(
    m =>
      equals(m.fromChain.id, fromChainId) &&
      equals(m.toChain.id, toChainId) &&
      equals(m.fromChain.symbol, trx.symbol) &&
      equals(m.fromChain.tokenAddress, trx.tokenAddress) &&
      dayjs(trx.timestamp).unix() >= m.times[0] &&
      dayjs(trx.timestamp).unix() <= m.times[1] &&
      equals(trx.to, m.recipient)
  );
  if (!market) {
    return 0;
  }
  const result = getAmountToSend(
    Number(fromChainId),
    Number(toChainId),
    trx.value.toString(),
    market,
    trx.nonce,
  )?.tAmount;
  return result || 0;
}

export async function clearMatchCache(
  ctx: Context,
  fromChain: number,
  toChainId: number,
  inHash: string,
  outHash: string,
  inId: number,
  outId: number,
  transferId?: string,
) {
  // const user transferId
  const redisT = ctx.redis.multi();
  if (fromChain) {
    const userTx = await ctx.redis.hget(`TX:${fromChain}`, inHash).then(res => {
      return res && JSON.parse(res);
    });
    if (userTx && userTx.transferId) {
      redisT.hdel(`UserPendingTx:${toChainId}`, userTx.transferId);
    }
  }
  if (toChainId && transferId) {
    redisT.hdel(`UserPendingTx:${toChainId}`, transferId);
  }
  const TXHASH_STATUS = [];
  if (inHash) TXHASH_STATUS.push(inHash, 99);
  if (outHash) {
    TXHASH_STATUS.push(outHash, 99);
    if (toChainId) {
      redisT.zrem(`MakerPendingTx:${toChainId}`, outHash);
    }
  }
  const TXID_STATUS = [];
  if (inId) TXID_STATUS.push(inId, 99);
  if (outId) TXID_STATUS.push(outId, 99);
  redisT
    .hmset(`TXHASH_STATUS`, TXHASH_STATUS)
    .hmset(`TXID_STATUS`, TXID_STATUS);
  await redisT.exec().catch(error => {
    ctx.logger.error("clearMatchCache erorr", error);
  });
}
