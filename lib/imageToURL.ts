import { supabase } from './supabase';
import { logger } from "@/lib/logger";

export const uploadImage = async (uri: string, fileName: string) => {
  const response = await fetch(uri);
  const blob = await response.blob();
  logger.info(blob);

  const { data, error } = await supabase.storage
    .from('driver-documents')
    .upload(fileName, blob, {
      upsert: true,
    });

  if (error) {
    logger.error('[storage] upload failed', error);
    throw error;
  }

  const { data: publicUrlData } = supabase.storage
    .from('driver-documents')
    .getPublicUrl(data.path);

  const downloadURL = publicUrlData.publicUrl;
  logger.info('File available at', downloadURL);

  return downloadURL;
};
