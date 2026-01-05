import * as azdev from 'azure-devops-node-api';
import type { ICoreApi } from 'azure-devops-node-api/CoreApi.js';
import type { IBuildApi } from 'azure-devops-node-api/BuildApi.js';
import type { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi.js';
import type { IGitApi } from 'azure-devops-node-api/GitApi.js';
import type { IReleaseApi } from 'azure-devops-node-api/ReleaseApi.js';
import type { ITestApi } from 'azure-devops-node-api/TestApi.js';
import { Config, getCollectionUrl } from './config.js';

export class AzureDevOpsClient {
  private connection: azdev.WebApi;
  private config: Config;

  private coreApi?: ICoreApi;
  private buildApi?: IBuildApi;
  private witApi?: IWorkItemTrackingApi;
  private gitApi?: IGitApi;
  private releaseApi?: IReleaseApi;
  private testApi?: ITestApi;

  constructor(config: Config) {
    this.config = config;
    const authHandler = azdev.getPersonalAccessTokenHandler(config.pat);
    const collectionUrl = getCollectionUrl(config);
    this.connection = new azdev.WebApi(collectionUrl, authHandler);
  }

  async getCoreApi(): Promise<ICoreApi> {
    if (!this.coreApi) {
      this.coreApi = await this.connection.getCoreApi();
    }
    return this.coreApi;
  }

  async getBuildApi(): Promise<IBuildApi> {
    if (!this.buildApi) {
      this.buildApi = await this.connection.getBuildApi();
    }
    return this.buildApi;
  }

  async getWorkItemTrackingApi(): Promise<IWorkItemTrackingApi> {
    if (!this.witApi) {
      this.witApi = await this.connection.getWorkItemTrackingApi();
    }
    return this.witApi;
  }

  async getGitApi(): Promise<IGitApi> {
    if (!this.gitApi) {
      this.gitApi = await this.connection.getGitApi();
    }
    return this.gitApi;
  }

  async getReleaseApi(): Promise<IReleaseApi> {
    if (!this.releaseApi) {
      this.releaseApi = await this.connection.getReleaseApi();
    }
    return this.releaseApi;
  }

  async getTestApi(): Promise<ITestApi> {
    if (!this.testApi) {
      this.testApi = await this.connection.getTestApi();
    }
    return this.testApi;
  }

  getDefaultProject(): string | undefined {
    return this.config.defaultProject;
  }

  requireProject(project?: string): string {
    const p = project || this.config.defaultProject;
    if (!p) {
      throw new Error('Project is required. Specify project parameter or set AZURE_DEVOPS_PROJECT environment variable.');
    }
    return p;
  }
}
