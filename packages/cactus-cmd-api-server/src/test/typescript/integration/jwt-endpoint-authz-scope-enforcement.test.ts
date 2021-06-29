import { v4 as uuidv4 } from "uuid";
import { JWK, JWT } from "jose";
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
import { RunTransactionEndpoint } from "../fixtures/plugin-ledger-connector-stub/web-services/run-transaction-endpoint";
import { DeployContractEndpoint } from "../fixtures/plugin-ledger-connector-stub/web-services/deploy-contract-endpoint";
import { UnprotectedActionEndpoint } from "../fixtures/plugin-ledger-connector-stub/web-services/unprotected-action-endpoint";

const testCase =
  "API server enforces scope requirements on top of generic authz";
const logLevel: LogLevelDesc = "TRACE";
const log = LoggerProvider.getOrCreate({
  level: logLevel,
  label: __filename,
});

test(testCase, async (t: Test) => {
  t.comment("I'm just here for the error of no t in the method");
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

    const unprotectedActionEp = new UnprotectedActionEndpoint({
      connector: {} as PluginLedgerConnectorStub,
      logLevel,
    });

    const authorizationConfig: IAuthorizationConfig = {
      unprotectedEndpointExemptions: [unprotectedActionEp.getPath()],
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

    const jwtPayload = {
      name: "Peter",
      location: "London",
      scope: [...RunTransactionEndpoint.OAUTH2_SCOPES],
    };
    const jwtSignOptions: JWT.SignOptions = {
      algorithm: "RS256",
      issuer: expressJwtOptions.issuer,
      audience: expressJwtOptions.audience,
    };
    const token = JWT.sign(jwtPayload, jwtKeyPair, jwtSignOptions);

    const runTxEp = new RunTransactionEndpoint({
      connector: {} as PluginLedgerConnectorStub,
      logLevel,
    });
    const req1 = {
      requestId: uuidv4(),
    };
    const res1 = await axios.request({
      data: req1,
      url: `${apiHost}${runTxEp.getPath()}`,
      method: runTxEp.getVerbLowerCase() as Method,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res1).toBeTruthy();
    expect(res1.status).toEqual(200);
    expect(typeof res1.data).toBe("object");
    expect(typeof res1.data.data).toBeTruthy();
    expect(typeof res1.data.data.requestId).toBeTruthy();
    expect(res1.data.data.requestId).toBe(req1.requestId);

    try {
      const deployContractEp = new DeployContractEndpoint({
        connector: {} as PluginLedgerConnectorStub,
        logLevel,
      });
      await axios.request({
        url: `${apiHost}${deployContractEp.getPath()}`,
        method: deployContractEp.getVerbLowerCase() as Method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      fail("deploy contract response status === 403 FAIL");
    } catch (out) {
      expect(out).toBeTruthy();
      expect(out.response).toBeTruthy();
      expect(out.response.status).toBe(StatusCodes.FORBIDDEN);
      expect(out.response.data.data).not.toBeTruthy();
      expect(out.response.data.success).not.toBeTruthy();
    }
  } catch (ex) {
    log.error(ex);
    fail("Exception thrown during test execution, see above for details!");
    throw ex;
  }
});
