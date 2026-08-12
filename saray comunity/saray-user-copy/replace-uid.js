const admin = require("firebase-admin");
const fs = require("fs");

// ========================================
// FIREBASE ADMIN SETUP
// ========================================

const serviceAccount = JSON.parse(
  fs.readFileSync("./serviceAccountKey.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ========================================
// VALUES TO REPLACE
// ========================================

const OLD_UID = "1bNywI7fUaSeY4P8iigHzNTmTmz1";
const NEW_UID = "ulRbZQMgCnYZyleFyBY0zGC5McB2";

// CHANGE TO false FIRST TO TEST
const APPLY_CHANGES = true;


// ========================================
// COUNTERS
// ========================================

let scannedDocuments = 0;
let changedDocuments = 0;
let replacedValues = 0;


// ========================================
// RECURSIVELY REPLACE VALUES
// ========================================

function replaceValue(value) {

  // Exact string match
  if (value === OLD_UID) {
    replacedValues++;

    return {
      value: NEW_UID,
      changed: true,
    };
  }

  // Array
  if (Array.isArray(value)) {
    let changed = false;

    const newArray = value.map((item) => {
      const result = replaceValue(item);

      if (result.changed) {
        changed = true;
      }

      return result.value;
    });

    return {
      value: newArray,
      changed,
    };
  }

  // Object / Map
  if (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof admin.firestore.Timestamp) &&
    !(value instanceof admin.firestore.GeoPoint) &&
    !(value instanceof admin.firestore.DocumentReference) &&
    !Buffer.isBuffer(value)
  ) {
    let changed = false;
    const newObject = {};

    for (const [key, item] of Object.entries(value)) {
      const result = replaceValue(item);

      if (result.changed) {
        changed = true;
      }

      newObject[key] = result.value;
    }

    return {
      value: newObject,
      changed,
    };
  }

  return {
    value,
    changed: false,
  };
}


// ========================================
// PROCESS DOCUMENT
// ========================================

async function processDocument(docRef) {

  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return;
  }

  scannedDocuments++;

  const originalData = snapshot.data();

  const result = replaceValue(originalData);

  if (result.changed) {

    changedDocuments++;

    console.log("");
    console.log("FOUND:");
    console.log(docRef.path);

    if (APPLY_CHANGES) {

      await docRef.set(result.value);

      console.log("✓ UPDATED");

    } else {

      console.log("DRY RUN - NOT CHANGED");
    }
  }

  // Scan subcollections
  const subcollections = await docRef.listCollections();

  for (const subcollection of subcollections) {
    await processCollection(subcollection);
  }
}


// ========================================
// PROCESS COLLECTION
// ========================================

async function processCollection(collectionRef) {

  console.log(`Scanning collection: ${collectionRef.path}`);

  const snapshot = await collectionRef.get();

  for (const doc of snapshot.docs) {
    await processDocument(doc.ref);
  }
}


// ========================================
// SCAN ENTIRE FIRESTORE
// ========================================

async function scanFirestore() {

  console.log("");
  console.log("=========================================");
  console.log("FIRESTORE UID REPLACEMENT");
  console.log("=========================================");
  console.log("");

  console.log("OLD UID:");
  console.log(OLD_UID);

  console.log("");

  console.log("NEW UID:");
  console.log(NEW_UID);

  console.log("");

  console.log(
    APPLY_CHANGES
      ? "MODE: LIVE - DATABASE WILL BE MODIFIED"
      : "MODE: DRY RUN - NO DATA WILL BE MODIFIED"
  );

  console.log("");
  console.log("=========================================");
  console.log("");

  const rootCollections = await db.listCollections();

  for (const collection of rootCollections) {
    await processCollection(collection);
  }

  console.log("");
  console.log("=========================================");
  console.log("FINISHED");
  console.log("=========================================");
  console.log("");

  console.log(`Documents scanned: ${scannedDocuments}`);
  console.log(`Documents containing UID: ${changedDocuments}`);
  console.log(`UID values found: ${replacedValues}`);

  console.log("");

  if (!APPLY_CHANGES) {
    console.log("NO CHANGES WERE MADE.");
    console.log("");
    console.log(
      "If everything looks correct, change APPLY_CHANGES to true and run again."
    );
  } else {
    console.log("DATABASE UPDATED.");
  }

  console.log("");
}


// ========================================
// START
// ========================================

scanFirestore()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {

    console.error("");
    console.error("ERROR:");
    console.error(error);

    process.exit(1);
  });