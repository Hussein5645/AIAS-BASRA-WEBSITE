const sourceProject = 'aias-bsr';
const sourceApiKey = 'AIzaSyAyLFqSWDyLShllJIoqsr2Jjme47OJTPKQ';
const destinationProject = 'space-42d87';
const accessToken = process.env.FIREBASE_ACCESS_TOKEN || '';

if (!accessToken) {
  throw new Error('Set FIREBASE_ACCESS_TOKEN to a current Firebase CLI access token.');
}

const sourceBase = `https://firestore.googleapis.com/v1/projects/${sourceProject}/databases/(default)/documents`;
const destinationDatabase = `projects/${destinationProject}/databases/(default)/documents`;
const destinationCommit = `https://firestore.googleapis.com/v1/projects/${destinationProject}/databases/(default)/documents:commit`;

async function listDocuments(path) {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL(`${sourceBase}/${path}`);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('key', sourceApiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
    const result = await response.json();
    if (response.status === 403 || response.status === 401) return [];
    if (!response.ok) throw new Error(`Could not read ${path}: ${result.error?.message || response.status}`);
    documents.push(...(result.documents || []));
    pageToken = result.nextPageToken || '';
  } while (pageToken);
  return documents;
}

function relativePath(document) {
  return document.name.split('/documents/')[1];
}

async function collectCollection(path, children = []) {
  const documents = await listDocuments(path);
  const childCollections = await Promise.all(documents.flatMap(document => {
    const documentPath = relativePath(document);
    return children.map(child => collectCollection(`${documentPath}/${child.name}`, child.children || []));
  }));
  return [...documents, ...childCollections.flat()];
}

const contentItemChildren = [
  {name:'imageChunks'},
  {name:'fileChunks'},
  {name:'images'},
  {name:'gallery'},
  {name:'votes'},
  {name:'comments'}
];

const plans = [
  ['Community posts', () => collectCollection('communityPosts', [{name:'images'}, {name:'votes'}, {name:'comments'}])],
  ['Community spaces', () => collectCollection('communitySpaces', [{name:'connections'}])],
  ['Community settings', () => collectCollection('communitySettings')],
  ['Public user profiles and connections', () => collectCollection('users', [{name:'connections'}, {name:'followers'}, {name:'connectedSpaces'}])],
  ['Usernames', () => collectCollection('usernames')],
  ['Content roots', () => collectCollection('content')],
  ['Events', () => collectCollection('content/events/items', contentItemChildren)],
  ['Library', () => collectCollection('content/library/items', contentItemChildren)],
  ['Magazine', () => collectCollection('content/magazine/articles', contentItemChildren)],
  ['Education', () => collectCollection('content/education/courses', contentItemChildren)],
  ['FBD', () => collectCollection('content/fbd/events', contentItemChildren)],
  ['3D models', () => collectCollection('content/models3d/items', contentItemChildren)]
];

async function commitDocuments(documents) {
  const writes = documents.map(document => ({
    update: {
      name: `${destinationDatabase}/${relativePath(document)}`,
      fields: document.fields || {}
    }
  }));
  const batches = [];
  let batch = [];
  let batchBytes = 0;
  for (const write of writes) {
    const writeBytes = Buffer.byteLength(JSON.stringify(write), 'utf8');
    if (batch.length && (batch.length >= 300 || batchBytes + writeBytes > 7_500_000)) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(write);
    batchBytes += writeBytes;
  }
  if (batch.length) batches.push(batch);

  for (const writesBatch of batches) {
    const body = {
      writes:writesBatch
    };
    const response = await fetch(destinationCommit, {
      method:'POST',
      headers:{Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json'},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(120000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`Destination commit failed: ${result.error?.message || response.status}`);
  }
}

let total = 0;
for (const [label, collect] of plans) {
  const documents = await collect();
  const uniqueDocuments = [...new Map(documents.map(document => [relativePath(document), document])).values()];
  await commitDocuments(uniqueDocuments);
  total += uniqueDocuments.length;
  console.log(`${label}: migrated ${uniqueDocuments.length} documents.`);
}

console.log(`Migrated ${total} publicly readable Firestore documents from ${sourceProject} to ${destinationProject}.`);
