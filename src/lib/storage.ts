import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Uploads a base64 data URI to Firebase Storage and returns the public URL.
 * @param dataUri The base64 data URI (e.g., from a generated image).
 * @param eventId The ID of the event to associate the image with.
 * @returns The public URL of the uploaded image.
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
  const storageRef = ref(storage, `event-images/${eventId}/${Date.now()}.png`);

  try {
    // Upload the string
    const snapshot = await uploadString(storageRef, base64Data, 'base64', {
      contentType: contentType,
    });
    console.log('Uploaded a base64 string!', snapshot);

    // Get the public download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error("Upload failed", error);
    throw new Error("Failed to upload image to Firebase Storage.");
  }
}
