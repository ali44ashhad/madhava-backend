import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import path from 'path';

let s3Client: S3Client | null = null;

const getS3Client = () => {
    if (!s3Client) {
        s3Client = new S3Client({
            region: process.env.AWS_REGION as string,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
            },
        });
    }
    return s3Client;
};

export const uploadToS3 = async (
    fileBuffer: Buffer,
    fileName: string,
    folder: string,
    mimeType: string
): Promise<string> => {
    const bucketName = process.env.AWS_S3_BUCKET_NAME as string;
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(fileName);

    // Sanitize folder name
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
    const key = `${safeFolder}/${Date.now()}-${uniqueSuffix}${ext}`;

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
    });

    const client = getS3Client();
    await client.send(command);

    return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};
