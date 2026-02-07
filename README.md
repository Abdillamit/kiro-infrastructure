# My Project Infrastructure

AWS CDK infrastructure for My Project with multi-environment support.

## Prerequisites

- Node.js 18+
- AWS CLI configured with appropriate credentials
- AWS CDK CLI: `npm install -g aws-cdk`

## Installation

```bash
npm install
```

## Project Structure

```
├── bin/
│   └── projects/
│       └── my-service/
│           └── service.ts       # CDK app entry point
├── lib/
│   ├── constructs/
│   │   └── stages.ts            # Stage utilities
│   ├── stacks/
│   │   ├── storage-stack.ts     # DynamoDB & S3
│   │   ├── auth-stack.ts        # Cognito
│   │   └── api-stack.ts         # AppSync & Lambda
│   └── graphql/
│       └── schema.graphql       # GraphQL schema
└── test/
    └── infrastructure.test.ts   # Unit tests
```

## Deployment

### Beta Environment

```bash
npm run deploy:beta
```

This deploys:
- `betaMyServiceStorageStack` - DynamoDB tables and S3 buckets
- `betaMyServiceAuthStack` - Cognito User Pool
- `betaMyServiceAPIStack` - AppSync GraphQL API

### Production Environment

```bash
npm run deploy:prod
```

This deploys:
- `MyServiceStorageStack`
- `MyServiceAuthStack`
- `MyServiceAPIStack`

## Development

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run watch
```

### Run tests

```bash
npm test
```

### Synthesize CloudFormation

```bash
npm run synth:beta  # Beta environment
npm run synth:prod  # Production environment
```

### View differences

```bash
npm run diff:beta   # Compare with deployed beta stack
npm run diff:prod   # Compare with deployed prod stack
```

## Stack Outputs

After deployment, you'll get outputs including:

- **GraphQL API URL**: The AppSync endpoint
- **GraphQL API Key**: For testing (also supports Cognito auth)
- **User Pool ID**: Cognito User Pool identifier
- **User Pool Client ID**: For frontend authentication
- **Table Names**: DynamoDB table names
- **Bucket Names**: S3 bucket names

## Testing the API

After deployment, you can test the GraphQL API:

1. Get the API URL and Key from stack outputs
2. Use the AppSync console or any GraphQL client
3. Query example:

```graphql
query {
  hello {
    message
    stage
    timestamp
  }
}
```

## Resource Naming

Resources are automatically prefixed based on stage:
- Beta: `betaResourceName`
- Prod: `ResourceName`

This is handled by the `stagify()` utility function.

## Cleanup

To destroy all resources:

```bash
cdk destroy --app "node bin/projects/my-service/service.js" --all
```

**Warning**: This will delete all resources including data in DynamoDB and S3.
