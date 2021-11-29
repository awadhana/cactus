import http from "http";
import { AddressInfo } from "net";
import secp256k1 from "secp256k1";
import "jest-extended";
import { v4 as uuidv4 } from "uuid";
import { randomBytes } from "crypto";
import { PluginObjectStoreIpfs } from "@hyperledger/cactus-plugin-object-store-ipfs";
import { create } from "ipfs-http-client";
import bodyParser from "body-parser";
import express from "express";
import { DefaultApi as ObjectStoreIpfsApi } from "@hyperledger/cactus-plugin-object-store-ipfs";
import {
  SendClientV1Request,
  AssetProfile,
} from "../../../../main/typescript/generated/openapi/typescript-axios";
import {
  IListenOptions,
  LogLevelDesc,
  Servers,
} from "@hyperledger/cactus-common";

import { DefaultApi as OdapApi } from "../../../../main/typescript/public-api";

import { Configuration } from "@hyperledger/cactus-core-api";
import {
  OdapGateway,
  OdapGatewayConstructorOptions,
} from "../../../../main/typescript/gateway/odap-gateway";
import {
  GoIpfsTestContainer,
  pruneDockerAllIfGithubAction,
} from "@hyperledger/cactus-test-tooling";

/**
 * Use this to debug issues with the fabric node SDK
 * ```sh
 * export HFC_LOGGING='{"debug":"console","info":"console"}'
 * ```
 */
let ipfsApiHost: string;
const testCase = "runs odap gateway tests via openApi";
let ipfsContainer: GoIpfsTestContainer;

describe(testCase, () => {
  const logLevel: LogLevelDesc = "TRACE";
  const expressApp = express();
  expressApp.use(bodyParser.json({ limit: "250mb" }));
  const server = http.createServer(expressApp);

  beforeAll(async () => {
    const pruning = pruneDockerAllIfGithubAction({ logLevel });
    await expect(pruning).resolves.toBeTruthy();
  });

  afterAll(async () => {
    await ipfsContainer.stop();
    await ipfsContainer.destroy();
  });
  afterAll(async () => await Servers.shutdown(server));
  afterAll(async () => {
    const pruning = pruneDockerAllIfGithubAction({ logLevel });
    await expect(pruning).resolves.toBeTruthy();
  });

  beforeAll(async () => {
    ipfsContainer = new GoIpfsTestContainer({ logLevel });
    expect(ipfsContainer).toBeTruthy();
    {
      const container = await ipfsContainer.start();
      expect(container).toBeTruthy();
      expect(container).toBeTruthy();
      const listenOptions: IListenOptions = {
        hostname: "0.0.0.0",
        port: 0,
        server,
      };
      const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
      const { address, port } = addressInfo;
      const apiHost = `http://${address}:${port}`;
      ipfsApiHost = apiHost;
      const config = new Configuration({ basePath: apiHost });
      const apiClient = new ObjectStoreIpfsApi(config);
      expect(apiClient).toBeTruthy();
    }
  });
  test(testCase, async () => {
    const ipfsApiUrl = await ipfsContainer.getApiUrl();
    // const ipfsGatewayUrl = await ipfsContainer.getWebGatewayUrl();

    const ipfsClientOrOptions = create({
      url: ipfsApiUrl,
    });
    const instanceId = uuidv4();
    const plugin = new PluginObjectStoreIpfs({
      parentDir: `/${uuidv4()}/${uuidv4()}/`,
      logLevel,
      instanceId,
      ipfsClientOrOptions,
    });

    await plugin.getOrCreateWebServices();
    await plugin.registerWebServices(expressApp);

    const packageName = plugin.getPackageName();
    expect(packageName).toBeTruthy();

    const theInstanceId = plugin.getInstanceId();
    expect(theInstanceId).toBeTruthy();
    expect(theInstanceId).toEqual(instanceId);
  });
  test(testCase, async () => {
    const odapClientGateWayPluginID = uuidv4();
    const odapPluginOptions: OdapGatewayConstructorOptions = {
      name: "cactus-plugin#odapGateway",
      dltIDs: ["dummy"],
      instanceId: odapClientGateWayPluginID,
      ipfsPath: ipfsApiHost,
    };

    const clientOdapGateway = new OdapGateway(odapPluginOptions);

    const odapServerGatewayInstanceID = uuidv4();
    let odapServerGatewayPubKey: string;
    let odapServerGatewayApiHost: string;
    {
      const expressApp = express();
      expressApp.use(bodyParser.json({ limit: "250mb" }));
      const server = http.createServer(expressApp);
      const listenOptions: IListenOptions = {
        hostname: "localhost",
        port: 0,
        server,
      };
      const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
      const { address, port } = addressInfo;
      odapServerGatewayApiHost = `http://${address}:${port}`;
      const odapPluginOptions: OdapGatewayConstructorOptions = {
        name: "cactus-plugin#odapGateway",
        dltIDs: ["dummy"],
        instanceId: odapServerGatewayInstanceID,
        ipfsPath: ipfsApiHost,
      };

      const plugin = new OdapGateway(odapPluginOptions);
      odapServerGatewayPubKey = plugin.pubKey;
      await plugin.getOrCreateWebServices();
      await plugin.registerWebServices(expressApp);
    }
    {
      const expressApp = express();
      expressApp.use(bodyParser.json({ limit: "250mb" }));
      const server = http.createServer(expressApp);
      const listenOptions: IListenOptions = {
        hostname: "localhost",
        port: 0,
        server,
      };
      const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
      const { address, port } = addressInfo;
      const apiHost = `http://${address}:${port}`;
      const apiConfig = new Configuration({ basePath: apiHost });
      const apiClient = new OdapApi(apiConfig);
      await clientOdapGateway.getOrCreateWebServices();
      await clientOdapGateway.registerWebServices(expressApp);
      let dummyPrivKeyBytes = randomBytes(32);
      while (!secp256k1.privateKeyVerify(dummyPrivKeyBytes)) {
        dummyPrivKeyBytes = randomBytes(32);
      }
      const dummyPubKeyBytes = secp256k1.publicKeyCreate(dummyPrivKeyBytes);
      const dummyPubKey = clientOdapGateway.bufArray2HexStr(dummyPubKeyBytes);
      const expiryDate = new Date("23/25/2060").toString();
      const assetProfile: AssetProfile = { expirationDate: expiryDate };
      const odapClientRequest: SendClientV1Request = {
        serverGatewayConfiguration: {
          apiHost: odapServerGatewayApiHost,
        },
        version: "0.0.0",
        loggingProfile: "dummy",
        accessControlProfile: "dummy",
        applicationProfile: "dummy",
        payLoadProfile: {
          assetProfile: assetProfile,
          capabilities: "",
        },
        assetProfile: assetProfile,
        assetControlProfile: "dummy",
        beneficiaryPubkey: dummyPubKey,
        clientDltSystem: "dummy",
        clientIdentityPubkey: clientOdapGateway.pubKey,
        originatorPubkey: dummyPubKey,
        recipientGateWayDltSystem: "dummy",
        recipientGateWayPubkey: odapServerGatewayPubKey,
        serverDltSystem: "dummy",
        serverIdentityPubkey: dummyPubKey,
        sourceGateWayDltSystem: "dummy",
      };
      const res = await apiClient.sendClientRequestV1(odapClientRequest);
      expect(res).toBeTruthy();
    }
  });
});
