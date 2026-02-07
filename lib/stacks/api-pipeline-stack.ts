import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class ApiPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket для артефактов
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: 'kiro-api-pipeline-artifacts',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // GitHub OAuth token
    const githubToken = cdk.SecretValue.secretsManager('GithubToken');

    // Artifacts
    const sourceOutput = new codepipeline.Artifact('SourceCode');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    // CodeBuild project для сборки и деплоя
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: 'kiro-api-build',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 20,
            },
            commands: ['npm ci'],
          },
          build: {
            commands: [
              'npm run build',
              'npm test',
            ],
          },
          post_build: {
            commands: [
              'cd dist',
              'zip -r ../function.zip .',
              'cd ..',
              'zip -r function.zip node_modules',
              'aws lambda update-function-code --function-name betaMyProject-Hello --zip-file fileb://function.zip',
              'echo "✅ Lambda updated!"',
            ],
          },
        },
        artifacts: {
          files: ['function.zip'],
        },
      }),
    });

    // Права для Lambda
    buildProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['lambda:UpdateFunctionCode', 'lambda:GetFunction'],
      resources: ['*'],
    }));

    // Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'kiro-api-pipeline',
      artifactBucket,
    });

    // Source stage
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.GitHubSourceAction({
          actionName: 'GitHub_Source',
          owner: 'Abdillamit',
          repo: 'kiro-api',
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
      description: 'URL для просмотра API pipeline',
    });
  }
}
