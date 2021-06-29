import { v4 as internalIpV4 } from "internal-ip";
import "jest-extended";
import test, { Test } from "tape-promise/tape";

import express from "express";
import bodyParser from "body-parser";
import http from "http";
import { AddressInfo } from "net";

import {
  Containers,
  K_DEFAULT_VAULT_DEV_ROOT_TOKEN,
  K_DEFAULT_VAULT_HTTP_PORT,
  VaultTestServer,
} from "@hyperledger/cactus-test-tooling";

import { v4 as uuidv4 } from "uuid";

import {
  LogLevelDesc,
  IListenOptions,
  Servers,
} from "@hyperledger/cactus-common";

import {
  Configuration,
  IPluginKeychainVaultOptions,
  PluginKeychainVault,
} from "../../../main/typescript/public-api";

import { K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT } from "../../../main/typescript/prometheus-exporter/metrics";

import { DefaultApi as KeychainVaultApi } from "../../../main/typescript/public-api";

const logLevel: LogLevelDesc = "TRACE";

test("get,set,has,delete alters state", async (t: Test) => {
  t.comment("I'm just here for the error of no t in the method");

  const vaultTestContainer = new VaultTestServer({});
  await vaultTestContainer.start();

  const ci = await Containers.getById(vaultTestContainer.containerId);
  const vaultIpAddr = await internalIpV4();
  const hostPort = await Containers.getPublicPort(
    K_DEFAULT_VAULT_HTTP_PORT,
    ci,
  );
  const vaultHost = `http://${vaultIpAddr}:${hostPort}`;

  test.onFinish(async () => {
    await vaultTestContainer.stop();
    await vaultTestContainer.destroy();
  });

  const options: IPluginKeychainVaultOptions = {
    instanceId: uuidv4(),
    keychainId: uuidv4(),
    endpoint: vaultHost,
    token: K_DEFAULT_VAULT_DEV_ROOT_TOKEN,
    apiVersion: "v1",
    kvSecretsMountPath: "secret/data/",
    logLevel,
  };
  const plugin = new PluginKeychainVault(options);

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

  const apiConfig = new Configuration({ basePath: apiHost });
  const apiClient = new KeychainVaultApi(apiConfig);

  await plugin.getOrCreateWebServices();
  await plugin.registerWebServices(expressApp);

  expect(plugin.getKeychainId()).toEqual(options.keychainId);
  expect(plugin.getInstanceId()).toEqual(options.instanceId);

  const key1 = uuidv4();
  const value1 = uuidv4();

  const hasPrior1 = await plugin.has(key1);

  expect(hasPrior1).not.toBe(true);

  await plugin.set(key1, value1);

  const hasAfter1 = await plugin.has(key1);
  expect(hasAfter1).toBe(true);

  const valueAfter1 = await plugin.get(key1);
  expect(valueAfter1).toBeTruthy();
  expect(valueAfter1).toEqual(value1);

  await plugin.delete(key1);

  const hasAfterDelete1 = await plugin.has(key1);
  expect(hasAfterDelete1).not.toBe(true);

  const valueAfterDelete1 = await plugin.get(key1);
  expect(valueAfterDelete1).not.toBe(true);

  {
    const res = await apiClient.getPrometheusMetricsV1();
    const promMetricsOutput =
      "# HELP " +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      " The number of keys that were set in the backing Vault deployment via this specific keychain plugin instance\n" +
      "# TYPE " +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      " gauge\n" +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      '{type="' +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      '"} 0';
    expect(res).toBeTruthy();
    expect(res.data).toBeTruthy();
    expect(res.status).toEqual(200);
    expect(res.data.includes(promMetricsOutput)).toBe(true);
  }

  const key2 = uuidv4();
  const value2 = uuidv4();

  const hasPrior2 = await plugin.has(key2);

  expect(hasPrior2).not.toBe(true);

  await plugin.set(key2, value2);

  const hasAfter2 = await plugin.has(key2);
  expect(hasAfter2).toBe(true);

  const valueAfter2 = await plugin.get(key2);
  expect(valueAfter2).toBeTruthy();
  expect(valueAfter2).toEqual(value2);

  {
    const res = await apiClient.getPrometheusMetricsV1();
    const promMetricsOutput =
      "# HELP " +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      " The number of keys that were set in the backing Vault deployment via this specific keychain plugin instance\n" +
      "# TYPE " +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      " gauge\n" +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      '{type="' +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      '"} 1';
    expect(res).toBeTruthy();
    expect(res.data).toBeTruthy();
    expect(res.status).toEqual(200);
    expect(res.data.includes(promMetricsOutput)).toBe(true);
  }
});

