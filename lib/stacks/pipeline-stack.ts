import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { STAGE, stagify } from '../constructs/stages';

export interface PipelineStackProps extends cdk.StackProps {
  stage: STAGE;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
}

/**
 * Pipeline Stack - AWS CodePipeline для автоматического деплоя
 */
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { stage, githubOwner, githubRepo, githubBranch } = props;

    // S3 bucket для артефактов pipeline
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: stagify(stage, 'my-project-pipeline-artifacts', '-'),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // GitHub OAuth token из Secrets Manager
    const githubToken = cdk.SecretValue.secretsManager('GithubToken');

    // Source artifacts
    const sourceOutput = new codepipeline.Artifact('SourceCode');
    
    // Build artifacts
    const infraBuildOutput = new codepipeline.Artifact('InfraBuild');
    const apiBuildOutput = new codepipeline.Artifact('ApiBuild');
    const webBuildOutput = new codepipeline.Artifact('WebBuild');

    // CodeBuild project для Infrastructure
    const infraBuildProject = new codebuild.PipelineProject(this, 'InfraBuild', {
      projectName: stagify(stage, 'MyProject-Infra-Build'),
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
            commands: [
              'cd my-project-infrastructure',
              'npm ci',
            ],
          },
          build: {
            commands: [
              'npm run build',
              'npm test',
              'npx cdk synth',
            ],
          },
        },
        artifacts: {
          'base-directory': 'my-project-infrastructure/cdk.out',
          files: ['**/*'],
        },
      }),
    });

    // CodeBuild project для API
    const apiBuildProject = new codebuild.PipelineProject(this, 'ApiBuild', {
      projectName: stagify(stage, 'MyProject-API-Build'),
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
            commands: [
              'cd my-project-api',
              'npm ci',
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
              'cd ..',
              'zip -r api-bundle.zip my-project-api/dist my-project-api/node_modules',
            ],
          },
        },
        artifacts: {
          files: ['api-bundle.zip'],
        },
      }),
    });

    // CodeBuild project для Web
    const webBuildProject = new codebuild.PipelineProject(this, 'WebBuild', {
      projectName: stagify(stage, 'MyProject-Web-Build'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          GATSBY_STAGE: {
            value: stage || 'prod',
          },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 20,
            },
            commands: [
              'cd my-project-web',
              'npm install',
            ],
          },
          pre_build: {
            commands: [
              // Get API configuration from CloudFormation
              `export GATSBY_GRAPHQL_ENDPOINT=$(aws cloudformation describe-stacks --stack-name ${stagify(stage, 'MyServiceAPIStack')} --query 'Stacks[0].Outputs[?OutputKey==\`GraphQLApiUrl\`].OutputValue' --output text)`,
              `export GATSBY_API_KEY=$(aws cloudformation describe-stacks --stack-name ${stagify(stage, 'MyServiceAPIStack')} --query 'Stacks[0].Outputs[?OutputKey==\`GraphQLApiKey\`].OutputValue' --output text)`,
              `export GATSBY_USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name ${stagify(stage, 'MyServiceAuthStack')} --query 'Stacks[0].Outputs[?OutputKey==\`UserPoolId\`].OutputValue' --output text)`,
              `export GATSBY_USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name ${stagify(stage, 'MyServiceAuthStack')} --query 'Stacks[0].Outputs[?OutputKey==\`UserPoolClientId\`].OutputValue' --output text)`,
              'export GATSBY_AWS_REGION=us-west-2',
            ],
          },
          build: {
            commands: [
              'npm run build',
              'npm test',
            ],
          },
        },
        artifacts: {
          'base-directory': 'my-project-web/public',
          files: ['**/*'],
        },
      }),
    });

    // Дать права для чтения CloudFormation stacks
    webBuildProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cloudformation:DescribeStacks'],
      resources: [
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/${stagify(stage, 'MyServiceAPIStack')}/*`,
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/${stagify(stage, 'MyServiceAuthStack')}/*`,
      ],
    }));

    // CodeBuild project для деплоя Infrastructure
    const infraDeployProject = new codebuild.PipelineProject(this, 'InfraDeploy', {
      projectName: stagify(stage, 'MyProject-Infra-Deploy'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 20,
            },
            commands: [
              'npm install -g aws-cdk',
            ],
          },
          build: {
            commands: [
              `cdk deploy ${stagify(stage, 'MyServiceStorageStack')} ${stagify(stage, 'MyServiceAuthStack')} ${stagify(stage, 'MyServiceAPIStack')} --require-approval never`,
            ],
          },
        },
      }),
    });

    // Дать права для CDK deploy
    infraDeployProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['*'],
      resources: ['*'],
    }));

    // CodeBuild project для деплоя API
    const apiDeployProject = new codebuild.PipelineProject(this, 'ApiDeploy', {
      projectName: stagify(stage, 'MyProject-API-Deploy'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'unzip api-bundle.zip',
              `aws lambda update-function-code --function-name ${stagify(stage, 'MyProject')}-Hello --zip-file fileb://api-bundle.zip`,
            ],
          },
        },
      }),
    });

    // Дать права для обновления Lambda
    apiDeployProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['lambda:UpdateFunctionCode'],
      resources: ['*'],
    }));

    // CodeBuild project для деплоя Web
    const webDeployProject = new codebuild.PipelineProject(this, 'WebDeploy', {
      projectName: stagify(stage, 'MyProject-Web-Deploy'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              `BUCKET_NAME=${stagify(stage, 'my-project-web', '-')}`,
              'aws s3 mb s3://$BUCKET_NAME --region us-west-2 || true',
              'aws s3 website s3://$BUCKET_NAME --index-document index.html --error-document 404.html',
              'aws s3 sync . s3://$BUCKET_NAME --delete',
              'aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy "{\\"Version\\":\\"2012-10-17\\",\\"Statement\\":[{\\"Sid\\":\\"PublicReadGetObject\\",\\"Effect\\":\\"Allow\\",\\"Principal\\":\\"*\\",\\"Action\\":\\"s3:GetObject\\",\\"Resource\\":\\"arn:aws:s3:::$BUCKET_NAME/*\\"}]}"',
            ],
          },
        },
      }),
    });

    // Дать права для S3
    webDeployProject.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:*'],
      resources: ['*'],
    }));

    // Создать Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: stagify(stage, 'MyProject-Pipeline'),
      artifactBucket,
      restartExecutionOnUpdate: true,
    });

    // Stage 1: Source
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.GitHubSourceAction({
          actionName: 'GitHub_Source',
          owner: githubOwner,
          repo: githubRepo,
          branch: githubBranch,
          oauthToken: githubToken,
          output: sourceOutput,
          trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
        }),
      ],
    });

    // Stage 2: Build
    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build_Infrastructure',
          project: infraBuildProject,
          input: sourceOutput,
          outputs: [infraBuildOutput],
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build_API',
          project: apiBuildProject,
          input: sourceOutput,
          outputs: [apiBuildOutput],
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build_Web',
          project: webBuildProject,
          input: sourceOutput,
          outputs: [webBuildOutput],
          runOrder: 1,
        }),
      ],
    });

    // Stage 3: Deploy Infrastructure
    pipeline.addStage({
      stageName: 'Deploy_Infrastructure',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Deploy_CDK_Stacks',
          project: infraDeployProject,
          input: infraBuildOutput,
        }),
      ],
    });

    // Stage 4: Deploy Application
    pipeline.addStage({
      stageName: 'Deploy_Application',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Deploy_API',
          project: apiDeployProject,
          input: apiBuildOutput,
          runOrder: 1,
        }),
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Deploy_Web',
          project: webDeployProject,
          input: webBuildOutput,
          runOrder: 1,
        }),
      ],
    });

    // Stage 5: Manual Approval (только для production)
    if (stage === STAGE.PROD) {
      pipeline.addStage({
        stageName: 'Approve_Production',
        actions: [
          new codepipeline_actions.ManualApprovalAction({
            actionName: 'Manual_Approval',
            additionalInformation: 'Проверьте beta окружение перед деплоем в production',
          }),
        ],
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'PipelineName', {
      value: pipeline.pipelineName,
      exportName: stagify(stage, 'PipelineName'),
    });

    new cdk.CfnOutput(this, 'PipelineUrl', {
      value: `https://console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipeline.pipelineName}/view`,
      description: 'URL для просмотра pipeline в AWS Console',
    });
  }
}
