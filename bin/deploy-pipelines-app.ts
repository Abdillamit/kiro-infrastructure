#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ApiPipelineStack } from '../lib/stacks/api-pipeline-stack';
import { WebPipelineStack } from '../lib/stacks/web-pipeline-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-west-2',
};

// API Pipeline
new ApiPipelineStack(app, 'KiroApiPipelineStack', {
  env,
  description: 'CodePipeline for Kiro API (Lambda functions)',
});

// Web Pipeline
new WebPipelineStack(app, 'KiroWebPipelineStack', {
  env,
  description: 'CodePipeline for Kiro Web (Gatsby app)',
});

app.synth();
