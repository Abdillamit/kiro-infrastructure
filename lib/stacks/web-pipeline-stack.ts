import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class WebPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket для артефактов
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: 'kiro-web-pipeline-artifacts',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // GitHub OAuth token
    const githubToken = cdk.SecretValue.secretsManager('GithubToken');

    // Artifacts
    const sourceOutput = new codepipeline.Artifact('SourceCode');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    // CodeBuild project
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'kiro-web-build',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 20,
            },
            commands: ['npm install'],
          },
          pre_build: {
            commands: [
              // Используем одинарные кавычки для JMESPath
              "export GATSBY_GRAPHQL_ENDPOINT=$(aws cloudformation describe-stacks --stack-name betaMyServiceAPIStack --query 'Stacks[0].Outputs[?OutputKey==`GraphQLApiUrl`].OutputValue' --output text)",
              "export GATSBY_API_KEY=$(aws cloudformation describe-stacks --stack-name betaMyServiceAPIStack --query 'Stacks[0].Outputs[?OutputKey==`GraphQLApiKey`].OutputValue' --output text)",
              "export GATSBY_USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name betaMyServiceAuthStack --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)",
              "export GATSBY_USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name betaMyServiceAuthStack --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)",
              'export GATSBY_AWS_REGION=us-west-2',
              'echo "GATSBY_GRAPHQL_ENDPOINT=$GATSBY_GRAPHQL_ENDPOINT"',
            ],
          },
          build: {
            commands: [
              'npm run build',
              'npm test',
            ],
          },
          post_build: {
            commands: [
              // Создать bucket с отключенным Block Public Access
              'aws s3 mb s3://beta-my-project-web --region us-west-2 || true',
              'aws s3api delete-public-access-block --bucket beta-my-project-web || true',
              'aws s3 website s3://beta-my-project-web --index-document index.html --error-document 404.html',
              'aws s3 sync public/ s3://beta-my-project-web --delete',
              'aws s3api put-bucket-policy --bucket beta-my-project-web --policy \'{"Version":"2012-10-17","Statement":[{"Sid":"PublicReadGetObject","Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::beta-my-project-web/*"}]}\'',
              'echo "✅ Website deployed!"',
              'echo "🌐 URL: http://beta-my-project-web.s3-website-us-west-2.amazonaws.com"',
            ],
          },
        },
        artifacts: {
          'base-directory': 'public',
          files: ['**/*'],
        },
      }),
    });

    // Права для CloudFormation и S3
    buildProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cloudformation:DescribeStacks'],
      resources: ['*'],
    }));

    buildProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:*'],
      resources: ['*'],
    }));

    // Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'kiro-web-pipeline',
      artifactBucket,
    });

    // Source stage
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.GitHubSourceAction({
          actionName: 'GitHub_Source',
          owner: 'Abdillamit',
          repo: 'kiro-web',
          branch: 'main',
          oauthToken: githubToken,
          output: sourceOutput,
          trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
        }),
      ],
    });

    // Build and Deploy stage
    pipeline.addStage({
      stageName: 'Build_and_Deploy',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build_and_Deploy',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // Outputs
    new cdk.CfnOutput(this, 'PipelineUrl', {
      value: `https://console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipeline.pipelineName}/view`,
      description: 'URL для просмотра Web pipeline',
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: 'http://beta-my-project-web.s3-website-us-west-2.amazonaws.com',
      description: 'URL сайта',
    });
  }
}
