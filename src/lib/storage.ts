import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Uploads a base64 data URI to Firebase Storage and returns the GCS URI.
 * @param dataUri The base64 data URI (e.g., from a generated image).
 * @param eventId The ID of the event to associate the image with.
 * @returns The GCS URI (gs://bucket/path) of the uploaded image.
 */
export async function uploadImageAndGetURL(dataUri: string, eventId: string): Promise<string> {
  if (!dataUri.startsWith('data:image')) {
    throw new Error('Invalid data URI format.');
  }

  // Extract content type and base64 data from the URI
  const matches = dataUri.match(/^data:(.+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Could not parse data URI.');
  }

  const contentType = matches[1];
  const base64Data = matches[2];
  
  // Create a storage reference
  const imageRef = ref(storage, `event-images/${eventId}/${Date.now()}.png`);

  try {
    // Upload the string
    const snapshot = await uploadString(imageRef, base64Data, 'base64', {
      contentType: contentType,
    });
    console.log('Uploaded a base64 string!', snapshot);

    // Return the GCS URI (gs://<bucket>/<path>)
    // This is more robust for cross-service referencing within Firebase
    return `gs://${snapshot.ref.bucket}/${snapshot.ref.fullPath}`;
    
  } catch (error) {
    console.error("Upload failed", error);
    throw new Error("Failed to upload image to Firebase Storage.");
  }
}
