// Firestore Base64 chunk storage helpers.
import { initializeApp, getApp } from "/js/cloudflare-client.js";
import { getFirestore, doc, collection, getDocs, deleteDoc, setDoc, ref, uploadBytes, getDownloadURL, getStorage, deleteObject } from "/js/cloudflare-client.js";

const firebaseConfig = { projectId: "aias-basra" };
let app;
try { app = getApp(); } catch { app = initializeApp(firebaseConfig); }
const db = getFirestore(app);

export const BASE64_CHUNK_SIZE = 800000;

export function toBase64(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) return reject(new TypeError("toBase64 expects a File."));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

export function createDocumentId(pathArray) {
  return doc(collection(db, ...pathArray)).id;
}

function parentRef(pathArray, docId) { return doc(db, ...pathArray, docId); }

export async function uploadFileChunks(pathArray, docId, subcollectionName, base64Data) {
  if (!Array.isArray(pathArray) || !pathArray.length || !docId || !subcollectionName) {
    throw new Error("A valid parent path, document ID, and subcollection name are required.");
  }
  if (typeof base64Data !== "string") throw new TypeError("base64Data must be a string.");
  const file=await (await fetch(base64Data)).blob();
  const key=[...pathArray,docId,subcollectionName,crypto.randomUUID()].join('/');
  const target=ref(getStorage(),key);
  await uploadBytes(target,file);
  const url=await getDownloadURL(target);
  const chunksRef = collection(parentRef(pathArray, docId), subcollectionName);
  const existing = await getDocs(chunksRef);
  await setDoc(doc(chunksRef,'file'),{data:url,index:0,fileKey:key,storage:'r2'});
  await Promise.all(existing.docs.map(async chunk=>{if(chunk.id!=='file')await deleteDoc(chunk.ref);const old=chunk.data().fileKey;if(old&&old!==key)await deleteObject(ref(getStorage(),old));}));
  // The parent may not exist yet, so this must be a merge write rather than updateDoc.
  await setDoc(parentRef(pathArray, docId), { hasImageChunks: true }, { merge: true });
  return { chunkCount:1, docId };
}

export async function fetchFileChunks(pathArray, docId, subcollectionName) {
  const snapshot = await getDocs(collection(parentRef(pathArray, docId), subcollectionName));
  return snapshot.docs.map(item => item.data())
    .sort((a, b) => Number(a.index) - Number(b.index))
    .map(chunk => chunk.data || "").join("");
}

export { db };
