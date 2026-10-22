import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  createNotionArchiveClient,
  createScheduledArchiveHandler,
} from "../src/manifest.mjs";

const s3 = new S3Client({});
const dynamo = new DynamoDBClient({});
const ssm = new SSMClient({});

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}

async function secureParameter(name) {
  const response = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  if (!response.Parameter?.Value) throw new Error(`Secure parameter ${name} is empty`);
  return response.Parameter.Value;
}

function archiveObjectKey(archive) {
  return `notion/pages/${archive.sourceId}/${archive.contentHash}.json`;
}

const handler = createScheduledArchiveHandler({
  getConfig: async () => ({
    token: await secureParameter(required("NOTION_TOKEN_PARAMETER_NAME")),
    rootPageId: await secureParameter(required("NOTION_ROOT_PAGE_ID_PARAMETER_NAME")),
    bucketName: required("ARCHIVE_BUCKET_NAME"),
    registryTableName: required("REGISTRY_TABLE_NAME"),
  }),
  createNotionClient: ({ token }) => createNotionArchiveClient({ token }),
  createArchiveStore: ({ bucketName, registryTableName }) => ({
    loadRegistryHash: async (sourceId) => {
      const response = await dynamo.send(new GetItemCommand({
        TableName: registryTableName,
        Key: { sourceId: { S: sourceId } },
        ConsistentRead: true,
      }));
      return response.Item?.contentHash?.S ?? null;
    },
    saveArchive: async (archive) => s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: archiveObjectKey(archive),
      Body: JSON.stringify(archive),
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
      Metadata: {
        "source-id": archive.sourceId,
        "content-hash": archive.contentHash,
      },
    })),
    saveRegistry: async ({ sourceId, contentHash, archivedAt }) => dynamo.send(new PutItemCommand({
      TableName: registryTableName,
      Item: {
        sourceId: { S: sourceId },
        contentHash: { S: contentHash },
        archivedAt: { S: archivedAt },
        archiveKey: { S: `notion/pages/${sourceId}/${contentHash}.json` },
      },
    })),
  }),
  log: (event) => console.info(JSON.stringify(event)),
});

export { handler };
