export { createGoRenderer } from './renderer.js';
export {
  defaultBuildEndpointStructs,
  goClientMethod,
  renderTypesFile,
  renderErrorsFile,
  renderEnumsFile,
  renderOptionsFile,
  renderLoggerFile,
  toPascalCase,
  getFileName,
} from './renderer.js';
export type { GoStruct, GoField, StructGenerator, ServiceInfo } from './renderer.js';
export type { PlatformProfile } from './platform-profile.js';

export { defineProfile } from './define-profile.js';
export type { ProfileConfig } from './define-profile.js';
export type { ServiceStyle, TestSetupConfig } from './profile-defaults.js';
export { testSetupFile, renderGoMod } from './profile-defaults.js';
export { loadTemplate } from './template.js';
export type { GoTemplate } from './template.js';
export { lspStubsText } from './lsp-stubs.js';
export { scaffoldClientText, scaffoldAuthText, initGoModule } from './scaffold-templates.js';