test("API client get,set,has,delete alters state", async () => {
  const vaultTestContainer = new VaultTestServer({});
  await vaultTestContainer.start();

  const ci = await Containers.getById(vaultTestContainer.containerId);
  const vaultIpAddr = await internalIpV4();
  const hostPort = await Containers.getPublicPort(
    K_DEFAULT_VAULT_HTTP_PORT,
    ci,
  );
  const vaultHost = `http://${vaultIpAddr}:${hostPort}`;

  test.onFinish(async () => {
    await vaultTestContainer.stop();
    await vaultTestContainer.destroy();
  });

  const options: IPluginKeychainVaultOptions = {
    instanceId: uuidv4(),
    keychainId: uuidv4(),
    endpoint: vaultHost,
    token: K_DEFAULT_VAULT_DEV_ROOT_TOKEN,
    apiVersion: "v1",
    kvSecretsMountPath: "secret/data/",
    logLevel,
  };
  const plugin = new PluginKeychainVault(options);

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

  const apiConfig = new Configuration({ basePath: apiHost });
  const apiClient = new KeychainVaultApi(apiConfig);

  await plugin.getOrCreateWebServices();
  await plugin.registerWebServices(expressApp);

  expect(plugin.getKeychainId()).toEqual(options.keychainId);
  expect(plugin.getInstanceId()).toEqual(options.instanceId);

  const key1 = uuidv4();
  const value1 = uuidv4();

  const hasPrior1 = await apiClient.hasKeychainEntryV1({ key: key1 });
  expect(hasPrior1).toBeTruthy();

  expect(hasPrior1.data.isPresent).not.toBe(true);

  await apiClient.setKeychainEntryV1({ key: key1, value: value1 });

  const hasAfter1 = await apiClient.hasKeychainEntryV1({ key: key1 });
  expect(hasAfter1).toBeTruthy();
  expect(hasAfter1.data.isPresent).toBe(true);

  const valueAfter1 = await apiClient.getKeychainEntryV1({ key: key1 });
  expect(valueAfter1).toBeTruthy();
  expect(valueAfter1.data.value).toEqual(value1);

  await apiClient.deleteKeychainEntryV1({ key: key1 });

  const hasAfterDelete1 = await apiClient.hasKeychainEntryV1({ key: key1 });
  expect(hasAfterDelete1).toBeTruthy();
  expect(hasAfterDelete1.data.isPresent).not.toBe(true);

  const valueAfterDelete1 = await apiClient.getKeychainEntryV1({ key: key1 });
  expect(valueAfterDelete1).toBeTruthy();
  expect(valueAfterDelete1.data.value).not.toBe(true);

  {
    const res = await apiClient.getPrometheusMetricsV1();
    const promMetricsOutput =
      "# HELP " +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      " The number of keys that were set in the backing Vault deployment via this specific keychain plugin instance\n" +
      "# TYPE " +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      " gauge\n" +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      '{type="' +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      '"} 0';
    expect(res).toBeTruthy();
    expect(res.data).toBeTruthy();
    expect(res.status).toEqual(200);
    expect(res.data.includes(promMetricsOutput)).toBeTruthy();
  }

  const key2 = uuidv4();
  const value2 = uuidv4();

  const hasPrior2 = await apiClient.hasKeychainEntryV1({ key: key2 });
  expect(hasPrior2).toBeTruthy();
  expect(hasPrior2.data.isPresent).not.toBe(true);

  await apiClient.setKeychainEntryV1({ key: key2, value: value2 });

  const hasAfter2 = await apiClient.hasKeychainEntryV1({ key: key2 });
  expect(hasAfter2).toBe(true);

  const valueAfter2 = await apiClient.getKeychainEntryV1({ key: key2 });
  expect(valueAfter2).toBeTruthy();
  expect(valueAfter2.data.value).toEqual(value2);

  {
    const res = await apiClient.getPrometheusMetricsV1();
    const promMetricsOutput =
      "# HELP " +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      " The number of keys that were set in the backing Vault deployment via this specific keychain plugin instance\n" +
      "# TYPE " +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      " gauge\n" +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      '{type="' +
      K_CACTUS_KEYCHAIN_VAULT_MANAGED_KEY_COUNT +
      '"} 1';
    expect(res).toBeTruthy();
    expect(res.data).toBeTruthy();
    expect(res.status).toEqual(200);
    expect(res.data.includes(promMetricsOutput)).toBe(true);
  }
});

test("getEncryptionAlgorithm() returns null", () => {
  const options: IPluginKeychainVaultOptions = {
    instanceId: uuidv4(),
    keychainId: uuidv4(),
    endpoint: "http://127.0.0.1:9200",
    token: "root",
  };
  const plugin = new PluginKeychainVault(options);

  expect(plugin.getEncryptionAlgorithm());
});
