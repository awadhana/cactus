import path from "path";
import "jest-extended";

import temp from "temp";
import esm from "esm";
import fs from "fs-extra";
import { LogLevelDesc } from "@hyperledger/cactus-common";
import {
  Containers,
  RustcBuildCmd,
  RustcContainer,
} from "../../../../main/typescript/public-api";

const logLevel: LogLevelDesc = "TRACE";
const testcase = "";

describe(testcase, () => {
  type HelloWorldExports = {
    hello_world: () => string;
    say_hello: (name: string) => string;
  };

  const rustcContainer = new RustcContainer({ logLevel });

  afterAll(async () => {
    await rustcContainer.stop();
    await temp.cleanup();
  });

  test("compiles Rust code to bundler targeted .wasm", async () => {
    const tmpDirAffix = "cactus-test-tooling-rustc-container-test";
    temp.track();
    const hostSourceDir = await temp.mkdir(tmpDirAffix);

    const srcDir = path.join(hostSourceDir, "./src/");
    await fs.mkdir(srcDir);

    expect(rustcContainer).toBeTruthy();

    const dockerodeContainer = await rustcContainer.start();
    expect(dockerodeContainer).toBeTruthy();

    const containerPkDir = path.join(rustcContainer.cwd, "./pkg/");

    const cargoTomlHostDir = path.join(
      __dirname,
      "../../../rust/fixtures/wasm-hello-world/",
    );
    const putCargoTomlRes = await Containers.putFile({
      containerOrId: dockerodeContainer,
      dstFileDir: rustcContainer.cwd,
      dstFileName: "Cargo.toml",
      srcFileDir: cargoTomlHostDir,
      srcFileName: "Cargo.toml",
    });
    expect(putCargoTomlRes).toBeTruthy();
    expect(putCargoTomlRes.statusCode).toBeTruthy();
    expect(putCargoTomlRes.statusCode).toEqual(200);

    const containerSrcDir = path.join(rustcContainer.cwd, "./src/");
    await Containers.exec(dockerodeContainer, ["mkdir", containerSrcDir]);

    const libRsHostDir = path.join(
      __dirname,
      "../../../rust/fixtures/wasm-hello-world/src/",
    );
    const putLibRsRes = await Containers.putFile({
      containerOrId: dockerodeContainer,
      dstFileDir: containerSrcDir,
      dstFileName: "lib.rs",
      srcFileDir: libRsHostDir,
      srcFileName: "lib.rs",
    });
    expect(putLibRsRes).toBeTruthy();
    expect(putLibRsRes.statusCode).toBeTruthy();
    expect(putLibRsRes.statusCode).toEqual(200);

    const wasmPackBuildOut = await Containers.exec(
      dockerodeContainer,
      RustcBuildCmd.WASM_PACK_BUILD_BUNDLER,
      300000,
      "TRACE",
    );
    expect(wasmPackBuildOut).toBeTruthy();

    // The list of files the wasm-pack bundler target produces
    const expectedFiles = [
      ".gitignore",
      "hello_world.d.ts",
      "hello_world.js",
      "hello_world_bg.js",
      "hello_world_bg.wasm",
      "hello_world_bg.wasm.d.ts",
      "package.json",
    ];

    const filesOnFs = await Containers.ls(dockerodeContainer, containerPkDir);
    expect(filesOnFs).toBeTruthy();
    expect(Array.isArray(filesOnFs)).toBe(true);
    expect(filesOnFs).toEqual(expectedFiles);

    const fileChecks = filesOnFs.map(async (fileName) => {
      const containerFilePath = path.join(containerPkDir, fileName);
      const hostFilePath = path.join(hostSourceDir, fileName);
      const contentsBuffer = await Containers.pullBinaryFile(
        dockerodeContainer,
        containerFilePath,
      );
      expect(contentsBuffer).toBeTruthy();
      expect(contentsBuffer.length > 0).toBe(true);
      await fs.writeFile(hostFilePath, contentsBuffer);
      const { isFile, size } = await fs.stat(hostFilePath);
      expect(isFile).toBeTruthy();
      expect(size > 0).toBe(true);
    });

    await expect(Promise.all(fileChecks)).not.toReject;

    const wasmHostPath = path.join(hostSourceDir, "./hello_world.js");
    const esmRequire = esm(module, { wasm: true });
    const wasmModule = esmRequire(wasmHostPath) as HelloWorldExports;
    const helloWorldOut = wasmModule.hello_world();
    expect(helloWorldOut).toBeTruthy();
    expect(helloWorldOut).toEqual("Hello World!");

    const greeting = wasmModule.say_hello("Peter");
    expect(greeting).toBeTruthy();
    expect(greeting).toEqual("Hello Peter!");
  });
});
