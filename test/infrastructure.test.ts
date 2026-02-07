import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StorageStack } from '../lib/stacks/storage-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { STAGE } from '../lib/constructs/stages';

describe('Infrastructure Tests', () => {
  test('Storage Stack creates DynamoDB table', () => {
    const app = new cdk.App();
    const stack = new StorageStack(app, 'TestStorageStack', {
      stage: STAGE.BETA,
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'betaUsersTable',
    });
  });

  test('Storage Stack creates S3 buckets', () => {
    const app = new cdk.App();
    const stack = new StorageStack(app, 'TestStorageStack', {
      stage: STAGE.BETA,
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::S3::Bucket', 2);
  });

  test('Auth Stack creates Cognito User Pool', () => {
    const app = new cdk.App();
    const stack = new AuthStack(app, 'TestAuthStack', {
      stage: STAGE.BETA,
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
  });
});
