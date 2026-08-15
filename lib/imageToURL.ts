import { supabase } from './supabase';
import { logger } from '@/lib/logger';

// Uploads an image into the driver-documents bucket, scoped under the
// authenticated user's id (H2: user-unscoped paths let one driver's uploads
// collide with another's; upsert:true would silently overwrite). The bucket
// stays public for now — moving to signed URLs is tracked separately.
export const uploadImage = async (uri: string, fileName: string) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? 'anonymous';
  const safeName = fileName.replace(/[^\w.\-]/g, '_');
  const scopedPath = `${userId}/${safeName}`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { data, error } = await supabase.storage
    .from('driver-documents')
    .upload(scopedPath, blob, {
      contentType: blob.type || 'image/jpeg',
    });

  if (error) {
    logger.error('[storage] upload failed', error);
    throw error;
  }

  const { data: publicUrlData } = supabase.storage
    .from('driver-documents')
    .getPublicUrl(data.path);

  const downloadURL = publicUrlData.publicUrl;
  logger.info('[storage] file uploaded', { path: data.path, url: downloadURL });

  return downloadURL;
};
