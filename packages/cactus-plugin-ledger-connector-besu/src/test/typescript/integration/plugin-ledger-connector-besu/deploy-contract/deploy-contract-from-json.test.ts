import { v4 as uuidv4 } from "uuid";
import "jest-extended";
import test, { Test } from "tape-promise/tape";

import { Server as SocketIoServer } from "socket.io";
import { PluginRegistry } from "@hyperledger/cactus-core";
import {
  EthContractInvocationType,
  Web3SigningCredentialType,
  PluginLedgerConnectorBesu,
  PluginFactoryLedgerConnector,
  Web3SigningCredentialCactusKeychainRef,
  ReceiptType,
  BesuApiClient,
  WatchBlocksV1Progress,
  Web3BlockHeader,
} from "../../../../../main/typescript/public-api";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";
import {
  BesuTestLedger,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";
import {
  LogLevelDesc,
  IListenOptions,
  Servers,
} from "@hyperledger/cactus-common";
import HelloWorldContractJson from "../../../../solidity/hello-world-contract/HelloWorld.json";
import Web3 from "web3";
import { Constants, PluginImportType } from "@hyperledger/cactus-core-api";
import express from "express";
import bodyParser from "body-parser";
import http from "http";
import { AddressInfo } from "net";
import { K_CACTUS_BESU_TOTAL_TX_COUNT } from "../../../../../main/typescript/prometheus-exporter/metrics";
import { BesuApiClientOptions } from "../../../../../main/typescript/api-client/besu-api-client";

const testCase = "deploys contract via .json file";
const logLevel: LogLevelDesc = "TRACE";

test("BEFORE " + testCase, async () => {
  const pruning = pruneDockerAllIfGithubAction({ logLevel });
  await expect(pruning).resolves.toBeTruthy();
});

test(testCase, async (t: Test) => {
  t.comment("I'm just here for the error of no t in the method");
  const besuTestLedger = new BesuTestLedger();
  await besuTestLedger.start();

  test.onFinish(async () => {
    await besuTestLedger.stop();
    await besuTestLedger.destroy();
    await pruneDockerAllIfGithubAction({ logLevel });
  });

  const rpcApiHttpHost = await besuTestLedger.getRpcApiHttpHost();
  const rpcApiWsHost = await besuTestLedger.getRpcApiWsHost();

  /**
   * Constant defining the standard 'dev' Besu genesis.json contents.
   *
   * @see https://github.com/hyperledger/besu/blob/1.5.1/config/src/main/resources/dev.json
   */

  const firstHighNetWorthAccount = besuTestLedger.getGenesisAccountPubKey();
  const besuKeyPair = {
    privateKey: besuTestLedger.getGenesisAccountPrivKey(),
  };

  const web3 = new Web3(rpcApiHttpHost);
  const testEthAccount = web3.eth.accounts.create(uuidv4());

  const keychainEntryKey = uuidv4();
  const keychainEntryValue = testEthAccount.privateKey;
  const keychainPlugin = new PluginKeychainMemory({
    instanceId: uuidv4(),
    keychainId: uuidv4(),
    // pre-provision keychain with mock backend holding the private key of the
    // test account that we'll reference while sending requests with the
    // signing credential pointing to this keychain entry.
    backend: new Map([[keychainEntryKey, keychainEntryValue]]),
    logLevel,
  });
  keychainPlugin.set(
    HelloWorldContractJson.contractName,
    JSON.stringify(HelloWorldContractJson),
  );
  const factory = new PluginFactoryLedgerConnector({
    pluginImportType: PluginImportType.Local,
  });

  const connector: PluginLedgerConnectorBesu = await factory.create({
    rpcApiHttpHost,
    rpcApiWsHost,
    logLevel,
    instanceId: uuidv4(),
    pluginRegistry: new PluginRegistry({ plugins: [keychainPlugin] }),
  });
  await connector.onPluginInit();

  const expressApp = express();
  expressApp.use(bodyParser.json({ limit: "250mb" }));
  const server = http.createServer(expressApp);

  const wsApi = new SocketIoServer(server, {
    path: Constants.SocketIoConnectionPathV1,
  });

  const listenOptions: IListenOptions = {
    hostname: "localhost",
    port: 0,
    server,
  };
  const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
  test.onFinish(async () => await Servers.shutdown(server));
  const { address, port } = addressInfo;
  const apiHost = `http://${address}:${port}`;
  // const wsBasePath = apiHost + Constants.SocketIoConnectionPathV1;
  const besuApiClientOptions = new BesuApiClientOptions({ basePath: apiHost });
  const apiClient = new BesuApiClient(besuApiClientOptions);

  await connector.getOrCreateWebServices();
  await connector.registerWebServices(expressApp, wsApi);

  await connector.transact({
    web3SigningCredential: {
      ethAccount: firstHighNetWorthAccount,
      secret: besuKeyPair.privateKey,
      type: Web3SigningCredentialType.PrivateKeyHex,
    },
    transactionConfig: {
      from: firstHighNetWorthAccount,
      to: testEthAccount.address,
      value: 10e9,
      gas: 1000000,
    },
    consistencyStrategy: {
      blockConfirmations: 0,
      receiptType: ReceiptType.NodeTxPoolAck,
      timeoutMs: 60000,
    },
  });

  const blocks = await apiClient.watchBlocksV1();

  const aBlockHeader = await new Promise<Web3BlockHeader>((resolve, reject) => {
    let done = false;
    const timerId = setTimeout(() => {
      if (!done) {
        reject("Waiting for block header notification to arrive timed out");
      }
    }, 10000);
    const subscription = blocks.subscribe((res: WatchBlocksV1Progress) => {
      subscription.unsubscribe();
      done = true;
      clearTimeout(timerId);
      resolve(res.blockHeader);
    });
  });
  expect(aBlockHeader).toBeTruthy();

  const balance = await web3.eth.getBalance(testEthAccount.address);
  expect(balance).toBeTruthy();
  expect(parseInt(balance, 10)).toEqual(10e9);

  let contractAddress: string;

  test("deploys contract via .json file", async () => {
    const deployOut = await connector.deployContract({
      keychainId: keychainPlugin.getKeychainId(),
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      constructorArgs: [],
      web3SigningCredential: {
        ethAccount: firstHighNetWorthAccount,
        secret: besuKeyPair.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      bytecode: HelloWorldContractJson.bytecode,
      gas: 1000000,
    });
    expect(deployOut).toBeTruthy();
    expect(deployOut.transactionReceipt).toBeTruthy();
    expect(deployOut.transactionReceipt.contractAddress).toBeTruthy();

    contractAddress = deployOut.transactionReceipt.contractAddress as string;
    expect(typeof contractAddress).toBeString();

    const { callOutput: helloMsg } = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Call,
      methodName: "sayHello",
      params: [],
      signingCredential: {
        ethAccount: firstHighNetWorthAccount,
        secret: besuKeyPair.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
    });
    expect(helloMsg).toBeTruthy();
    expect(typeof helloMsg).toBeString();
  });

  test("invoke Web3SigningCredentialType.NONE", async () => {
    const testEthAccount2 = web3.eth.accounts.create(uuidv4());

    const { rawTransaction } = await web3.eth.accounts.signTransaction(
      {
        from: testEthAccount.address,
        to: testEthAccount2.address,
        value: 10e6,
        gas: 1000000,
      },
      testEthAccount.privateKey,
    );

    await connector.transact({
      web3SigningCredential: {
        type: Web3SigningCredentialType.None,
      },
      transactionConfig: {
        rawTransaction,
      },
      consistencyStrategy: {
        blockConfirmations: 0,
        receiptType: ReceiptType.NodeTxPoolAck,
        timeoutMs: 60000,
      },
    });

    const balance2 = await web3.eth.getBalance(testEthAccount2.address);
    expect(balance2).toBeTruthy();
    expect(parseInt(balance2, 10)).toEqual(10e6);
  });

  test("invoke Web3SigningCredentialType.PrivateKeyHex", async () => {
    const newName = `DrCactus${uuidv4()}`;
    const setNameOut = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Send,
      methodName: "setName",
      params: [newName],
      signingCredential: {
        ethAccount: testEthAccount.address,
        secret: testEthAccount.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      nonce: 1,
    });
    expect(setNameOut).toBeTruthy();

    try {
      await connector.invokeContract({
        contractName: HelloWorldContractJson.contractName,
        contractAbi: HelloWorldContractJson.abi,
        contractAddress,
        invocationType: EthContractInvocationType.Send,
        methodName: "setName",
        params: [newName],
        gas: 1000000,
        signingCredential: {
          ethAccount: testEthAccount.address,
          secret: testEthAccount.privateKey,
          type: Web3SigningCredentialType.PrivateKeyHex,
        },
        nonce: 1,
      });
      fail("Invalid request with bad nonce. Succeed but it shouldn't have");
    } catch (error) {
      expect(error).not.toBe("Nonce too low");
    }
    const { callOutput: getNameOut } = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Call,
      methodName: "getName",
      params: [],
      gas: 1000000,
      signingCredential: {
        ethAccount: testEthAccount.address,
        secret: testEthAccount.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
    });
    expect(getNameOut).toEqual(newName);

    const getNameOut2 = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Send,
      methodName: "getName",
      params: [],
      gas: 1000000,
      signingCredential: {
        ethAccount: testEthAccount.address,
        secret: testEthAccount.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
    });
    expect(getNameOut2).toBeTruthy();

    const response = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Send,
      methodName: "deposit",
      params: [],
      gas: 1000000,
      signingCredential: {
        ethAccount: testEthAccount.address,
        secret: testEthAccount.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      value: 10,
    });
    expect(response).toBeTruthy();

    const { callOutput } = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Call,
      methodName: "getNameByIndex",
      params: [0],
      gas: 1000000,
      signingCredential: {
        ethAccount: testEthAccount.address,
        secret: testEthAccount.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
    });
    expect(callOutput).toEqual(newName);
  });

  test("invoke Web3SigningCredentialType.CactusKeychainRef", async () => {
    const newName = `DrCactus${uuidv4()}`;

    const signingCredential: Web3SigningCredentialCactusKeychainRef = {
      ethAccount: testEthAccount.address,
      keychainEntryKey,
      keychainId: keychainPlugin.getKeychainId(),
      type: Web3SigningCredentialType.CactusKeychainRef,
    };

    const setNameOut = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Send,
      methodName: "setName",
      params: [newName],
      gas: 1000000,
      signingCredential,
      nonce: 4,
    });
    expect(setNameOut).toBeTruthy();

    try {
      await connector.invokeContract({
        contractName: HelloWorldContractJson.contractName,
        contractAbi: HelloWorldContractJson.abi,
        contractAddress,
        invocationType: EthContractInvocationType.Send,
        methodName: "setName",
        params: [newName],
        gas: 1000000,
        signingCredential,
        nonce: 4,
      });
      fail("Invalid request with bad nonce. Succeed but it shouldn't have");
    } catch (error) {
      expect(error).not.toBe("Nonce too low");
    }

    const { callOutput: getNameOut } = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Call,
      methodName: "getName",
      params: [],
      gas: 1000000,
      signingCredential,
    });
    expect(getNameOut).toEqual(newName);

    const getNameOut2 = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Send,
      methodName: "getName",
      params: [],
      gas: 1000000,
      signingCredential,
    });
    expect(getNameOut2).toBeTruthy();

    const response = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Send,
      methodName: "deposit",
      params: [],
      gas: 1000000,
      signingCredential,
      value: 10,
    });
    expect(response).toBeTruthy();

    const { callOutput } = await connector.invokeContract({
      contractName: HelloWorldContractJson.contractName,
      contractAbi: HelloWorldContractJson.abi,
      contractAddress,
      invocationType: EthContractInvocationType.Call,
      methodName: "getNameByIndex",
      params: [1],
      gas: 1000000,
      signingCredential,
    });
    expect(callOutput).toEqual(newName);
  });

  test("get prometheus exporter metrics", async () => {
    const res = await apiClient.getPrometheusMetricsV1();
    const promMetricsOutput =
      "# HELP " +
      K_CACTUS_BESU_TOTAL_TX_COUNT +
      " Total transactions executed\n" +
      "# TYPE " +
      K_CACTUS_BESU_TOTAL_TX_COUNT +
      " gauge\n" +
      K_CACTUS_BESU_TOTAL_TX_COUNT +
      '{type="' +
      K_CACTUS_BESU_TOTAL_TX_COUNT +
      '"} 9';
    expect(res).toBeTruthy();
    expect(res.data).toBeTruthy();
    expect(res.status).toEqual(200);
    expect(res.data.includes(promMetricsOutput)).toBe(true);
  });
});
