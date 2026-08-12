
const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = JSON.parse(
  fs.readFileSync("./serviceAccountKey.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// USER TO COPY FROM
const SOURCE_UID = "1bNywI7fUaSeY4P8iigHzNTmTmz1";

// USER TO COMPLETELY REPLACE
const TARGET_UID = "ulRbZQMgCnYZyleFyBY0zGC5McB2";

async function copyDocumentRecursive(sourceRef, targetRef) {
  const sourceSnap = await sourceRef.get();

  if (!sourceSnap.exists) {
    throw new Error(`Source document does not exist: ${sourceRef.path}`);
  }

  // Copy all fields
  await targetRef.set(sourceSnap.data());

  // Copy all subcollections
  const collections = await sourceRef.listCollections();

  for (const collection of collections) {
    const snapshot = await collection.get();

    for (const doc of snapshot.docs) {
      const targetDoc = targetRef
        .collection(collection.id)
        .doc(doc.id);

      await copyDocumentRecursive(doc.ref, targetDoc);
    }
  }
}

async function main() {
  if (SOURCE_UID === TARGET_UID) {
    throw new Error("SOURCE_UID and TARGET_UID cannot be the same.");
  }

  const sourceRef = db.collection("users").doc(SOURCE_UID);
  const targetRef = db.collection("users").doc(TARGET_UID);

  const sourceSnap = await sourceRef.get();

  if (!sourceSnap.exists) {
    throw new Error("Source user does not exist.");
  }

  console.log("SOURCE:", SOURCE_UID);
  console.log("TARGET:", TARGET_UID);

  console.log("Deleting target Firestore data...");

  await db.recursiveDelete(targetRef);

  console.log("Copying source user...");

  await copyDocumentRecursive(sourceRef, targetRef);

  console.log("DONE");
  console.log("Target user has been replaced with source data.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR:");
    console.error(error);
    process.exit(1);
  });