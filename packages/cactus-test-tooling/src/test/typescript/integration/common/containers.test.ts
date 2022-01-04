import os from "os";
import path from "path";
import type { IncomingMessage } from "http";

import "jest-extended";
import { v4 as uuidV4 } from "uuid";
import fs from "fs-extra";
import { Logger, LoggerProvider } from "@hyperledger/cactus-common";
import {
  HttpEchoContainer,
  Containers,
} from "../../../../main/typescript/public-api";
// import { before } from "lodash";
import Dockerode from "dockerode";

LoggerProvider.setLogLevel("DEBUG");
const log: Logger = LoggerProvider.getOrCreate({ label: "containers-test" });
const testcase = "";

describe(testcase, () => {
  const anHttpEchoContainer = new HttpEchoContainer();
  log.debug("Starting HttpEchoContainer...");
  let httpEchoContainer: HttpEchoContainer,
    container: Dockerode.Container,
    container1: Dockerode.Container;

  beforeAll(async () => {
    container = await anHttpEchoContainer.start();
    log.debug("Container started OK.");
    const httpEchoContainer = new HttpEchoContainer();
    expect(httpEchoContainer).toBeTruthy();
    container1 = await httpEchoContainer.start();
    expect(container1).toBeTruthy();
  });

  afterAll(async () => {
    await httpEchoContainer.stop();
    await httpEchoContainer.destroy();
  });

  afterAll(async () => {
    await anHttpEchoContainer.stop();
    await anHttpEchoContainer.destroy();
  });

  test("pushes file to container unharmed", async () => {
    const srcFileName = uuidV4();
    const srcFileDir = os.tmpdir();
    const dstFileDir = "/";
    const dstFileName = srcFileName;
    const srcFilePath = path.join(srcFileDir, srcFileName);
    const dstFilePath = path.join(dstFileDir, dstFileName);

    const fileContents = {
      id: srcFileName,
      message: "Hello world!",
    };

    const srcFileAsString = JSON.stringify(fileContents);
    fs.writeFileSync(srcFilePath, srcFileAsString);

    const res: IncomingMessage = await Containers.putFile({
      containerOrId: container,
      srcFileDir,
      srcFileName,
      dstFileDir,
      dstFileName,
    });

    expect(res).toBeTruthy();
    expect(typeof res.statusCode).toBe("number");
    const statusCode: number = res.statusCode as number;

    expect(statusCode).toBeWithin(199, 300);
    expect(res.statusMessage).toEqual("OK");

    log.debug("Put file result: %o %o", res.statusCode, res.statusMessage);

    const fileAsString2 = await Containers.pullFile(container, dstFilePath);
    expect(fileAsString2).toBeTruthy();

    const fileContents2 = JSON.parse(fileAsString2);
    expect(fileContents2).toBeTruthy();
    expect(fileContents2.id).toEqual(fileContents.id);
  });

  test("Can obtain docker diagnostics info", async () => {
    const diag = await Containers.getDiagnostics({ logLevel: "TRACE" });
    expect(diag).toBeTruthy();

    expect(diag.containers).toBeTruthy();
    expect(diag.containers).toBeArray();
    expect(diag.containers.length > 0).toBe(true);

    expect(diag.images).toBeTruthy();
    expect(diag.images.length > 0).toBe(true);
    expect(diag.images).toBeArray();

    expect(diag.info).toBeTruthy();

    expect(diag.networks).toBeTruthy();
    expect(diag.networks.length > 0).toBe(true);
    expect(diag.networks).toBeArray();

    expect(diag.version).toBeTruthy();

    expect(diag.volumes).toBeTruthy();
    expect(diag.volumes.Volumes).toBeTruthy();
    expect(diag.volumes.Volumes).toBeArray();
  });

  test("Can report error if docker daemon is not accessable", async () => {
    const badSocketPath = "/some-non-existent-path/to-make-it-trip-up/";
    try {
      await Containers.getDiagnostics({
        logLevel: "TRACE",
        // pass in an incorrect value for the port so that it fails for sure
        dockerodeOptions: {
          port: 9999,
          socketPath: badSocketPath,
        },
      });
      fail("Containers.getDiagnostics was supposed to fail but did not.");
    } catch (ex: any) {
      expect(ex).toBeTruthy();
      expect(ex.cause).toBeTruthy();
      expect(ex.cause.message).toBeTruthy();
      const causeMsgIsInformative = ex.cause.message.includes(badSocketPath);
      expect(causeMsgIsInformative).toBe(true);
    }
  });
});
