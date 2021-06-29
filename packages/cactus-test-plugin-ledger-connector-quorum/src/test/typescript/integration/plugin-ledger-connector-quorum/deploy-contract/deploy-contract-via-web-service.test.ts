import Web3 from "web3";
import { v4 as uuidV4 } from "uuid";
import "jest-extended";
import test, { Test } from "tape-promise/tape";
import {
  QuorumTestLedger,
  IQuorumGenesisOptions,
  IAccount,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";
import HelloWorldContractJson from "../../../../solidity/hello-world-contract/HelloWorld.json";
import {
  Logger,
  LoggerProvider,
  LogLevelDesc,
} from "@hyperledger/cactus-common";
import {
  PluginLedgerConnectorQuorum,
  DefaultApi,
  Web3SigningCredentialType,
  DeployContractSolidityBytecodeV1Request,
  EthContractInvocationType,
  Configuration,
} from "@hyperledger/cactus-plugin-ledger-connector-quorum";

import {
  ApiServer,
  AuthorizationProtocol,
  ConfigService,
  ICactusApiServerOptions,
} from "@hyperledger/cactus-cmd-api-server";

import { PluginRegistry } from "@hyperledger/cactus-core";
import { ICactusPlugin } from "@hyperledger/cactus-core-api";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";
import { AddressInfo } from "net";

const logLevel: LogLevelDesc = "TRACE";
const testCase = "deploys contract via REST API";

const log: Logger = LoggerProvider.getOrCreate({
  label: "test-deploy-contract-via-web-service",
  level: logLevel,
});

const contractName = "HelloWorld";

test("BEFORE " + testCase, async () => {
  const pruning = pruneDockerAllIfGithubAction({ logLevel });
  await expect(pruning).resolves.toBeTruthy();
});

test(testCase, async (t: Test) => {
  // 1. Instantiate a ledger object
  const ledger = new QuorumTestLedger();

  test.onFinish(async () => {
    await ledger.stop();
    await ledger.destroy();
  });

  // 2. Start the actual ledger
  await ledger.start();

  // 3. Gather parameteres needed to run an embedded ApiServer which can connect to/interact with said ledger
  const rpcApiHttpHost = await ledger.getRpcApiHttpHost();

  const configService = new ConfigService();
  const cactusApiServerOptions: ICactusApiServerOptions = configService.newExampleConfig();
  cactusApiServerOptions.authorizationProtocol = AuthorizationProtocol.NONE;
  cactusApiServerOptions.configFile = "";
  cactusApiServerOptions.apiCorsDomainCsv = "*";
  cactusApiServerOptions.apiTlsEnabled = false;
  cactusApiServerOptions.apiPort = 0;
  const config = configService.newExampleConfigConvict(cactusApiServerOptions);
  const plugins: ICactusPlugin[] = [];

  const kvStoragePlugin = new PluginKeychainMemory({
    backend: new Map(),
    instanceId: uuidV4(),
    keychainId: uuidV4(),
  });
  kvStoragePlugin.set(
    HelloWorldContractJson.contractName,
    JSON.stringify(HelloWorldContractJson),
  );
  plugins.push(kvStoragePlugin);

  const ledgerConnectorQuorum = new PluginLedgerConnectorQuorum({
    instanceId: uuidV4(),
    rpcApiHttpHost,
    pluginRegistry: new PluginRegistry({ plugins: [kvStoragePlugin] }),
  });
  plugins.push(ledgerConnectorQuorum);
  const pluginRegistry = new PluginRegistry({ plugins });

  const apiServer = new ApiServer({
    config: config.getProperties(),
    pluginRegistry,
  });
  test.onFinish(() => apiServer.shutdown());

  // 4. Start the API server which now is connected to the quorum ledger
  const apiServerStartOut = await apiServer.start();
  log.debug(`ApiServer.started OK:`, apiServerStartOut);

  // 5. Find a high net worth account in the genesis object of the quorum ledger
  const quorumGenesisOptions: IQuorumGenesisOptions = await ledger.getGenesisJsObject();
  expect(quorumGenesisOptions);
  expect(quorumGenesisOptions.alloc);

  const highNetWorthAccounts: string[] = Object.keys(
    quorumGenesisOptions.alloc,
  ).filter((address: string) => {
    const anAccount: IAccount = quorumGenesisOptions.alloc[address];
    const balance: number = parseInt(anAccount.balance, 10);
    return balance > 10e7;
  });
  const [firstHighNetWorthAccount] = highNetWorthAccounts;

  // 6. Instantiate the SDK dynamically with whatever port the API server ended up bound to (port 0)
  const httpServer = apiServer.getHttpServerApi();
  const addressInfo = httpServer?.address() as AddressInfo;
  log.debug(`AddressInfo: `, addressInfo);
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const protocol = config.get("apiTlsEnabled") ? "https:" : "http:";
  const basePath = `${protocol}//${addressInfo.address}:${addressInfo.port}`;
  log.debug(`SDK base path: %s`, basePath);

  const configuration = new Configuration({ basePath });
  const client = new DefaultApi(configuration);

  // 7. Assemble request to invoke the deploy contract method of the quorum ledger connector plugin via the REST API
  const req: DeployContractSolidityBytecodeV1Request = {
    contractName: HelloWorldContractJson.contractName,
    web3SigningCredential: {
      ethAccount: firstHighNetWorthAccount,
      secret: "",
      type: Web3SigningCredentialType.GethKeychainPassword,
    },
    keychainId: kvStoragePlugin.getKeychainId(),
    gas: 1000000,
  };

  // 8. Deploy smart contract by issuing REST API call
  const res = await client.deployContractSolBytecodeV1(req);

  expect(res).toBeTruthy();
  expect(res.status > 199).toBe(true);
  expect(res.status < 300).toBe(true);

  test("Invoke contract via SDK ApiClient object", async () => {
    const web3 = new Web3(rpcApiHttpHost);
    const testEthAccount = web3.eth.accounts.create(uuidV4());

    const res1 = await client.runTransactionV1({
      web3SigningCredential: {
        ethAccount: firstHighNetWorthAccount,
        secret: "",
        type: Web3SigningCredentialType.GethKeychainPassword,
      },
      transactionConfig: {
        from: firstHighNetWorthAccount,
        to: testEthAccount.address,
        value: 10e9,
      },
    });
    expect(res1).toBeTruthy();
    expect(res1.status > 199).toBe(true);
    expect(res1.status < 300).toBe(true);

    const balance = await web3.eth.getBalance(testEthAccount.address);
    expect(balance).toBeTruthy();
    expect(parseInt(balance, 10)).toEqual(10e9);

    const sayHelloRes = await client.invokeContractV1({
      contractName,
      invocationType: EthContractInvocationType.Call,
      methodName: "sayHello",
      params: [],
      web3SigningCredential: {
        type: Web3SigningCredentialType.None,
      },
      keychainId: kvStoragePlugin.getKeychainId(),
    });
    expect(sayHelloRes).toBeTruthy();
    expect(sayHelloRes.status > 199).toBe(true);
    expect(sayHelloRes.status < 300).toBe(true);
    expect(sayHelloRes.data).toBeTruthy();
    expect(sayHelloRes.data.callOutput).toBeTruthy();
    expect(typeof sayHelloRes.data.callOutput).toBeString();
    expect(sayHelloRes.data.callOutput).toBe("Hello World");

    const newName = `DrCactus${uuidV4()}`;
    const setName1Res = await client.invokeContractV1({
      contractName,
      invocationType: EthContractInvocationType.Send,
      methodName: "setName",
      params: [newName],
      gas: 1000000,
      web3SigningCredential: {
        ethAccount: testEthAccount.address,
        secret: testEthAccount.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      keychainId: kvStoragePlugin.getKeychainId(),
    });
    expect(setName1Res).toBeTruthy();
    expect(setName1Res).toBeTruthy();
    expect(setName1Res.status > 199).toBe(true);
    expect(setName1Res.status < 300).toBe(true);
    expect(setName1Res.data).toBeTruthy();

    const getName1Res = await client.invokeContractV1({
      contractName,
      invocationType: EthContractInvocationType.Call,
      methodName: "getName",
      params: [],
      gas: 1000000,
      web3SigningCredential: {
        ethAccount: testEthAccount.address,
        secret: testEthAccount.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      keychainId: kvStoragePlugin.getKeychainId(),
    });
    expect(getName1Res).toBeTruthy();
    expect(getName1Res.status > 199).toBe(true);
    expect(getName1Res.status < 300).toBe(true);
    expect(getName1Res.data).toBeTruthy();
    expect(getName1Res.data.callOutput).toBeTruthy();
    expect(getName1Res.data.callOutput).toBeString();
    expect(getName1Res.data.callOutput).toEqual(newName);

    const getName2Res = await client.invokeContractV1({
      contractName,
      invocationType: EthContractInvocationType.Send,
      methodName: "getName",
      params: [],
      gas: 1000000,
      web3SigningCredential: {
        ethAccount: testEthAccount.address,
        secret: testEthAccount.privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      keychainId: kvStoragePlugin.getKeychainId(),
    });

    expect(getName2Res).toBeTruthy();
    expect(getName2Res.status > 199).toBe(true);
    expect(getName2Res.status < 300).toBe(true);
    expect(getName2Res.data).toBeTruthy();
    expect(getName2Res.data.callOutput).not.toBeTruthy();
  });
  t.end();
});

test("AFTER " + testCase, async () => {
  const pruning = pruneDockerAllIfGithubAction({ logLevel });
  await expect(pruning).resolves.toBeTruthy();
});
