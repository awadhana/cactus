import { AddressInfo } from "net";
import expressJwt from "express-jwt";
import "jest-extended";
import { v4 as uuidv4 } from "uuid";
import { JWK, JWT } from "jose";
import { StatusCodes } from "http-status-codes";

import {
  AuthorizationProtocol,
  ConfigService,
  Configuration,
  IAuthorizationConfig,
} from "@hyperledger/cactus-cmd-api-server";

import {
  LoggerProvider,
  LogLevelDesc,
  Servers,
} from "@hyperledger/cactus-common";

import {
  pruneDockerAllIfGithubAction,
  Containers,
} from "@hyperledger/cactus-test-tooling";

import {
  AuthzScope,
  DefaultApi as CarbonAccountingApi,
} from "@hyperledger/cactus-example-carbon-accounting-business-logic-plugin";

import {
  CarbonAccountingApp,
  ICarbonAccountingAppOptions,
} from "../../../main/typescript/carbon-accounting-app";

const testCase = "can enroll new admin users onto the Fabric org";
describe(testCase, () => {
  const logLevel: LogLevelDesc = "TRACE";
  const log = LoggerProvider.getOrCreate({
    label: testCase,
    level: logLevel,
  });
  let addressInfo: AddressInfo,
    address: string,
    port: number,
    carbonAccountingApp: CarbonAccountingApp,
    apiBaseUrl: string,
    jwtSignOptions: JWT.SignOptions,
    apiClientBad: CarbonAccountingApi,
    apiClient: CarbonAccountingApi;

  beforeAll(async () => {
    const pruning = pruneDockerAllIfGithubAction({ logLevel });
    await expect(pruning).resolves.toBeTruthy();
  });
  afterAll(async () => {
    await Containers.logDiagnostics({ logLevel });
  });
  beforeAll(async () => {
    const jwtKeyPair = await JWK.generate("RSA", 4096);
    const jwtPublicKey = jwtKeyPair.toPEM(false);
    const configService = new ConfigService();
    const expressJwtOptions: expressJwt.Options = {
      algorithms: ["RS256"],
      secret: jwtPublicKey,
      audience: "carbon-accounting-tool-servers-hostname-here",
      issuer: uuidv4(),
    };
    const jwtPayload = {
      name: "Peter",
      scope: [AuthzScope.GroupAdmin],
    };
    const tokenWithScope = JWT.sign(jwtPayload, jwtKeyPair, jwtSignOptions);
    const verification = JWT.verify(tokenWithScope, jwtKeyPair, jwtSignOptions);
    expect(verification).toBeTruthy();
    jwtSignOptions = {
      algorithm: "RS256",
      issuer: expressJwtOptions.issuer,
      audience: expressJwtOptions.audience,
    };
    const configTokenWithScope = new Configuration({
      basePath: apiBaseUrl,
      baseOptions: {
        headers: {
          Authorization: `Bearer ${tokenWithScope}`,
        },
      },
    });
    const socketIoJwtOptions = { secret: jwtPublicKey };
    const authorizationConfig: IAuthorizationConfig = {
      unprotectedEndpointExemptions: [],
      expressJwtOptions,
      socketIoJwtOptions,
    };
    const httpGui = await Servers.startOnPreferredPort(3000);
    const httpApi = await Servers.startOnPreferredPort(4000);
    expect(expressJwtOptions).toBeTruthy();
    expect(httpGui.listening).toBe(true);
    expect(httpApi.listening).toBe(true);

    const apiSrvOpts = configService.newExampleConfig();
    apiSrvOpts.authorizationProtocol = AuthorizationProtocol.JSON_WEB_TOKEN;
    apiSrvOpts.authorizationConfigJson = authorizationConfig;
    apiSrvOpts.configFile = "";
    apiSrvOpts.apiCorsDomainCsv = "*";
    apiSrvOpts.apiPort = 0;
    apiSrvOpts.cockpitPort = 0;
    apiSrvOpts.grpcPort = 0;
    apiSrvOpts.apiTlsEnabled = false;
    apiSrvOpts.plugins = [];
    const convictConfig = configService.newExampleConfigConvict(apiSrvOpts);
    const apiServerOptions = convictConfig.getProperties();
    const appOptions: ICarbonAccountingAppOptions = {
      logLevel: apiSrvOpts.logLevel,
      apiServerOptions,
      httpGui,
      httpApi,
      disableSignalHandlers: true,
    };
    const tokenNoScope = JWT.sign({ scope: [] }, jwtKeyPair, jwtSignOptions);
    const configTokenWithoutScope = new Configuration({
      basePath: apiBaseUrl,
      baseOptions: {
        headers: {
          Authorization: `Bearer ${tokenNoScope}`,
        },
      },
    });
    apiClientBad = new CarbonAccountingApi(configTokenWithoutScope);

    carbonAccountingApp = new CarbonAccountingApp(appOptions);
    apiClient = new CarbonAccountingApi(configTokenWithScope);
    addressInfo = httpApi.address() as AddressInfo;
    ({ address, port } = addressInfo);
    apiBaseUrl = `http://${address}:${port}`;
  });
  afterAll(async () => {
    await carbonAccountingApp.stop();
    const pruning = pruneDockerAllIfGithubAction({ logLevel });
    await expect(pruning).resolves.toBeTruthy();
  });
  test(testCase, async () => {
    expect(addressInfo).toBeTruthy;
    expect(addressInfo.address).toBe("127.0.0.1");
    expect(addressInfo.port).toBe(4000);
    try {
      await carbonAccountingApp.start();
    } catch (ex) {
      log.error(`CarbonAccountingApp crashed. failing test...`, ex);
      throw ex;
    }
    try {
      await apiClient.enrollAdminV1({
        orgName: "Org1MSP",
      });
    } catch (out: any) {
      expect(out).toBeTruthy();
      expect(out.status).toBeWithin(200, 300);
    }

    try {
      await apiClientBad.enrollAdminV1({ orgName: "does-not-matter" });
      fail("enroll admin response status === 403 FAIL");
    } catch (out: any) {
      expect(out).toBeTruthy();
      expect(out.response).toBeTruthy();
      expect(out.response.status).toEqual(StatusCodes.FORBIDDEN);
      expect(out.response.data.data).not.toBeTruthy();
      expect(out.response.data.success).not.toBeTruthy();
    }
  });
});
