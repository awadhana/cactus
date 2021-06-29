import { createServer } from "http";
import { AddressInfo } from "net";
import { JWK, JWS } from "jose";
import { v4 as uuidV4 } from "uuid";
import "jest-extended";
import {
  ApiServer,
  AuthorizationProtocol,
  ConfigService,
} from "@hyperledger/cactus-cmd-api-server";
import {
  IPluginConsortiumManualOptions,
  PluginConsortiumManual,
  DefaultApi,
  Configuration,
} from "@hyperledger/cactus-plugin-consortium-manual";
import {
  CactusNode,
  Consortium,
  ConsortiumDatabase,
  ConsortiumMember,
} from "@hyperledger/cactus-core-api";
import { PluginRegistry } from "@hyperledger/cactus-core";
import { LogLevelDesc } from "@hyperledger/cactus-common";
const testCase = "Get Consortium JWS Endpoint";

describe(testCase, () => {
  const logLevel: LogLevelDesc = "INFO";
  const consortiumId = uuidV4();
  const consortiumName = "Example Corp. & Friends Crypto Consortium";

  const memberId1 = uuidV4();
  const memberId2 = uuidV4();
  const memberId3 = uuidV4();

  const httpServer1 = createServer();

  let apiServer1: ApiServer;
  let apiServer2: ApiServer;
  let apiServer3: ApiServer;
  let addressInfo1: AddressInfo;
  let addressInfo2: AddressInfo;
  let addressInfo3: AddressInfo;
  let node1Host: string;
  let node2Host: string;
  let node3Host: string;

  afterAll(async () => {
    await apiServer1.shutdown();
  });
  afterAll(async () => {
    await apiServer2.shutdown();
  });
  afterAll(async () => {
    await apiServer3.shutdown();
  });

  beforeAll(async () => {
    await new Promise((resolve, reject) => {
      httpServer1.once("error", reject);
      httpServer1.once("listening", resolve);
      httpServer1.listen(0, "127.0.0.1");
    });
    addressInfo1 = httpServer1.address() as AddressInfo;
    node1Host = `http://${addressInfo1.address}:${addressInfo1.port}`;
  });

  afterAll(() => httpServer1.close());

  let keyPair1: JWK.ECKey;
  let pubKeyPem1: string;
  let member1: ConsortiumMember;
  let node1: CactusNode;

  let keyPair3: JWK.ECKey;
  let pubKeyPem3: string;

  beforeAll(async () => {
    keyPair1 = await JWK.generate("EC", "secp256k1");
    pubKeyPem1 = keyPair1.toPEM(false);
    node1 = {
      consortiumId,
      memberId: memberId1,
      id: "Example_Cactus_Node_1",
      nodeApiHost: node1Host,
      publicKeyPem: pubKeyPem1,
      ledgerIds: [],
      pluginInstanceIds: [],
    };

    member1 = {
      id: memberId1,
      name: "Example Corp 1",
      nodeIds: [node1.id],
    };
  });

  const httpServer2 = createServer();
  beforeAll(async () => {
    await new Promise((resolve, reject) => {
      httpServer2.once("error", reject);
      httpServer2.once("listening", resolve);
      httpServer2.listen(0, "127.0.0.1");
    });
    addressInfo2 = httpServer2.address() as AddressInfo;
    node2Host = `http://${addressInfo2.address}:${addressInfo2.port}`;
  });

  let keyPair2: JWK.ECKey;
  let pubKeyPem2: string;
  beforeAll(async () => {
    keyPair2 = await JWK.generate("EC", "secp256k1");
    pubKeyPem2 = keyPair2.toPEM(false);
  });

  const httpServer3 = createServer();
  beforeAll(async () => {
    await new Promise((resolve, reject) => {
      httpServer3.once("error", reject);
      httpServer3.once("listening", resolve);
      httpServer3.listen(0, "127.0.0.1");
    });
    addressInfo3 = httpServer3.address() as AddressInfo;
    node3Host = `http://${addressInfo3.address}:${addressInfo3.port}`;
  });

  beforeAll(async () => {
    keyPair3 = await JWK.generate("EC", "secp256k1");
    pubKeyPem3 = keyPair2.toPEM(false);
  });

  let node2: CactusNode;
  let member2: ConsortiumMember;
  beforeAll(() => {
    node2 = {
      consortiumId,
      memberId: memberId2,
      id: "Example_Cactus_Node_2",
      nodeApiHost: node2Host,
      publicKeyPem: pubKeyPem2,
      ledgerIds: [],
      pluginInstanceIds: [],
    };

    member2 = {
      id: memberId2,
      name: "Example Corp 2",
      nodeIds: [node2.id],
    };
  });

  let node3: CactusNode;
  let member3: ConsortiumMember;

  beforeAll(() => {
    node3 = {
      consortiumId,
      memberId: memberId3,
      id: "Example_Cactus_Node_3",
      nodeApiHost: node3Host,
      publicKeyPem: pubKeyPem3,
      ledgerIds: [],
      pluginInstanceIds: [],
    };

    member3 = {
      id: memberId3,
      name: "Example Corp 3",
      nodeIds: [node3.id],
    };
  });

  let consortium: Consortium;
  let consortiumDatabase: ConsortiumDatabase;
  beforeAll(() => {
    consortium = {
      id: consortiumId,
      mainApiHost: node1Host,
      name: consortiumName,
      memberIds: [memberId1, memberId2, memberId3],
    };

    consortiumDatabase = {
      cactusNode: [node1, node2, node3],
      consortium: [consortium],
      consortiumMember: [member1, member2, member3],
      ledger: [],
      pluginInstance: [],
    };
  });

  test("member node public keys and hosts are pre-shared", async () => {
    {
      // 2. Instantiate plugin registry which will provide the web service plugin with the key value storage plugin
      const pluginRegistry = new PluginRegistry({ plugins: [] });

      // 3. Instantiate the web service consortium plugin
      const options: IPluginConsortiumManualOptions = {
        instanceId: uuidV4(),
        pluginRegistry,
        keyPairPem: keyPair1.toPEM(true),
        consortiumDatabase,
        logLevel,
      };
      const pluginConsortiumManual = new PluginConsortiumManual(options);

      // 4. Create the API Server object that we embed in this test
      const configService = new ConfigService();
      const apiServerOptions = configService.newExampleConfig();
      apiServerOptions.authorizationProtocol = AuthorizationProtocol.NONE;
      apiServerOptions.configFile = "";
      apiServerOptions.apiCorsDomainCsv = "*";
      apiServerOptions.apiPort = addressInfo1.port;
      apiServerOptions.cockpitPort = 0;
      apiServerOptions.apiTlsEnabled = false;
      apiServerOptions.grpcMtlsEnabled = false;
      apiServerOptions.grpcPort = 0;
      const config = configService.newExampleConfigConvict(apiServerOptions);

      pluginRegistry.add(pluginConsortiumManual);

      apiServer1 = new ApiServer({
        httpServerApi: httpServer1,
        config: config.getProperties(),
        pluginRegistry,
      });

      // 6. Start the API server which is now listening on port A and it's healthcheck works through the main SDK
      await apiServer1.start();

      const configuration = new Configuration({ basePath: node1Host });
      const api = new DefaultApi(configuration);
      const res = await api.getNodeJwsV1();
      expect(res).toBeTruthy();
      expect(res.status).toEqual(200);
      expect(res.data).toBeTruthy();
      expect(res.data.jws).toBeTruthy();
      const payload = JWS.verify(res.data.jws, keyPair1.toPEM(false));
      expect(payload).toBeTruthy();
    }
    {
      const pluginRegistry = new PluginRegistry({ plugins: [] });

      const options: IPluginConsortiumManualOptions = {
        instanceId: uuidV4(),
        pluginRegistry,
        keyPairPem: keyPair2.toPEM(true),
        consortiumDatabase,
        logLevel,
      };
      const pluginConsortiumManual = new PluginConsortiumManual(options);

      // 4. Create the API Server object that we embed in this test
      const configService = new ConfigService();
      const apiServerOptions = configService.newExampleConfig();
      apiServerOptions.authorizationProtocol = AuthorizationProtocol.NONE;
      apiServerOptions.configFile = "";
      apiServerOptions.apiCorsDomainCsv = "*";
      apiServerOptions.apiPort = addressInfo2.port;
      apiServerOptions.cockpitPort = 0;
      apiServerOptions.apiTlsEnabled = false;
      apiServerOptions.grpcMtlsEnabled = false;
      apiServerOptions.grpcPort = 0;
      const config = configService.newExampleConfigConvict(apiServerOptions);

      pluginRegistry.add(pluginConsortiumManual);

      apiServer2 = new ApiServer({
        httpServerApi: httpServer2,
        config: config.getProperties(),
        pluginRegistry,
      });

      // 6. Start the API server which is now listening on port A and it's healthcheck works through the main SDK
      await apiServer2.start();

      const configuration = new Configuration({ basePath: node2Host });
      const api = new DefaultApi(configuration);
      const res = await api.getNodeJwsV1();
      expect(res).toBeTruthy();
      expect(res.status).toEqual(200);
      expect(res.data).toBeTruthy();
      expect(res.data.jws).toBeTruthy();
      const payload = JWS.verify(res.data.jws, keyPair2.toPEM(false));
      expect(payload).toBeTruthy();
    }

    {
      // 2. Instantiate plugin registry which will provide the web service plugin with the key value storage plugin
      const pluginRegistry = new PluginRegistry({ plugins: [] });

      // 3. Instantiate the web service consortium plugin
      const options: IPluginConsortiumManualOptions = {
        instanceId: uuidV4(),
        pluginRegistry,
        keyPairPem: keyPair3.toPEM(true),
        consortiumDatabase,
        logLevel,
      };
      const pluginConsortiumManual = new PluginConsortiumManual(options);

      // 4. Create the API Server object that we embed in this test
      const configService = new ConfigService();
      const apiServerOptions = configService.newExampleConfig();
      apiServerOptions.authorizationProtocol = AuthorizationProtocol.NONE;
      apiServerOptions.configFile = "";
      apiServerOptions.apiCorsDomainCsv = "*";
      apiServerOptions.apiPort = addressInfo3.port;
      apiServerOptions.cockpitPort = 0;
      apiServerOptions.apiTlsEnabled = false;
      apiServerOptions.grpcMtlsEnabled = false;
      apiServerOptions.grpcPort = 0;
      const config = configService.newExampleConfigConvict(apiServerOptions);

      pluginRegistry.add(pluginConsortiumManual);

      apiServer3 = new ApiServer({
        httpServerApi: httpServer3,
        config: config.getProperties(),
        pluginRegistry,
      });

      // 6. Start the API server which is now listening on port A and it's healthcheck works through the main SDK
      await apiServer3.start();

      // 7. Instantiate the main SDK dynamically with whatever port the API server ended up bound to (port 0)

      const configuration = new Configuration({ basePath: node3Host });
      const api = new DefaultApi(configuration);
      const res = await api.getNodeJwsV1();
      expect(res).toBeTruthy();
      expect(res.status).toEqual(200);
      expect(res.data).toBeTruthy();
      expect(res.data.jws).toBeTruthy();
      const payload = JWS.verify(res.data.jws, keyPair3.toPEM(false));
      expect(payload).toBeTruthy();
    }

    {
      const configuration = new Configuration({ basePath: node3Host });
      const api = new DefaultApi(configuration);
      const res = await api.getConsortiumJwsV1();
      expect(res.status).toEqual(200);
      const getConsortiumJwsResponse = res.data;
      const consortiumJws = getConsortiumJwsResponse.jws;
      const payload1 = JWS.verify(consortiumJws, keyPair1.toPEM(false));
      const payload2 = JWS.verify(consortiumJws, keyPair2.toPEM(false));
      const payload3 = JWS.verify(consortiumJws, keyPair3.toPEM(false));
      expect(payload1).toBeTruthy();
      expect(payload2).toBeTruthy();
      expect(payload3).toBeTruthy();

      const wrongKey = await JWK.generate("EC", "secp256k1");
      expect(() => {
        JWS.verify(consortiumJws, wrongKey);
      }).toThrow();
    }

    {
      const configuration = new Configuration({ basePath: node2Host });
      const api = new DefaultApi(configuration);
      const res = await api.getConsortiumJwsV1();
      expect(res.status).toEqual(200);
      const getConsortiumJwsResponse = res.data;
      const consortiumJws = getConsortiumJwsResponse.jws;
      const payload1 = JWS.verify(consortiumJws, keyPair1.toPEM(false));
      const payload2 = JWS.verify(consortiumJws, keyPair2.toPEM(false));
      const payload3 = JWS.verify(consortiumJws, keyPair3.toPEM(false));
      expect(payload1).toBeTruthy();
      expect(payload2).toBeTruthy();
      expect(payload3).toBeTruthy();

      const wrongKey = await JWK.generate("EC", "secp256k1");
      expect(() => {
        JWS.verify(consortiumJws, wrongKey);
      }).toThrow();
    }

    {
      const configuration = new Configuration({ basePath: node1Host });
      const api = new DefaultApi(configuration);
      const res = await api.getConsortiumJwsV1();
      expect(res.status).toEqual(200);
      const getConsortiumJwsResponse = res.data;
      const consortiumJws = getConsortiumJwsResponse.jws;
      const payload1 = JWS.verify(consortiumJws, keyPair1.toPEM(false));
      const payload2 = JWS.verify(consortiumJws, keyPair2.toPEM(false));
      const payload3 = JWS.verify(consortiumJws, keyPair3.toPEM(false));
      expect(payload1).toBeTruthy();
      expect(payload2).toBeTruthy();
      expect(payload3).toBeTruthy();

      const wrongKey = await JWK.generate("EC", "secp256k1");
      expect(() => {
        JWS.verify(consortiumJws, wrongKey);
      }).toThrow();
    }
  });
});
