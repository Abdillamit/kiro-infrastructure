#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../../../lib/stacks/storage-stack';
import { AuthStack } from '../../../lib/stacks/auth-stack';
import { ApiStack } from '../../../lib/stacks/api-stack';
import { PipelineStack } from '../../../lib/stacks/pipeline-stack';
import { STAGE } from '../../../lib/constructs/stages';

const app = new cdk.App();

// Get stage from context or default to beta
const stageStr = app.node.tryGetContext('stage') || 'beta';
const stage = stageStr === 'prod' ? STAGE.PROD : STAGE.BETA;

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
};

// Create stacks for the specified stage
const stackPrefix = stage === STAGE.BETA ? 'beta' : '';

// Storage Stack
const storageStack = new StorageStack(app, `${stackPrefix}MyServiceStorageStack`, {
  stage,
  env,
  description: `Storage resources for My Project (${stage || 'prod'})`,
});

// Auth Stack
const authStack = new AuthStack(app, `${stackPrefix}MyServiceAuthStack`, {
  stage,
  env,
  description: `Authentication resources for My Project (${stage || 'prod'})`,
});

// API Stack
const apiStack = new ApiStack(app, `${stackPrefix}MyServiceAPIStack`, {
  stage,
  env,
  userPool: authStack.userPool,
  usersTableName: storageStack.usersTable.tableName,
  description: `API resources for My Project (${stage || 'prod'})`,
});

// Dependencies
apiStack.addDependency(storageStack);
apiStack.addDependency(authStack);

// Pipeline Stack
new PipelineStack(app, `${stackPrefix}MyServicePipelineStack`, {
  stage,
  env,
  githubOwner: 'Abdillamit',
  githubRepo: 'AWS-project',
  githubBranch: stage === STAGE.BETA ? 'beta' : 'main',
  description: `CI/CD Pipeline for My Project (${stage || 'prod'})`,
});

// Tags
cdk.Tags.of(app).add('Project', 'MyProject');
cdk.Tags.of(app).add('Stage', stage || 'prod');
cdk.Tags.of(app).add('ManagedBy', 'CDK');

app.synth();
