import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { STAGE, stagify } from '../constructs/stages';

export interface ApiStackProps extends cdk.StackProps {
  stage: STAGE;
  userPool: cognito.UserPool;
  usersTableName: string;
}

/**
 * API Stack - AppSync GraphQL API with Lambda resolvers
 */
export class ApiStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;
  public readonly helloFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { stage, userPool, usersTableName } = props;

    // GraphQL API
    this.api = new appsync.GraphqlApi(this, 'Api', {
      name: stagify(stage, 'MyProjectAPI'),
      definition: appsync.Definition.fromFile('lib/graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.API_KEY,
            apiKeyConfig: {
              expires: cdk.Expiration.after(cdk.Duration.days(365)),
            },
          },
        ],
      },
      xrayEnabled: true,
    });

    // Hello Lambda Function
    this.helloFunction = new lambda.Function(this, 'HelloFunction', {
      functionName: stagify(stage, 'MyProject-Hello'),
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Event:', JSON.stringify(event, null, 2));
          return {
            message: 'Hello from Lambda!',
            stage: process.env.STAGE || 'unknown',
            timestamp: new Date().toISOString(),
          };
        };
      `),
      environment: {
        STAGE: stage,
        USERS_TABLE_NAME: usersTableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    // Grant Lambda permissions to DynamoDB
    this.helloFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:Scan'],
        resources: [cdk.Fn.importValue(stagify(stage, 'UsersTableArn'))],
      })
    );

    // Lambda Data Source
    const helloDataSource = this.api.addLambdaDataSource(
      'HelloDataSource',
      this.helloFunction
    );

    // Resolver for hello query
    helloDataSource.createResolver('HelloResolver', {
      typeName: 'Query',
      fieldName: 'hello',
    });

    // Outputs
    new cdk.CfnOutput(this, 'GraphQLApiUrl', {
      value: this.api.graphqlUrl,
      exportName: stagify(stage, 'GraphQLApiUrl'),
    });

    new cdk.CfnOutput(this, 'GraphQLApiId', {
      value: this.api.apiId,
      exportName: stagify(stage, 'GraphQLApiId'),
    });

    new cdk.CfnOutput(this, 'GraphQLApiKey', {
      value: this.api.apiKey || 'N/A',
      exportName: stagify(stage, 'GraphQLApiKey'),
    });
  }
}
