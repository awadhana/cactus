import path from "path";
import { v4 as uuidv4 } from "uuid";
import "jest-extended";
import test, { Test } from "tape-promise/tape";

import { LoggerProvider } from "@hyperledger/cactus-common";

import { IAuthorizationConfig } from "../../../../main/typescript/public-api";
import { ApiServer } from "../../../../main/typescript/public-api";
import { ConfigService } from "../../../../main/typescript/public-api";

test("Generates valid example config for the API server", async (t: Test) => {
  t.comment("I'm just here for the error of no t in the method");

  const pluginsPath = path.join(
    __dirname,
    "../../../../../../", // walk back up to the project root
    ".tmp/test/test-cmd-api-server/config-service-example-config-validity_test/", // the dir path from the root
    uuidv4(), // then a random directory to ensure proper isolation
  );
  const pluginManagerOptionsJson = JSON.stringify({ pluginsPath });

  const configService = new ConfigService();
  expect(configService).toBeTruthy();

  const exampleConfig = configService.newExampleConfig();
  expect(exampleConfig).toBeTruthy();

  exampleConfig.pluginManagerOptionsJson = pluginManagerOptionsJson;

  // FIXME - this hack should not be necessary, we need to re-think how we
  // do configuration parsing. The convict library may not be the path forward.
  exampleConfig.authorizationConfigJson = (JSON.stringify(
    exampleConfig.authorizationConfigJson,
  ) as unknown) as IAuthorizationConfig;

  exampleConfig.configFile = "";
  exampleConfig.apiPort = 0;
  exampleConfig.cockpitPort = 0;

  const convictConfig = configService.newExampleConfigConvict(exampleConfig);
  expect(convictConfig).toBeTruthy();

  const config = convictConfig.getProperties();
  expect(config).toBeTruthy();

  LoggerProvider.setLogLevel(config.logLevel);
  const apiServer = new ApiServer({ config });
  await apiServer.start();
  test.onFinish(() => apiServer.shutdown());
});
