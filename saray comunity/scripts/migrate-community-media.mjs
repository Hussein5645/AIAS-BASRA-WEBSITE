import {createHash, randomUUID} from 'node:crypto';

const projectId = 'space-42d87';
const bucket = 'space-42d87.firebasestorage.app';
const accessToken = process.env.FIREBASE_ACCESS_TOKEN || '';
const apply = process.argv.includes('--apply');

if (!accessToken) throw new Error('Set FIREBASE_ACCESS_TOKEN to a current Google OAuth access token.');

const documentsBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const commitUrl = `${documentsBase}:commit`;
const authHeaders = {Authorization:`Bearer ${accessToken}`};

async function api(url, options = {}) {
  const response = await fetch(url, {...options, headers:{...authHeaders, ...(options.headers || {})}, signal:AbortSignal.timeout(120000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `${response.status} ${response.statusText}`);
  return result;
}

async function listDocuments(path) {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL(`${documentsBase}/${path}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const result = await api(url);
    documents.push(...(result.documents || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return documents;
}

const stringValue = field => field?.stringValue || '';
const integerValue = field => Number(field?.integerValue || 0);
const arrayValues = field => field?.arrayValue?.values || [];
const documentId = document => document.name.slice(document.name.lastIndexOf('/') + 1);

function extensionFor(mime) {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
}

async function uploadVerified(name, bytes, contentType) {
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  uploadUrl.searchParams.set('uploadType', 'media');
  uploadUrl.searchParams.set('name', name);
  const uploaded = await api(uploadUrl, {method:'POST', headers:{'Content-Type':contentType}, body:bytes});
  const expectedMd5 = createHash('md5').update(bytes).digest('base64');
  if (uploaded.md5Hash !== expectedMd5 || Number(uploaded.size) !== bytes.length) {
    throw new Error(`Checksum verification failed for ${name}.`);
  }
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`;
  const downloadToken = randomUUID();
  await api(metadataUrl, {
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({metadata:{firebaseStorageDownloadTokens:downloadToken}})
  });
  return {name, downloadURL:`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}?alt=media&token=${downloadToken}`};
}

function parseDataUrl(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(String(value || ''));
  if (!match) return null;
  return {contentType:match[1], bytes:Buffer.from(match[2], 'base64')};
}

async function migrateEmbeddedMedia(collectionPath, storageRoot, mappings) {
  const documents = await listDocuments(collectionPath);
  const results = [];
  for (const document of documents) {
    const id = documentId(document);
    const updates = {};
    const migratedFields = [];
    for (const {source, destination, fileName} of mappings) {
      const parsed = parseDataUrl(stringValue(document.fields?.[source]));
      if (!parsed) continue;
      if (!parsed.bytes.length || parsed.bytes.length > 10 * 1024 * 1024) throw new Error(`Invalid ${source} media size on ${collectionPath}/${id}.`);
      const objectName = `${storageRoot}/${id}/${fileName}`;
      const uploaded = apply ? await uploadVerified(objectName, parsed.bytes, parsed.contentType) : null;
      updates[destination] = {stringValue:uploaded?.downloadURL || objectName};
      migratedFields.push({source, destination});
    }
    if (!migratedFields.length) continue;
    if (apply) {
      const fieldPaths = [];
      for (const item of migratedFields) fieldPaths.push(item.source, item.destination);
      await api(commitUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({writes:[{update:{name:document.name, fields:updates}, updateMask:{fieldPaths}}]})
      });
    }
    results.push({id, fields:migratedFields.map(item => item.source)});
  }
  return {documents:documents.length, migrated:results.length, results};
}

async function migratePost(post) {
  const postId = documentId(post);
  if (arrayValues(post.fields?.imagePaths).length) return {status:'already-migrated', postId};
  const chunks = await listDocuments(`communityPosts/${postId}/images`);
  if (!chunks.length) return {status:'no-media', postId};

  const groups = new Map();
  for (const chunk of chunks) {
    const imageIndex = integerValue(chunk.fields?.imageIndex);
    const values = groups.get(imageIndex) || [];
    values.push({index:integerValue(chunk.fields?.index), data:stringValue(chunk.fields?.data)});
    groups.set(imageIndex, values);
  }
  const mimeTypes = arrayValues(post.fields?.imageMimeTypes).map(stringValue);
  const fallbackMime = stringValue(post.fields?.imageMimeType) || 'image/jpeg';
  const imagePaths = [];
  for (const [imageIndex, values] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const mime = mimeTypes[imageIndex] || fallbackMime;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error(`Unsupported media type on post ${postId}.`);
    const bytes = Buffer.from(values.sort((a, b) => a.index - b.index).map(item => item.data).join(''), 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error(`Invalid media size on post ${postId}.`);
    const name = `community/posts/${postId}/${String(imageIndex).padStart(2, '0')}.${extensionFor(mime)}`;
    imagePaths.push(apply ? (await uploadVerified(name, bytes, mime)).name : name);
  }

  if (apply) {
    const update = {
      name:post.name,
      fields:{
        imagePaths:{arrayValue:{values:imagePaths.map(value => ({stringValue:value}))}},
        mediaCount:{integerValue:String(imagePaths.length)},
        published:{booleanValue:true},
        mediaMigration:{mapValue:{fields:{source:{stringValue:'firestore-chunks'}, legacyChunkCount:{integerValue:String(chunks.length)}, migratedAt:{timestampValue:new Date().toISOString()}}}}
      }
    };
    await api(commitUrl, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({writes:[
        {update, updateMask:{fieldPaths:['imagePaths', 'mediaCount', 'published', 'mediaMigration']}},
        ...chunks.map(chunk => ({delete:chunk.name}))
      ]})
    });
  }
  return {status:apply ? 'migrated' : 'would-migrate', postId, images:imagePaths.length, chunks:chunks.length};
}

const posts = await listDocuments('communityPosts');
const results = [];
for (const post of posts) results.push(await migratePost(post));
const summary = results.reduce((counts, result) => ({...counts, [result.status]:(counts[result.status] || 0) + 1}), {});
const profiles = await migrateEmbeddedMedia('users', 'community/profiles', [
  {source:'photoBase64', destination:'photoURL', fileName:'avatar'},
  {source:'bannerBase64', destination:'bannerURL', fileName:'banner'}
]);
const spaces = await migrateEmbeddedMedia('communitySpaces', 'community/spaces', [
  {source:'imageBase64', destination:'imageURL', fileName:'avatar'},
  {source:'bannerBase64', destination:'bannerURL', fileName:'banner'}
]);
console.log(JSON.stringify({mode:apply ? 'apply' : 'dry-run', posts:posts.length, summary, media:results.filter(item => item.images), profiles, spaces}, null, 2));
