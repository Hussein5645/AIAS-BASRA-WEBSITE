// Firestore Base64 chunk storage helpers.
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, collection, getDocs, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAyLFqSWDyLShllJIoqsr2Jjme47OJTPKQ",
  authDomain: "aias-bsr.firebaseapp.com", projectId: "aias-bsr",
  storageBucket: "aias-bsr.firebasestorage.app", messagingSenderId: "78055223814",
  appId: "1:78055223814:web:99460402c2b1fcd5ae8987"
};
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
  const chunksRef = collection(parentRef(pathArray, docId), subcollectionName);
  const existing = await getDocs(chunksRef);
  await Promise.all(existing.docs.map(chunk => deleteDoc(chunk.ref)));
  let chunkCount = 0;
  for (let start = 0; start < base64Data.length; start += BASE64_CHUNK_SIZE) {
    const index = Math.floor(start / BASE64_CHUNK_SIZE);
    await setDoc(doc(chunksRef, `chunk_${index}`), {
      data: base64Data.slice(start, start + BASE64_CHUNK_SIZE), index
    });
    chunkCount += 1;
  }
  // The parent may not exist yet, so this must be a merge write rather than updateDoc.
  await setDoc(parentRef(pathArray, docId), { hasImageChunks: true }, { merge: true });
  return { chunkCount, docId };
}

export async function fetchFileChunks(pathArray, docId, subcollectionName) {
  const snapshot = await getDocs(collection(parentRef(pathArray, docId), subcollectionName));
  return snapshot.docs.map(item => item.data())
    .sort((a, b) => Number(a.index) - Number(b.index))
    .map(chunk => chunk.data || "").join("");
}

export { db };
