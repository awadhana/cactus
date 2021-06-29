import { JWS, JWK } from "jose";
import "jest-extended";
import test, { Test } from "tape-promise/tape";
import express from "express";
import bodyParser from "body-parser";
import http from "http";
import { AddressInfo } from "net";

import { IListenOptions, Servers } from "@hyperledger/cactus-common";

import {
  ConsortiumDatabase,
  CactusNode,
  Configuration,
} from "@hyperledger/cactus-core-api";

import {
  PluginConsortiumManual,
  IPluginConsortiumManualOptions,
} from "../../../../main/typescript/public-api";

import { GetNodeJwsEndpoint } from "../../../../main/typescript/public-api";

import { v4 as uuidv4 } from "uuid";

import { DefaultApi as ConsortiumManualApi } from "../../../../main/typescript/public-api";

import { K_CACTUS_CONSORTIUM_MANUAL_TOTAL_NODE_COUNT } from "../../../../main/typescript/prometheus-exporter/metrics";

test("Can provide JWS", async (t: Test) => {
  t.comment("I'm just here for the error of no t in the method");
  expect(GetNodeJwsEndpoint);

  const keyPair = await JWK.generate("EC", "secp256k1", { use: "sig" }, true);
  const keyPairPem = keyPair.toPEM(true);

  const db: ConsortiumDatabase = {
    cactusNode: [],
    consortium: [],
    consortiumMember: [],
    ledger: [],
    pluginInstance: [],
  };

  // Creating the PluginConsortiumManual object to observe the prometheus metrics.
  const options: IPluginConsortiumManualOptions = {
    instanceId: uuidv4(),
    keyPairPem: keyPairPem,
    consortiumDatabase: db,
  };

  const pluginConsortiumManual: PluginConsortiumManual = new PluginConsortiumManual(
    options,
  );

  // Setting up of the api-server for hosting the endpoints defined in the openapi specs
  // of the plugin
  const expressApp = express();
  expressApp.use(bodyParser.json({ limit: "250mb" }));
  const server = http.createServer(expressApp);
  const listenOptions: IListenOptions = {
    hostname: "0.0.0.0",
    port: 0,
    server,
  };
  const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
  test.onFinish(async () => await Servers.shutdown(server));
  const { address, port } = addressInfo;
  const apiHost = `http://${address}:${port}`;

  const config = new Configuration({ basePath: apiHost });
  const apiClient = new ConsortiumManualApi(config);

  await pluginConsortiumManual.getOrCreateWebServices();
  await pluginConsortiumManual.registerWebServices(expressApp);

  const pubKeyPem = keyPair.toPEM(false);

  const jws = await pluginConsortiumManual.getNodeJws();
  expect(jws).toBeTruthy();
  expect(typeof jws).toBe("object");
  expect(() => JWS.verify(jws, pubKeyPem)).not.toThrow();
  expect(() => JWS.verify(jws, keyPair)).not.toThrow();

  const payload = JWS.verify(jws, pubKeyPem) as {
    consortiumDatabase: ConsortiumDatabase;
  };
  expect(payload).toBeTruthy();
  if (typeof payload === "string") {
    fail(`JWS Verification result: ${payload}`);
  } else {
    expect(payload.consortiumDatabase).toBeTruthy();
  }

  {
    // The first check shall observe the cactus_consortium_manual_total_node_count metrics
    // to be valued at zero, as the ConsortiumRepo object is initialized with an empty array of
    // Cactus nodes.
    const res = await apiClient.getPrometheusMetricsV1();
    const promMetricsOutput =
      "# HELP " +
      K_CACTUS_CONSORTIUM_MANUAL_TOTAL_NODE_COUNT +
      " Total cactus node count\n" +
      "# TYPE " +
      K_CACTUS_CONSORTIUM_MANUAL_TOTAL_NODE_COUNT +
      " gauge\n" +
      K_CACTUS_CONSORTIUM_MANUAL_TOTAL_NODE_COUNT +
      '{type="' +
      K_CACTUS_CONSORTIUM_MANUAL_TOTAL_NODE_COUNT +
      '"} 0';
    expect(res);
    expect(res.data);
    expect(res.status).toEqual(200);
    expect(res.data.includes(promMetricsOutput)).toBe(true);
  }

  // Creating a dummy cactus node for adding it to the cactus node array
  // and thus observing the change in prometheus exporter metrics (should increment by 1)
  const dummyCactusNode: CactusNode = {
    consortiumId: "",
    id: "",
    ledgerIds: [],
    memberId: "",
    nodeApiHost: "",
    pluginInstanceIds: [],
    publicKeyPem: "",
  };

  db.cactusNode.push(dummyCactusNode);
  // The invocation of the node JWS endpoint internally triggers the update
  // of the metrics so after it has executed we can expect the metrics to
  // show the new values for our assertions below
  await apiClient.getNodeJwsV1();

  {
    // The second check shall observe the cactus_consortium_manual_total_node_count metrics
    // to be valued at One, as the Cactus node array is pushed with a dummy cactus node.
    const res = await apiClient.getPrometheusMetricsV1();
    const promMetricsOutput =
      "# HELP " +
      K_CACTUS_CONSORTIUM_MANUAL_TOTAL_NODE_COUNT +
      " Total cactus node count\n" +
      "# TYPE " +
      K_CACTUS_CONSORTIUM_MANUAL_TOTAL_NODE_COUNT +
      " gauge\n" +
      K_CACTUS_CONSORTIUM_MANUAL_TOTAL_NODE_COUNT +
      '{type="' +
      K_CACTUS_CONSORTIUM_MANUAL_TOTAL_NODE_COUNT +
      '"} 1';
    expect(res);
    expect(res.data);
    expect(res.status).toEqual(200);
    expect(res.data.includes(promMetricsOutput)).toBeTruthy();
  }
});
