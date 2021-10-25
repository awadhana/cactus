// import { AddressInfo } from "net";
// import expressJwt from "express-jwt";
// import "jest-extended";
// import { v4 as uuidv4 } from "uuid";
// import { JWK, JWT } from "jose";
// import { StatusCodes } from "http-status-codes";

// import {
//   AuthorizationProtocol,
//   ConfigService,
//   Configuration,
//   IAuthorizationConfig,
// } from "@hyperledger/cactus-cmd-api-server";

// import {
//   LoggerProvider,
//   LogLevelDesc,
//   Servers,
// } from "@hyperledger/cactus-common";

// import { pruneDockerAllIfGithubAction } from "@hyperledger/cactus-test-tooling";

// import {
//   AuthzScope,
//   DefaultApi as CarbonAccountingApi,
// } from "@hyperledger/cactus-example-carbon-accounting-business-logic-plugin";

// import {
//   CarbonAccountingApp,
//   ICarbonAccountingAppOptions,
// } from "../../../main/typescript/carbon-accounting-app";

// const testCase = "can enroll new admin users onto the Fabric org";
// const logLevel: LogLevelDesc = "TRACE";
// const log = LoggerProvider.getOrCreate({
//   label: testCase,
//   level: logLevel,
// });

// test("BEFORE " + testCase, async () => {
//   const pruning = pruneDockerAllIfGithubAction({ logLevel });
//   await expect(pruning).resolves.toBeTruthy();
// });

// test(testCase, async () => {
//   const jwtKeyPair = await JWK.generate("RSA", 4096);
//   const jwtPublicKey = jwtKeyPair.toPEM(false);
//   const expressJwtOptions: expressJwt.Options = {
//     algorithms: ["RS256"],
//     secret: jwtPublicKey,
//     audience: "carbon-accounting-tool-servers-hostname-here",
//     issuer: uuidv4(),
//   };
//   expect(expressJwtOptions).toBeTruthy();
//   const socketIoJwtOptions = { secret: jwtPublicKey };

//   const httpGui = await Servers.startOnPreferredPort(3000);
//   expect(httpGui.listening).toBe(true);
//   const httpApi = await Servers.startOnPreferredPort(4000);
//   expect(httpApi.listening).toBe(true);
//   const addressInfo = httpApi.address() as AddressInfo;
//   expect(addressInfo).toBe(true);
//   expect(addressInfo.address).toBe(true);
//   expect(addressInfo.port).toBe(true);
//   const { address, port } = addressInfo;
//   const apiBaseUrl = `http://${address}:${port}`;

//   const authorizationConfig: IAuthorizationConfig = {
//     unprotectedEndpointExemptions: [],
//     expressJwtOptions,
//     socketIoJwtOptions,
//   };

//   const configService = new ConfigService();
//   const apiSrvOpts = configService.newExampleConfig();
//   apiSrvOpts.authorizationProtocol = AuthorizationProtocol.JSON_WEB_TOKEN;
//   apiSrvOpts.authorizationConfigJson = authorizationConfig;
//   apiSrvOpts.configFile = "";
//   apiSrvOpts.apiCorsDomainCsv = "*";
//   apiSrvOpts.apiPort = 0;
//   apiSrvOpts.cockpitPort = 0;
//   apiSrvOpts.grpcPort = 0;
//   apiSrvOpts.apiTlsEnabled = false;
//   apiSrvOpts.plugins = [];
//   const convictConfig = configService.newExampleConfigConvict(apiSrvOpts);
//   const apiServerOptions = convictConfig.getProperties();

//   const appOptions: ICarbonAccountingAppOptions = {
//     logLevel: apiSrvOpts.logLevel,
//     apiServerOptions,
//     httpGui,
//     httpApi,
//     disableSignalHandlers: true,
//   };

//   const carbonAccountingApp = new CarbonAccountingApp(appOptions);
//   test.onFinish(async () => {
//     await carbonAccountingApp.stop();
//     await pruneDockerAllIfGithubAction({ logLevel });
//   });

//   afterAll(async () => {
//     await carbonAccountingApp.stop();
//     const pruning = pruneDockerAllIfGithubAction({ logLevel });
//     await expect(pruning).resolves.toBeTruthy();
//   });

//   try {
//     await carbonAccountingApp.start();
//   } catch (ex) {
//     log.error(`CarbonAccountingApp crashed. failing test...`, ex);
//     throw ex;
//   }

//   const jwtPayload = {
//     name: "Peter",
//     scope: [AuthzScope.GroupAdmin],
//   };
//   const jwtSignOptions: JWT.SignOptions = {
//     algorithm: "RS256",
//     issuer: expressJwtOptions.issuer,
//     audience: expressJwtOptions.audience,
//   };
//   const tokenWithScope = JWT.sign(jwtPayload, jwtKeyPair, jwtSignOptions);
//   const verification = JWT.verify(tokenWithScope, jwtKeyPair, jwtSignOptions);
//   expect(verification).toBeTruthy();

//   const configTokenWithScope = new Configuration({
//     basePath: apiBaseUrl,
//     baseOptions: {
//       headers: {
//         Authorization: `Bearer ${tokenWithScope}`,
//       },
//     },
//   });

//   const apiClient = new CarbonAccountingApi(configTokenWithScope);

//   const res = await apiClient.enrollAdminV1({
//     orgName: "Org1MSP",
//   });
//   expect(res).toBeTruthy();
//   expect(res.status).toBeWithin(200, 300);

//   const tokenNoScope = JWT.sign({ scope: [] }, jwtKeyPair, jwtSignOptions);

//   const configTokenWithoutScope = new Configuration({
//     basePath: apiBaseUrl,
//     baseOptions: {
//       headers: {
//         Authorization: `Bearer ${tokenNoScope}`,
//       },
//     },
//   });

//   const apiClientBad = new CarbonAccountingApi(configTokenWithoutScope);

//   try {
//     await apiClientBad.enrollAdminV1({ orgName: "does-not-matter" });
//     fail("enroll admin response status === 403 FAIL");
//   } catch (out) {
//     expect(out).toBeTruthy();
//     expect(out.response).toBeTruthy();
//     expect(out.response.status).toEqual(StatusCodes.FORBIDDEN);
//     expect(out.response.data.data).not.toBeTruthy();
//     expect(out.response.data.success).not.toBeTruthy();
//   }
// });
