import { defineProfile, loadTemplate } from '@doclient/renderer-go';

const clientTpl = loadTemplate('./templates/client.go');
const authTpl = loadTemplate('./templates/auth.go');

export const lazadaProfile = defineProfile({
  name: 'lazada',

  responseDataFieldName: 'data',
  commonFields: ['code', 'type', 'message', 'request_id'],
  commonRequestFields: [],

  baseResponseFields: [
    { name: 'Code', type: 'string', jsonTag: 'code', urlTag: '', comment: '' },
    { name: 'Type', type: 'string', jsonTag: 'type', urlTag: '', comment: '' },
    { name: 'Message', type: 'string', jsonTag: 'message', urlTag: '', comment: '' },
    { name: 'RequestID', type: 'string', jsonTag: 'request_id', urlTag: '', comment: '' },
  ],

  renderClientFile: (pkg, services, init) =>
    clientTpl.render({
      PACKAGE_NAME: pkg,
      SERVICES_SECTION: services,
      SERVICES_INIT_SECTION: init,
    }),

  renderAuthFile: (pkg) => authTpl.render({ PACKAGE_NAME: pkg }),

  testSetup: {
    appLiteral: 'App{\n\t\tAppKey:    "test_app_key",\n\t\tAppSecret: "test_app_secret",\n\t}',
    extraSetup: '\tclient.Region = "SG"\n\tclient.Token = "test_access_token"',
  },

  serviceStyle: 'wrapper',

  dependencies: ['github.com/jarcoal/httpmock v1.3.1'],
});
