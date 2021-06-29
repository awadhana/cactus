import { v4 as uuidv4 } from "uuid";
import { JWK } from "jose";
import "jest-extended";
import test, { Test } from "tape-promise/tape";

import expressJwt from "express-jwt";
import axios, { Method } from "axios";
import { StatusCodes } from "http-status-codes";

import { LoggerProvider, LogLevelDesc } from "@hyperledger/cactus-common";
import { PluginRegistry } from "@hyperledger/cactus-core";

import {
  ApiServer,
  ConfigService,
  AuthorizationProtocol,
  IAuthorizationConfig,
} from "../../../main/typescript/public-api";

import { PluginLedgerConnectorStub } from "../fixtures/plugin-ledger-connector-stub/plugin-ledger-connector-stub";
import { UnprotectedActionEndpoint } from "../fixtures/plugin-ledger-connector-stub/web-services/unprotected-action-endpoint";

const testCase =
  "API server enforces scope requirements on top of generic authz";
const logLevel: LogLevelDesc = "TRACE";
const log = LoggerProvider.getOrCreate({
  level: logLevel,
  label: __filename,
});

test(testCase, async (t: Test) => {
  try {
    const jwtKeyPair = await JWK.generate("RSA", 4096);
    const jwtPublicKey = jwtKeyPair.toPEM(false);
    const expressJwtOptions: expressJwt.Options = {
      algorithms: ["RS256"],
      secret: jwtPublicKey,
      audience: uuidv4(),
      issuer: uuidv4(),
    };
    expect(expressJwtOptions).toBeTruthy();

    const ep = new UnprotectedActionEndpoint({
      connector: {} as PluginLedgerConnectorStub,
      logLevel,
    });

    const authorizationConfig: IAuthorizationConfig = {
      unprotectedEndpointExemptions: [ep.getPath()],
      expressJwtOptions,
      socketIoJwtOptions: { secret: jwtPublicKey },
    };

    const pluginRegistry = new PluginRegistry();
    const plugin = new PluginLedgerConnectorStub({
      logLevel,
      pluginRegistry,
      instanceId: uuidv4(),
    });
    pluginRegistry.add(plugin);

    const configService = new ConfigService();
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
    const config = configService.newExampleConfigConvict(apiSrvOpts);

    const apiServer = new ApiServer({
      config: config.getProperties(),
      pluginRegistry,
    });
    test.onFinish(async () => await apiServer.shutdown());

    const startResponse = apiServer.start();
    await t.doesNotReject(
      startResponse,
      "failed to start API server with dynamic plugin imports configured for it...",
    );
    expect(startResponse).toBeTruthy();

    const addressInfoApi = (await startResponse).addressInfoApi;
    const protocol = apiSrvOpts.apiTlsEnabled ? "https" : "http";
    const { address, port } = addressInfoApi;
    const apiHost = `${protocol}://${address}:${port}`;

    const req1 = {
      requestId: uuidv4(),
    };

    // look Ma, no access token
    const res1 = await axios.request({
      data: req1,
      url: `${apiHost}${ep.getPath()}`,
      method: ep.getVerbLowerCase() as Method,
    });
    expect(res1).toBeTruthy();
    expect(res1.status).toEqual(StatusCodes.OK);
    expect(typeof res1.data).toBeTruthy();
    expect(typeof res1.data.data).toBeTruthy();
    expect(typeof res1.data.data.reqBodyrequestId).toBeTruthy();
    expect(typeof res1.data.data.reqBody.requestId).toBeTruthy();
    expect(res1.data.data.reqBody.requestId).toEqual(req1.requestId);
  } catch (ex) {
    log.error(ex);
    fail("Exception thrown during test execution, see above for details!");
  }
});
