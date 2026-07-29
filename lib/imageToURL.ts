import { supabase } from './supabase';
import { logger } from '@/lib/logger';

export const uploadImage = async (uri: string, fileName: string) => {
  const response = await fetch(uri);
  const blob = await response.blob();

  const { data, error } = await supabase.storage
    .from('driver-documents')
    .upload(fileName, blob, {
      upsert: true,
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
