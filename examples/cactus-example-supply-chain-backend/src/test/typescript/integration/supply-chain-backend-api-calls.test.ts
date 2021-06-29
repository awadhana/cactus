import { LogLevelDesc } from "@hyperledger/cactus-common";
import "jest-extended";
import test, { Test } from "tape-promise/tape";
import { pruneDockerAllIfGithubAction } from "@hyperledger/cactus-test-tooling";
import { AuthorizationProtocol } from "@hyperledger/cactus-cmd-api-server";
import { IAuthorizationConfig } from "@hyperledger/cactus-cmd-api-server";
import { ConfigService } from "@hyperledger/cactus-cmd-api-server";

import * as publicApi from "../../../main/typescript/public-api";
import { ISupplyChainAppOptions } from "../../../main/typescript/public-api";
import { SupplyChainApp } from "../../../main/typescript/public-api";

const testCase =
  "can launch via CLI with generated API server .config.json file";
const logLevel: LogLevelDesc = "TRACE";

test("BEFORE " + testCase, async () => {
  const pruning = pruneDockerAllIfGithubAction({ logLevel });
  await expect(pruning).resolves.toBeTruthy();
});

test("Supply chain backend API calls can be executed", async (t: Test) => {
  expect(publicApi).toBeTruthy();

  const configService = new ConfigService();
  expect(configService).toBeTruthy();

  const exampleConfig = configService.newExampleConfig();
  expect(exampleConfig).toBeTruthy();

  // FIXME - this hack should not be necessary, we need to re-think how we
  // do configuration parsing. The convict library may not be the path forward.
  exampleConfig.authorizationConfigJson = (JSON.stringify(
    exampleConfig.authorizationConfigJson,
  ) as unknown) as IAuthorizationConfig;
  exampleConfig.authorizationProtocol = AuthorizationProtocol.NONE;

  const convictConfig = configService.newExampleConfigConvict(exampleConfig);
  expect(convictConfig).toBeTruthy();

  const env = configService.newExampleConfigEnv(convictConfig.getProperties());

  const config = configService.getOrCreate({ env });
  const apiSrvOpts = config.getProperties();
  const { logLevel } = apiSrvOpts;

  const appOptions: ISupplyChainAppOptions = {
    logLevel,
    disableSignalHandlers: true,
  };
  const app = new SupplyChainApp(appOptions);
  test.onFinish(async () => {
    await app.stop();
    await pruneDockerAllIfGithubAction({ logLevel });
  });

  // Node A => Besu
  // Node B => Quorum
  // Node C => Fabric 1.4.x
  const startResult = await app.start();
  const { apiServerA, apiServerB, apiServerC } = startResult;
  expect(apiServerA).toBeTruthy();
  expect(apiServerB).toBeTruthy();
  expect(apiServerC).toBeTruthy();

  const httpSrvApiA = apiServerA.getHttpServerApi();
  expect(httpSrvApiA).toBeTruthy();
  const httpSrvApiB = apiServerB.getHttpServerApi();
  expect(httpSrvApiB).toBeTruthy();
  const httpSrvApiC = apiServerC.getHttpServerApi();
  expect(httpSrvApiC).toBeTruthy();

  expect(httpSrvApiA.listening).toBeTruthy();
  expect(httpSrvApiB.listening).toBeTruthy();
  expect(httpSrvApiC.listening).toBeTruthy();

  const { besuApiClient, fabricApiClient, quorumApiClient } = startResult;

  const metricsResB = await besuApiClient.getPrometheusMetricsV1();
  expect(metricsResB).toBeTruthy();
  expect(metricsResB).toBeWithin(199, 300);

  const metricsResF = await fabricApiClient.getPrometheusMetricsV1();
  expect(metricsResF).toBeTruthy();
  expect(metricsResF.status).toBeWithin(199, 300);

  const metricsResQ = await quorumApiClient.getPrometheusMetricsV1();
  expect(metricsResQ).toBeTruthy();
  expect(metricsResQ.status).toBeWithin(199, 300);

  const {
    supplyChainApiClientA,
    supplyChainApiClientB,
    supplyChainApiClientC,
  } = startResult;

  const listBambooHarvestRes = await supplyChainApiClientA.listBambooHarvestV1();
  expect(listBambooHarvestRes).toBeTruthy();
  expect(listBambooHarvestRes.status).toBeWithin(199, 300);

  const listBookshelfRes = await supplyChainApiClientB.listBookshelfV1();
  expect(listBookshelfRes).toBeTruthy();
  expect(listBookshelfRes.status).toBeWithin(199, 300);

  const listShipmentRes = await supplyChainApiClientC.listShipmentV1();
  expect(listShipmentRes).toBeTruthy();
  expect(listShipmentRes.status).toBeWithin(199, 300);
  t.end();
});
