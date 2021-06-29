import fs from "fs";
import "jest-extended";
import {
  ChainCodeCompiler,
  ICompilationOptions,
} from "../../../main/typescript/public-api";

import { HELLO_WORLD_CONTRACT_GO_SOURCE } from "../fixtures/go/hello-world-contract-fabric-v14/hello-world-contract-go-source";

// FIXME - the chain code compiler will undergo a refactor to make it work via
// SSH/docker exec. Until then, leave this test out.
test("compiles chaincode straight from go source code", async () => {
  pending();
  const compiler = new ChainCodeCompiler({ logLevel: "TRACE" });
  const opts: ICompilationOptions = {
    fileName: "hello-world-contract.go",
    moduleName: "hello-world-contract",
    pinnedDeps: [
      "github.com/hyperledger/fabric@v1.4.8",
      "golang.org/x/net@v0.0.0-20210503060351-7fd8e65b6420",
    ],
    sourceCode: HELLO_WORLD_CONTRACT_GO_SOURCE,
  };

  const result = await compiler.compile(opts);
  expect(result).toBeTruthy();
  expect(result.binaryPath).toBeTruthy();
  expect(result.goVersionInfo).toBeTruthy();

  const exists = fs.existsSync(result.binaryPath);
  expect(exists).toBe(true);
});
