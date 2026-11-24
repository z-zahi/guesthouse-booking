import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../middleware.js';

export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || 'uploads');

let s3;

export async function savePhoto(roomId, buffer, contentType) {
  const key = `rooms/${roomId}/${Date.now()}-${randomUUID().slice(0, 8)}.${contentType === 'image/png' ? 'png' : 'jpg'}`;

  if (process.env.PHOTOS_BUCKET) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const endpoint = process.env.AWS_ENDPOINT_URL;
    s3 ??= new S3Client({ region: process.env.AWS_REGION || 'us-east-1', endpoint, forcePathStyle: Boolean(endpoint) });
    await s3.send(
      new PutObjectCommand({ Bucket: process.env.PHOTOS_BUCKET, Key: key, Body: buffer, ContentType: contentType }),
    );
    const base = process.env.PHOTOS_PUBLIC_URL || endpoint || 'https://s3.amazonaws.com';
    return `${base.replace(/\/$/, '')}/${process.env.PHOTOS_BUCKET}/${key}`;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    return (await put(key, buffer, { access: 'public', contentType })).url;
  }

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new HttpError(503, 'STORAGE_NOT_CONFIGURED', 'Photo storage is not configured on this deployment.');
  }
  const file = key.replaceAll('/', '-');
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, file), buffer);
  return `/uploads/${file}`;
}
