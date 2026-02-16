# 3D Models Firebase Integration Guide

## ✅ ALREADY IMPLEMENTED!

The functionality to save 3D models from the admin dashboard to Firebase is **already fully implemented and working**.

## How It Works

### 1. **Admin Dashboard** (admin-dashboard.html)
Navigate to the "3D Models" tab in your admin dashboard to manage 3D models.

#### Add a New 3D Model:
1. Go to Admin Dashboard → 3D Models tab
2. Fill in the form:
   - **Model Code**: Exactly 10 characters (e.g., "ABCDEFGHIJ")
   - **Model Name**: Display name for the model
   - **Model Date**: Date associated with the model
3. Click "Add 3D Model"
4. The model is automatically saved to Firebase

#### Edit an Existing Model:
1. Click "Edit" button on any existing model
2. Update the fields
3. Click "Update 3D Model"

#### Delete a Model:
1. Click "Delete" button on any model
2. Confirm the deletion

### 2. **Firebase Structure**
Models are stored at: `content/models3d/items/`

Each model document contains:
```json
{
  "code": "Model12345",  // 10-character unique code (case-sensitive, can be upper/lower)
  "name": "Model Name",   // Display name
  "date": "2026-02-16"    // Date in YYYY-MM-DD format
}
```

### 3. **3D Viewer Integration** (3DViewer.html)
The 3D viewer automatically:
1. Loads approved models from Firebase
2. Uses the model code to fetch 3D files from AWS S3
3. Displays the model using the code as the S3 bucket prefix

### 4. **API Functions** (js/firestore-api.js)
Available functions:
- `addModel3D(model)` - Add new 3D model
- `updateModel3D(id, model)` - Update existing model
- `deleteModel3D(id)` - Delete a model
- `isModelCodeTaken(code, excludeId)` - Check code uniqueness
- `getAllContent()` - Get all content including 3D models

## Validation Rules

1. **Code**: Must be exactly 10 characters, can contain upper and lowercase letters, numbers, etc.
2. **Code uniqueness**: Case-insensitive ("Model12345" and "MODEL12345" are considered duplicates)
3. **Name**: Required, minimum 2 characters
4. **Date**: Required, valid date format

## Workflow Example

### Adding a 3D Model:
```
1. Upload 3D file to S3 with prefix "Model12345"
2. Go to Admin Dashboard
3. Add model with code "Model12345", name "Sample Model", date "2026-02-16"
4. Model is saved to Firebase
5. 3D Viewer can now load this model
```

### Viewing the Model:
```
Access: 3DViewer.html?modelId=<firebase-document-id>
Or: 3DViewer.html?model=Model12345 (case-insensitive)
```

## Security

- Model codes are validated for uniqueness
- All inputs are sanitized before saving
- Firebase security rules control write access
- Only approved models are displayed in the viewer

## Testing

To test the functionality:
1. Open the admin dashboard
2. Navigate to "3D Models" tab
3. Add a test model with:
   - Code: "TESTMODEL1"
   - Name: "Test Model"
   - Date: Today's date
4. Verify it appears in the "Existing 3D Models" list
5. Try editing and deleting the model

## Troubleshooting

### Model not saving:
- Check Firebase console for errors
- Verify authentication
- Ensure code is exactly 10 characters
- Check browser console for error messages

### Model not appearing in 3DViewer:
- Verify the model code exists in Firebase
- Check that S3 bucket has files with matching prefix
- Ensure the model code is exactly 10 characters
- Check browser console for loading errors

## Code Examples

### JavaScript: Add a Model Programmatically
```javascript
const firestoreAPI = new FirestoreAPI();

// Add a new model
const result = await firestoreAPI.addModel3D({
  code: "NewModel01",
  name: "My New Model",
  date: "2026-02-16"
});

if (result.success) {
  console.log("Model added with ID:", result.id);
} else {
  console.error("Error:", result.error);
}
```

### JavaScript: Get All Models
```javascript
const content = await firestoreAPI.getAllContent();
console.log("3D Models:", content.content.models3d);
```

## Notes

- The 10-character code is used as the S3 prefix to locate 3D files
- Models are automatically sorted by date (newest first)
- Empty string values are allowed (won't cause errors)
- The viewer supports .gltf, .glb, .jpg, .jpeg, .png formats
