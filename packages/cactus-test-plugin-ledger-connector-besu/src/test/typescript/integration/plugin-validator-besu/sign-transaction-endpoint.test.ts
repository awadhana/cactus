import "jest-extended";
import { v4 as uuidv4 } from "uuid";
import { createServer } from "http";
import KeyEncoder from "key-encoder";
import { AddressInfo } from "net";
import Web3 from "web3";
import EEAClient, { IWeb3InstanceExtended } from "web3-eea";

import {
  ApiServer,
  AuthorizationProtocol,
  ConfigService,
} from "@hyperledger/cactus-cmd-api-server";
import {
  JsObjectSigner,
  IJsObjectSignerOptions,
  Secp256k1Keys,
  KeyFormat,
  LogLevelDesc,
} from "@hyperledger/cactus-common";

import {
  BesuTestLedger,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";

import {
  BesuApiClientOptions,
  BesuApiClient,
  IPluginLedgerConnectorBesuOptions,
  PluginLedgerConnectorBesu,
  SignTransactionRequest,
} from "@hyperledger/cactus-plugin-ledger-connector-besu";

import { PluginRegistry } from "@hyperledger/cactus-core";

import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";

const testCase = "Test sign transaction endpoint";
const logLevel: LogLevelDesc = "TRACE";

describe(testCase, () => {
  const besuTestLedger = new BesuTestLedger();
  const httpServer1 = createServer();
  let addressInfo1,
    node1Host,
    rpcApiHttpHost: string,
    rpcApiWsHost: string,
    configuration: BesuApiClientOptions,
    api: BesuApiClient;

  beforeAll(async () => {
    const pruning = pruneDockerAllIfGithubAction({ logLevel });
    await expect(pruning).resolves.toBeTruthy();
  });

  afterAll(async () => {
    await besuTestLedger.stop();
    await besuTestLedger.destroy();
  });

  afterAll(async () => {
    const pruning = pruneDockerAllIfGithubAction({ logLevel });
    await expect(pruning).resolves.toBeTruthy();
  });

  beforeAll(async () => {
    await besuTestLedger.start();
    addressInfo1 = httpServer1.address() as AddressInfo;
    node1Host = `http://${addressInfo1.address}:${addressInfo1.port}`;
    configuration = new BesuApiClientOptions({ basePath: node1Host });
    api = new BesuApiClient(configuration);
    rpcApiHttpHost = await besuTestLedger.getRpcApiHttpHost();
    rpcApiWsHost = await besuTestLedger.getRpcApiWsHost();
  });

  test(testCase, async () => {
    const keyEncoder: KeyEncoder = new KeyEncoder("secp256k1");
    const keychainId = uuidv4();
    const keychainRef = uuidv4();

    const { privateKey } = Secp256k1Keys.generateKeyPairsBuffer();
    const keyHex = privateKey.toString("hex");
    const pem = keyEncoder.encodePrivate(keyHex, KeyFormat.Raw, KeyFormat.PEM);

    const keychain = new PluginKeychainMemory({
      backend: new Map([[keychainRef, pem]]),
      keychainId,
      logLevel,
      instanceId: uuidv4(),
    });

    await new Promise((resolve, reject) => {
      httpServer1.once("error", reject);
      httpServer1.once("listening", resolve);
      httpServer1.listen(0, "127.0.0.1");
    });

    const jsObjectSignerOptions: IJsObjectSignerOptions = {
      privateKey: keyHex,
      logLevel,
    };
    const jsObjectSigner = new JsObjectSigner(jsObjectSignerOptions);

    // 2. Instantiate plugin registry which will provide the web service plugin with the key value storage plugin
    const pluginRegistry = new PluginRegistry({ plugins: [keychain] });

    // 3. Instantiate the web service consortium plugin
    const options: IPluginLedgerConnectorBesuOptions = {
      instanceId: uuidv4(),
      rpcApiHttpHost,
      rpcApiWsHost,
      pluginRegistry,
      logLevel,
    };
    const pluginValidatorBesu = new PluginLedgerConnectorBesu(options);

    // 4. Create the API Server object that we embed in this test
    const configService = new ConfigService();
    const apiServerOptions = configService.newExampleConfig();
    apiServerOptions.authorizationProtocol = AuthorizationProtocol.NONE;
    apiServerOptions.configFile = "";
    apiServerOptions.apiCorsDomainCsv = "*";
    apiServerOptions.apiPort = addressInfo1.port;
    apiServerOptions.cockpitPort = 0;
    apiServerOptions.grpcPort = 0;
    apiServerOptions.apiTlsEnabled = false;
    const config = configService.newExampleConfigConvict(apiServerOptions);

    pluginRegistry.add(pluginValidatorBesu);

    const apiServer = new ApiServer({
      httpServerApi: httpServer1,
      config: config.getProperties(),
      pluginRegistry,
    });

    // 5. make sure the API server is shut down when the testing if finished.
    test.onFinish(() => apiServer.shutdown());

    // 6. Start the API server which is now listening on port A and it's healthcheck works through the main SDK
    await apiServer.start();

    // 7. Instantiate the main SDK dynamically with whatever port the API server ended up bound to (port 0)

    const web3Provider = new Web3.providers.HttpProvider(rpcApiHttpHost);
    const web3 = new Web3(web3Provider);
    const web3Eea: IWeb3InstanceExtended = EEAClient(web3, 2018);

    const orionKeyPair = await besuTestLedger.getOrionKeyPair();
    const besuKeyPair = await besuTestLedger.getBesuKeyPair();

    const besuPrivateKey = besuKeyPair.privateKey.toLowerCase().startsWith("0x")
      ? besuKeyPair.privateKey.substring(2)
      : besuKeyPair.privateKey; // besu node's private key

    const contractOptions = {
      data: `0x123`,
      // privateFrom : Orion public key of the sender.
      privateFrom: orionKeyPair.publicKey,
      // privateFor : Orion public keys of recipients or privacyGroupId: Privacy group to receive the transaction
      privateFor: [orionKeyPair.publicKey],
      // privateKey: Ethereum private key with which to sign the transaction.
      privateKey: besuPrivateKey,
    };

    const transactionHash = await web3Eea.eea.sendRawTransaction(
      contractOptions,
    );

    const transaction = await web3.eth.getTransaction(transactionHash);
    const singData = jsObjectSigner.sign(transaction.input);
    const signDataHex = Buffer.from(singData).toString("hex");

    const request: SignTransactionRequest = {
      keychainId,
      keychainRef,
      transactionHash: transactionHash,
    };

    // Test for 200 valid response test case
    const res = await api.signTransactionV1(request);
    expect(res).toBeTruthy();
    expect(signDataHex).toBe(res.data.signature);

    // Test for 404 Transaction not found test case
    try {
      const notFoundRequest: SignTransactionRequest = {
        keychainId: "fake",
        keychainRef: "fake",
        transactionHash:
          "0x46eac4d1d1ff81837698cbab38862a428ddf042f92855a72010de2771a7b704d",
      };
      await api.signTransactionV1(notFoundRequest);
    } catch (error) {
      expect(error.response.status).toEqual(404);
      expect(error.response.statusText).toEqual("Transaction not found");
    }
  });
});
