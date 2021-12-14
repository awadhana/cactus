import path from "path";
import { spawn } from "child_process";
import "jest-extended";
import { LogLevelDesc } from "@hyperledger/cactus-common";
import { pruneDockerAllIfGithubAction } from "@hyperledger/cactus-test-tooling";
import * as publicApi from "../../../main/typescript/public-api";

const testCase =
  "can launch via CLI with generated API server .config.json file";
describe(testCase, () => {
  const logLevel: LogLevelDesc = "TRACE";

  beforeAll(async () => {
    const pruning = pruneDockerAllIfGithubAction({ logLevel });
    await expect(pruning).resolves.toBeTruthy();
  });

  afterAll(async () => {
    const pruning = pruneDockerAllIfGithubAction({ logLevel });
    await expect(pruning).resolves.toBeTruthy();
  });

  test("Supply chain backend API calls can be executed", async () => {
    expect(publicApi).toBeTruthy();

    const projectRoot = path.join(__dirname, "../../../../../../");

    const child = spawn("npm", ["run", "start:example-supply-chain"], {
      cwd: projectRoot,
    });

    const logs = [];
    for await (const data of child.stdout) {
      console.log(`[child]: ${data}`);
      logs.push(data);
    }

    for await (const data of child.stderr) {
      console.error(`[child]: ${data}`);
      logs.push(data);
    }

    const childProcessPromise = new Promise<void>((resolve, reject) => {
      child.once("exit", (code: number, signal: NodeJS.Signals) => {
        if (code === 0) {
          resolve();
        } else {
          const msg = `Child process crashed. exitCode=${code}, signal=${signal}`;
          reject(new Error(msg));
        }
      });
    });

    await expect(childProcessPromise).toResolve();
  });
});
